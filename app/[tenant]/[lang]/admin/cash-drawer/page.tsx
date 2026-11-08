'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { RefreshCw, Wallet } from 'lucide-react';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import SlipPager from '@/components/ui/SlipPager';
import { Barcode, ReceiptRow } from '@/components/marketing/primitives';
import { DARK_KEY, KEY, LedReadout, RegisterPage, Sheet } from '@/components/admin/register-ui';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { useCashDrawerSessions, type CashDrawerSession } from '@/hooks/useCashDrawerSessions';
import { usePermissions } from '@/hooks/usePermissions';
import { getDefaultTenantSettings } from '@/lib/currency';
import { formatDate, formatDateTime, formatTime } from '@/lib/formatting';
import {
  getUserName,
  getUserEmail,
  calculateDifference,
  getStatusLabel,
  getRefreshSuccessMessage,
} from '@/lib/cash-drawer-helpers';

type Dict = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const PAGE_SIZE = 10;

const TH = 'px-3 py-2 align-bottom font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/60';
const TD = 'whitespace-nowrap px-3 py-3 font-receipt text-sm';
/** Cells holding written words rather than printed figures. */
const TD_TEXT = 'whitespace-nowrap px-3 py-3 text-sm';

/** Over reads in teal, short in stamp red, and the sign is always printed so color is never the only cue. */
function Difference({ value }: { value: number | null }) {
  if (value === null) return <span className="text-ink/40">-</span>;
  const tone = value > 0 ? 'text-brand-hover' : value < 0 ? 'text-stamp' : 'text-ink/60';
  return (
    <span className={`font-semibold ${tone}`}>
      {value > 0 ? '+' : value < 0 ? '−' : ''}
      <Currency amount={Math.abs(value)} />
    </span>
  );
}

function StatusTag({ dict, status }: { dict: Dict; status: CashDrawerSession['status'] }) {
  return (
    <span
      className={`inline-block whitespace-nowrap border px-1.5 py-0.5 font-receipt text-[11px] uppercase ${status === 'open' ? 'border-brand bg-brand text-ink' : 'border-ink/25 text-ink/70'}`}
    >
      {getStatusLabel(status, dict)}
    </span>
  );
}

type DateSettings = Parameters<typeof formatDateTime>[1];

/** The closing stamp: just the time when the shift closed on the day it opened. */
const closedAt = (session: CashDrawerSession, settings: DateSettings) =>
  !session.closingTime
    ? ''
    : formatDate(session.closingTime, settings) === formatDate(session.openingTime, settings)
      ? formatTime(session.closingTime, settings)
      : formatDateTime(session.closingTime, settings);

const sessionNo = (session: CashDrawerSession) => `#${session._id.slice(-6).toUpperCase()}`;

export default function CashDrawerPage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Dict>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [selectedSession, setSelectedSession] = useState<CashDrawerSession | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);

  const { sessions, loading, total, totalPages, fetchSessions } = useCashDrawerSessions();
  const { settings } = useTenantSettings();
  const dateSettings = settings || getDefaultTenantSettings();
  const { canAccess } = usePermissions();
  const canView = canAccess('cash_drawer.manage');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchSessions(statusFilter, (error) => toast.error(error), page, PAGE_SIZE).finally(() => setLoadedOnce(true));
  }, [statusFilter, page, fetchSessions]);

  const handleRefresh = async () => {
    setRefreshing(true);
    let failed = false;
    await fetchSessions(statusFilter, (error) => {
      failed = true;
      toast.error(error);
    }, page, PAGE_SIZE);
    if (!failed) {
      toast.success(getRefreshSuccessMessage(dict));
    }
    setRefreshing(false);
  };

  if (!dict || !loadedOnce) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const title = dict.admin?.cashDrawer || 'Cash Drawer';

  if (!canView) {
    return (
      <RegisterPage tagNo="CD" tag={settings?.companyName} title={title}>
        <section className="mt-6 max-w-2xl">
          <div className="border-l-4 border-stamp bg-paper-white px-5 py-4 text-ink">
            <h2 className="text-3xl">{dict.admin?.accessRestricted || 'Access Restricted'}</h2>
            <p className="mt-2 text-sm">
              {dict.admin?.accessRestrictedCashDrawer || "You don't have permission to view cash drawer sessions. Contact an admin or owner."}
            </p>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      </RegisterPage>
    );
  }

  const unknown = dict.common?.unknown || 'Unknown';
  const userLabel = (session: CashDrawerSession) => {
    const name = getUserName(session);
    return name === 'Unknown' ? unknown : name;
  };
  const statusKeys = [
    { value: '', label: dict.admin?.allSessions || 'All Sessions' },
    { value: 'open', label: dict.admin?.openSessions || 'Open Sessions' },
    { value: 'closed', label: dict.admin?.closedSessions || 'Closed Sessions' },
  ];
  const refreshLabel = dict.admin?.cashDrawerRefreshTitle || 'Refresh cash drawer sessions';
  const viewLabel = dict.common?.view || 'View';

  return (
    <RegisterPage
      tagNo="CD"
      tag={settings?.companyName}
      title={title}
      subtitle={dict.admin?.cashDrawerSubtitle || 'Manage and monitor cash drawer operations'}
      side={<LedReadout value={total} label={dict.admin?.cashDrawerSessions || 'Sessions'} />}
    >
      {/* Which sessions to list, and a key to pull the latest */}
      <div className="mt-6 flex gap-2">
        <nav
          aria-label={dict.admin?.filterByStatus || 'Filter by Status'}
          className="grid min-w-0 flex-1 grid-cols-3 border-l border-t border-white/25"
        >
          {statusKeys.map((key) => (
            <button
              key={key.value || 'all'}
              type="button"
              aria-pressed={statusFilter === key.value}
              onClick={() => { setStatusFilter(key.value); setPage(1); }}
              className={`flex min-h-[44px] items-center justify-center border-b border-r border-white/25 px-2 text-center font-receipt text-xs font-medium uppercase transition-colors touch-manipulation ${statusFilter === key.value ? 'bg-paper-white text-ink' : 'text-paper hover:bg-white/10'}`}
            >
              {key.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className={`${DARK_KEY} w-11 shrink-0 px-0`}
          aria-label={refreshLabel}
          title={refreshLabel}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      {/* The drawer log, one line per session */}
      <section className="mt-6" aria-busy={loading}>
        <div className={`bg-paper-white text-ink transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {sessions.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <Wallet className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
              <p className="font-receipt text-sm text-ink/60">{dict.admin?.noCashDrawerSessions || 'No cash drawer sessions found'}</p>
            </div>
          ) : (
            <>
              {/* Up to xl: stacked lines, each opens its count slip */}
              <ul className="divide-y divide-dashed divide-ink/20 xl:hidden">
                {sessions.map((session) => (
                  <li key={session._id}>
                    <button
                      type="button"
                      onClick={() => setSelectedSession(session)}
                      className="block w-full px-4 py-3 text-left transition-colors hover:bg-paper touch-manipulation"
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{userLabel(session)}</span>
                          <span className="mt-0.5 block font-receipt text-xs text-ink/60">
                            {formatDateTime(session.openingTime, dateSettings)}
                            {session.closingTime && ` → ${closedAt(session, dateSettings)}`}
                          </span>
                        </span>
                        {calculateDifference(session) !== null && (
                          <span className="shrink-0 text-right font-receipt">
                            <span className="block text-lg leading-none"><Difference value={calculateDifference(session)} /></span>
                            <span className="mt-1 block text-xs text-ink/60">{dict.admin?.difference || 'Difference'}</span>
                          </span>
                        )}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-receipt text-xs text-ink/60">
                        <StatusTag dict={dict} status={session.status} />
                        <span>{dict.admin?.openingAmount || 'Opening Amount'}: <span className="text-ink"><Currency amount={session.openingAmount} /></span></span>
                        {session.closingAmount !== undefined && (
                          <span>{dict.admin?.closingAmount || 'Closing Amount'}: <span className="text-ink"><Currency amount={session.closingAmount} /></span></span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {/* From xl: the full log */}
              <div className="relative hidden overflow-x-auto xl:block" role="region" aria-label={title} tabIndex={0}>
                <table className="min-w-full">
                  <thead className="border-b border-dashed border-ink/30">
                    <tr>
                      <th scope="col" className={`${TH} text-left`}>{dict.admin?.user || 'User'}</th>
                      <th scope="col" className={`${TH} text-left`}>{dict.admin?.openingTime || 'Opening Time'}</th>
                      <th scope="col" className={`${TH} text-left`}>{dict.admin?.closingTime || 'Closing Time'}</th>
                      <th scope="col" className={`${TH} text-right`}>{dict.admin?.openingAmount || 'Opening Amount'}</th>
                      <th scope="col" className={`${TH} text-right`}>{dict.admin?.expectedAmount || 'Expected Amount'}</th>
                      <th scope="col" className={`${TH} text-right`}>{dict.admin?.closingAmount || 'Closing Amount'}</th>
                      <th scope="col" className={`${TH} text-right`}>{dict.admin?.difference || 'Difference'}</th>
                      <th scope="col" className={`${TH} text-left`}>{dict.admin?.status || 'Status'}</th>
                      <th scope="col" className={TH}><span className="sr-only">{dict.common?.actions || 'Actions'}</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dashed divide-ink/20">
                    {sessions.map((session) => (
                      <tr key={session._id} className="transition-colors hover:bg-paper">
                        <td className={`${TD_TEXT} font-medium`}>{userLabel(session)}</td>
                        <td className={`${TD} text-ink/70`}>{formatDateTime(session.openingTime, dateSettings)}</td>
                        <td className={`${TD} text-ink/70`}>{session.closingTime ? closedAt(session, dateSettings) : '-'}</td>
                        <td className={`${TD} text-right`}><Currency amount={session.openingAmount} /></td>
                        <td className={`${TD} text-right text-ink/70`}>{session.expectedAmount !== undefined ? <Currency amount={session.expectedAmount} /> : '-'}</td>
                        <td className={`${TD} text-right`}>{session.closingAmount !== undefined ? <Currency amount={session.closingAmount} /> : '-'}</td>
                        <td className={`${TD} text-right`}><Difference value={calculateDifference(session)} /></td>
                        <td className={TD}><StatusTag dict={dict} status={session.status} /></td>
                        <td className="px-2 py-1 text-right">
                          <button type="button" onClick={() => setSelectedSession(session)} className={`${KEY} ml-auto`}>
                            {viewLabel}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <SlipPager
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            label={dict.admin?.page || 'Page'}
            previousLabel={dict.common?.previous || 'Previous'}
            nextLabel={dict.common?.next || 'Next'}
          />
        </div>
        <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
      </section>

      {selectedSession && (
        <CountSlip
          session={selectedSession}
          userName={userLabel(selectedSession)}
          dateSettings={dateSettings}
          onClose={() => setSelectedSession(null)}
          dict={dict}
        />
      )}
    </RegisterPage>
  );
}

/** One session printed as the drawer count slip: times, the money in and out, and what was over or short. */
function CountSlip({
  session,
  userName,
  dateSettings,
  onClose,
  dict,
}: {
  session: CashDrawerSession;
  userName: string;
  dateSettings: DateSettings;
  onClose: () => void;
  dict: Dict;
}) {
  const userEmail = getUserEmail(session);
  const difference = calculateDifference(session);
  const closeLabel = dict.common?.close || 'Close';

  return (
    <Sheet
      title={dict.admin?.drawerCount || 'Drawer count'}
      subtitle={[userName, userEmail].filter(Boolean).join(' · ')}
      onClose={onClose}
      closeLabel={closeLabel}
      footer={<button type="button" onClick={onClose} className={KEY}>{closeLabel}</button>}
    >
      <div className="flex items-center justify-between gap-3 font-receipt text-xs uppercase tracking-[0.14em] text-ink/60">
        <span>{sessionNo(session)}</span>
        <StatusTag dict={dict} status={session.status} />
      </div>

      <div className="mt-3 space-y-1.5 font-receipt text-sm">
        <ReceiptRow label={dict.admin?.openingTime || 'Opening Time'} value={formatDateTime(session.openingTime, dateSettings)} />
        {session.closingTime && (
          <ReceiptRow label={dict.admin?.closingTime || 'Closing Time'} value={formatDateTime(session.closingTime, dateSettings)} />
        )}
      </div>

      <div className="mt-4 space-y-1.5 border-t border-dashed border-ink/30 pt-4 font-receipt text-sm">
        <ReceiptRow label={dict.admin?.openingAmount || 'Opening Amount'} value={<Currency amount={session.openingAmount} />} />
        {session.totalDiscounts !== undefined && session.totalDiscounts > 0 && (
          <ReceiptRow label={dict.admin?.totalDiscounts || 'Total Discounts'} value={<>−<Currency amount={session.totalDiscounts} /></>} />
        )}
        {session.totalVAT !== undefined && session.totalVAT > 0 && (
          <ReceiptRow label={dict.admin?.totalVat || 'Total VAT'} value={<Currency amount={session.totalVAT} />} />
        )}
        {session.expectedAmount !== undefined && (
          <ReceiptRow label={dict.admin?.expectedAmount || 'Expected Amount'} value={<Currency amount={session.expectedAmount} />} />
        )}
        {session.closingAmount !== undefined && (
          <ReceiptRow label={dict.admin?.closingAmount || 'Closing Amount'} value={<Currency amount={session.closingAmount} />} />
        )}
      </div>

      {(difference !== null || !!session.shortage || !!session.overage) && (
        <div className="mt-4 space-y-1.5 border-t border-dashed border-ink/30 pt-4 font-receipt">
          {!!session.shortage && session.shortage > 0 && (
            <div className="text-sm text-stamp">
              <ReceiptRow label={dict.admin?.shortage || 'Shortage'} value={<Currency amount={session.shortage} />} />
            </div>
          )}
          {!!session.overage && session.overage > 0 && (
            <div className="text-sm text-brand-hover">
              <ReceiptRow label={dict.admin?.overage || 'Overage'} value={<Currency amount={session.overage} />} />
            </div>
          )}
          {difference !== null && (
            <div className="text-lg">
              <ReceiptRow strong label={dict.admin?.difference || 'Difference'} value={<Difference value={difference} />} />
            </div>
          )}
        </div>
      )}

      {session.notes && (
        <div className="mt-4 border-t border-dashed border-ink/30 pt-4">
          <p className="font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/60">{dict.common?.notes || 'Notes'}</p>
          <p className="mt-1 whitespace-pre-line font-receipt text-sm">{session.notes}</p>
        </div>
      )}

      <Barcode className="mt-5 h-8 w-40 text-ink/80" />
    </Sheet>
  );
}
