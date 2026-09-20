'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { ChefHat } from 'lucide-react';
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

const BOARD_COLUMNS: { status: KitchenItemStatus; title: string }[] = [
  { status: 'queued', title: 'Queued' },
  { status: 'preparing', title: 'Preparing' },
  { status: 'ready', title: 'Ready' },
];

export default function KitchenDisplayPage() {
  const params = useParams();
  const tenant = params.tenant as string;

  const { canAccess } = usePermissions();
  const canManage = canAccess('kitchen_display.manage');

  const { settings } = useTenantSettings();
  const kitchenDisplayEnabled = supportsFeature(settings ?? undefined, 'kitchenDisplay');

  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [loading, setLoading] = useState(true);

  const { updateItemStatus } = useKitchenTicketActions(tenant);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await globalThis.fetch(`/api/kitchen-tickets?tenant=${tenant}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setTickets(data.data || []);
      } else {
        toast.error(data.error || 'Failed to fetch kitchen tickets');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch kitchen tickets');
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    if (kitchenDisplayEnabled && canManage) {
      fetchTickets();
    } else {
      setLoading(false);
    }
  }, [fetchTickets, kitchenDisplayEnabled, canManage]);

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

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
      (error) => {
        toast.error(error);
        fetchTickets();
      }
    );
  };

  if (!kitchenDisplayEnabled) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3">
          Kitchen Display is turned off for this store. Enable it in Settings → Business Features.
        </div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3">
          You do not have permission to view the Kitchen Display.
        </div>
      </div>
    );
  }

  if (loading && tickets.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">Loading kitchen tickets...</p>
        </div>
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
    <div className="px-4 sm:px-6 py-6">
      <div className="mb-6 flex items-center gap-3">
        <ChefHat className="w-7 h-7 text-brand" />
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Kitchen Display</h1>
          <p className="text-sm text-gray-500">Tap a card to advance it to the next stage</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {BOARD_COLUMNS.map((column) => (
          <div key={column.status} className="bg-gray-50 border border-gray-200 rounded-lg flex flex-col min-h-[60vh]">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">{column.title}</h2>
              <span className="text-sm text-gray-500">{itemsByStatus[column.status].length}</span>
            </div>
            <div className="p-3 space-y-3 overflow-y-auto flex-1">
              {itemsByStatus[column.status].length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No items</p>
              )}
              {itemsByStatus[column.status].map(({ ticket, item }) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleAdvance(ticket.id, item)}
                  className="w-full text-left bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-medium px-2 py-1 rounded ${getStatusColor(item.status)}`}>
                      {getStatusLabel(item.status)}
                    </span>
                    {item.station && (
                      <span className="text-xs text-gray-500 uppercase tracking-wide">{item.station}</span>
                    )}
                  </div>
                  <p className="font-semibold text-gray-900">
                    {item.transactionItem?.quantity ? `${item.transactionItem.quantity}x ` : ''}
                    {item.transactionItem?.name || 'Item'}
                  </p>
                  {ticket.tableId && <p className="text-xs text-gray-500 mt-1">Table: {ticket.tableId}</p>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
