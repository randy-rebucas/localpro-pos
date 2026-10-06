'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { showToast } from '@/lib/toast';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { supportsFeature } from '@/lib/business-type-helpers';
import { usePermissions } from '@/hooks/usePermissions';
import { useKitchenTicketStream } from '@/hooks/useKitchenTicketStream';
import { useKitchenTicketActions } from '@/hooks/useKitchenTicketActions';
import {
  getStatusColor,
  getStatusLabel,
  getAllowedNextStatuses,
  type KitchenItemStatus,
} from '@/lib/kitchen-display-helpers';

interface KitchenTicketItem {
  id: string;
  kitchenTicketId: string;
  transactionItemId: string;
  station: string | null;
  status: KitchenItemStatus;
  startedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  transactionItem: { id: string; name: string; quantity: number; price: number } | null;
}

interface KitchenTicket {
  id: string;
  tenantId: string;
  branchId: string | null;
  transactionId: string;
  tableId: string | null;
  orderType: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  items: KitchenTicketItem[];
}

const BOARD_COLUMNS: KitchenItemStatus[] = ['queued', 'preparing', 'ready'];

function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export default function KitchenDisplayPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);

  const { canAccess } = usePermissions();
  const canManage = canAccess('kitchen_display.view');
  const canUpdateStatus = canAccess('kitchen_display.update_status');

  const { settings } = useTenantSettings();
  const kitchenDisplayEnabled = supportsFeature(settings ?? undefined, 'kitchenDisplay');

  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [tableNames, setTableNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isOnline = useOnlineStatus();

  const { updateItemStatus } = useKitchenTicketActions(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await globalThis.fetch(`/api/kitchen-tickets?tenant=${tenant}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setTickets(data.data || []);
      } else {
        setError(data.error || 'Failed to fetch kitchen tickets');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch kitchen tickets');
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  // Tickets only carry a tableId; resolve names so cooks see "T4", not a UUID.
  const fetchTableNames = useCallback(async () => {
    try {
      const res = await globalThis.fetch(`/api/tables?tenant=${tenant}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setTableNames(
          Object.fromEntries((data.data || []).map((t: { id: string; name: string }) => [t.id, t.name]))
        );
      }
    } catch {
      // Non-critical: cards just omit the table line.
    }
  }, [tenant]);

  useEffect(() => {
    if (kitchenDisplayEnabled && canManage) {
      fetchTickets();
      fetchTableNames();
    } else {
      setLoading(false);
    }
  }, [fetchTickets, fetchTableNames, kitchenDisplayEnabled, canManage]);

  useKitchenTicketStream({
    tenant,
    isOnline: isOnline && kitchenDisplayEnabled && canManage,
    onItemUpdate: (update) => {
      setTickets((prev) =>
        prev.map((ticket) =>
          ticket.id !== update.kitchenTicketId
            ? ticket
            : {
                ...ticket,
                items: ticket.items.map((item) =>
                  item.id === update.itemId
                    ? {
                        ...item,
                        status: update.status,
                        station: update.station,
                        startedAt: update.startedAt,
                        readyAt: update.readyAt,
                        servedAt: update.servedAt,
                      }
                    : item
                ),
              }
        )
      );
    },
  });

  const handleAdvance = async (ticketId: string, item: KitchenTicketItem) => {
    const next = getAllowedNextStatuses(item.status).find((s) => s !== item.status && s !== 'cancelled');
    if (!next) return;

    // Optimistic update
    setTickets((prev) =>
      prev.map((ticket) =>
        ticket.id !== ticketId
          ? ticket
          : { ...ticket, items: ticket.items.map((i) => (i.id === item.id ? { ...i, status: next } : i)) }
      )
    );

    await updateItemStatus(
      ticketId,
      item.id,
      next,
      undefined,
      (err) => {
        showToast.error(err);
        fetchTickets();
      }
    );
  };

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  const header = (
    <AdminPageHeader
      title={dict.admin?.kitchenDisplay || 'Kitchen Display'}
      description={canUpdateStatus ? (dict.admin?.kitchenDisplayHint || 'Tap a card to advance it to the next stage') : undefined}
    />
  );

  if (!kitchenDisplayEnabled) {
    return (
      <div className="px-4 sm:px-6 py-6">
        {header}
        <div className="p-3 bg-white border border-win8-warning text-win8-warning text-sm">
          {dict.admin?.kitchenDisplayDisabled || 'Kitchen Display is turned off for this store. Enable it in Settings → Business Features.'}
        </div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="px-4 sm:px-6 py-6">
        {header}
        <div className="p-3 bg-white border border-win8-danger text-win8-danger text-sm">
          {dict.admin?.kitchenDisplayNoPermission || 'You do not have permission to view the Kitchen Display.'}
        </div>
      </div>
    );
  }

  const renderBoard = () => {
    if (loading && tickets.length === 0) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingKitchenTickets || 'Loading kitchen tickets…'}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{error}</p>
          <button
            type="button"
            onClick={() => fetchTickets()}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    // Flatten all non-terminal items across active tickets, grouped by status column.
    const itemsByStatus: Record<KitchenItemStatus, { ticket: KitchenTicket; item: KitchenTicketItem }[]> = {
      queued: [],
      preparing: [],
      ready: [],
      served: [],
      cancelled: [],
    };
    for (const ticket of tickets) {
      for (const item of ticket.items) {
        itemsByStatus[item.status].push({ ticket, item });
      }
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {BOARD_COLUMNS.map((status) => (
          <section key={status} className="bg-white border border-gray-300 flex flex-col min-h-[60vh]">
            <div className="px-4 py-3 bg-brand-navy text-white flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide">{getStatusLabel(status, dict)}</h2>
              <span className="px-2 py-0.5 text-xs font-semibold bg-white/15 tabular-nums">{itemsByStatus[status].length}</span>
            </div>
            <div className="p-3 space-y-3 overflow-y-auto flex-1 bg-gray-50">
              {itemsByStatus[status].length === 0 && (
                <p className="text-sm text-gray-400 italic text-center py-8">{dict.admin?.noKitchenItems || 'No items'}</p>
              )}
              {itemsByStatus[status].map(({ ticket, item }) => {
                const tableName = ticket.tableId ? tableNames[ticket.tableId] : null;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleAdvance(ticket.id, item)}
                    disabled={!canUpdateStatus}
                    className="w-full text-left bg-white border border-gray-300 p-4 hover:border-brand hover:bg-gray-100 disabled:hover:border-gray-300 disabled:hover:bg-white disabled:cursor-default transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`px-2 py-0.5 text-xs font-semibold ${getStatusColor(item.status)}`}>
                        {getStatusLabel(item.status, dict)}
                      </span>
                      {item.station && (
                        <span className="text-xs text-gray-500 uppercase tracking-wide">{item.station}</span>
                      )}
                    </div>
                    <p className="font-semibold text-gray-900">
                      {item.transactionItem?.quantity ? <span className="tabular-nums">{item.transactionItem.quantity}× </span> : null}
                      {item.transactionItem?.name || (dict.admin?.item || 'Item')}
                    </p>
                    {tableName && (
                      <p className="text-xs text-gray-500 mt-1">{dict.admin?.table || 'Table'}: {tableName}</p>
                    )}
                    {ticket.notes && <p className="text-xs text-gray-500 mt-1 italic">{ticket.notes}</p>}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    );
  };

  return (
    <div className="px-4 sm:px-6 py-6">
      {header}
      <div className="space-y-4">
        {!isOnline && (
          <div className="p-3 bg-white border border-win8-warning text-win8-warning text-sm">
            {dict.admin?.kitchenDisplayOffline || 'You are offline. Live updates are paused until the connection returns.'}
          </div>
        )}
        {renderBoard()}
      </div>
    </div>
  );
}
