'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import { showToast } from '@/lib/toast';
import { getFetchErrorMessage } from '@/lib/fetch-error';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { supportsFeature } from '@/lib/business-type-helpers';
import { usePermissions } from '@/hooks/usePermissions';
import { useLedgerAccounts, type LedgerAccount } from '@/hooks/useLedgerAccounts';
import { useJournalEntries, type ManualJournalLineInput } from '@/hooks/useJournalEntries';

type Tab = 'accounts' | 'entries' | 'trial-balance';

interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

const ACCOUNT_TYPES: LedgerAccount['type'][] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

const TYPE_BADGE: Record<string, string> = {
  asset: 'bg-win8-info text-white',
  liability: 'bg-win8-suspended text-white',
  equity: 'bg-brand-navy text-white',
  revenue: 'bg-win8-success text-white',
  expense: 'bg-win8-accent text-white',
};

const TYPE_LABEL_KEY: Record<LedgerAccount['type'], [string, string]> = {
  asset: ['ledgerTypeAsset', 'Asset'],
  liability: ['ledgerTypeLiability', 'Liability'],
  equity: ['ledgerTypeEquity', 'Equity'],
  revenue: ['ledgerTypeRevenue', 'Revenue'],
  expense: ['ledgerTypeExpense', 'Expense'],
};

const SOURCE_BADGE: Record<string, string> = {
  manual: 'bg-brand text-white',
  transaction: 'bg-win8-success text-white',
  expense: 'bg-win8-accent text-white',
  cash_drawer: 'bg-win8-warning text-white',
};

const SOURCE_LABEL_KEY: Record<string, [string, string]> = {
  manual: ['ledgerSourceManual', 'Manual'],
  transaction: ['ledgerSourceTransaction', 'Sale'],
  expense: ['ledgerSourceExpense', 'Expense'],
  cash_drawer: ['ledgerSourceCashDrawer', 'Cash Drawer'],
};

const BADGE = 'px-2 py-0.5 text-xs font-semibold';
const ICON_BUTTON = 'inline-flex items-center justify-center p-2.5 text-white hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-[filter]';
const INPUT_CLASS = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white';
const LABEL_CLASS = 'block text-xs font-medium text-gray-600 mb-1';
const PRIMARY_BUTTON = 'px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
const SECONDARY_BUTTON = 'px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors';

const emptyLines = (): ManualJournalLineInput[] => [
  { accountId: '', debit: 0, credit: 0 },
  { accountId: '', debit: 0, credit: 0 },
];

function formatAmount(value: number | string): string {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Spinner() {
  return <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>;
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

export default function LedgerPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const { canAccess } = usePermissions();
  const canCreate = canAccess('ledger.create');
  // Edit + reactivate go through PATCH; deactivating an account is DELETE.
  const canEdit = canAccess('ledger.edit');
  const canDelete = canAccess('ledger.delete');
  const showRowActions = canEdit || canDelete;

  const { settings } = useTenantSettings();
  const ledgerEnabled = supportsFeature(settings ?? undefined, 'accounting');

  const [tab, setTab] = useState<Tab>('accounts');

  const [showInactive, setShowInactive] = useState(false);
  const {
    accounts,
    loading: accountsLoading,
    error: accountsError,
    fetchAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
  } = useLedgerAccounts(tenant, { includeInactive: showInactive });
  const { entries, loading: entriesLoading, error: entriesError, fetchEntries, createManualEntry } = useJournalEntries(tenant);
  const activeAccounts = accounts.filter((acct) => acct.isActive);

  const [showCreateAccount, setShowCreateAccount] = useState(false);
  // Kept on close so the drawer title doesn't flip mid-slide.
  const [editingAccount, setEditingAccount] = useState<LedgerAccount | null>(null);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState({ code: '', name: '', type: 'expense' as LedgerAccount['type'] });
  const [accountFormError, setAccountFormError] = useState<string | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);

  const [showCreateEntry, setShowCreateEntry] = useState(false);
  const [entryMemo, setEntryMemo] = useState('');
  const [entryLines, setEntryLines] = useState<ManualJournalLineInput[]>(emptyLines);
  const [entryFormError, setEntryFormError] = useState<string | null>(null);
  const [savingEntry, setSavingEntry] = useState(false);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  const [trialBalance, setTrialBalance] = useState<{ rows: TrialBalanceRow[]; totalDebit: number; totalCredit: number; isBalanced: boolean } | null>(null);
  const [trialBalanceLoading, setTrialBalanceLoading] = useState(false);
  const [trialBalanceError, setTrialBalanceError] = useState<string | null>(null);

  const a = (key: string, fallback: string): string => dict?.admin?.[key] || fallback;
  const c = (key: string, fallback: string): string => dict?.common?.[key] || fallback;

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // fetchAccounts is rebuilt when showInactive changes, so this also refetches on toggle.
  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    if (tab === 'entries') fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const loadTrialBalance = async () => {
    setTrialBalanceLoading(true);
    setTrialBalanceError(null);
    try {
      const res = await globalThis.fetch(`/api/ledger/reports/trial-balance?tenant=${tenant}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setTrialBalance(data.data);
      } else {
        setTrialBalanceError(data.error || a('ledgerTrialBalanceFailed', 'Failed to load trial balance'));
      }
    } catch (err) {
      setTrialBalanceError(getFetchErrorMessage(err, a('ledgerTrialBalanceFailed', 'Failed to load trial balance')));
    } finally {
      setTrialBalanceLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'trial-balance') loadTrialBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, tenant]);

  const lineTotals = useMemo(() => {
    const debit = entryLines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
    const credit = entryLines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
    return { debit, credit, balanced: Math.round(debit * 100) === Math.round(credit * 100) && debit > 0 };
  }, [entryLines]);

  // Forms reset on open (not close) so the drawer keeps its content while sliding out.
  const openAccountForm = (account: LedgerAccount | null) => {
    setEditingAccount(account);
    setAccountForm(account
      ? { code: account.code, name: account.name, type: account.type }
      : { code: '', name: '', type: 'expense' });
    setAccountFormError(null);
    setShowCreateAccount(true);
  };

  const accountDisplayName = (account: LedgerAccount) => `${account.code} — ${account.name}`;

  const handleDeactivateAccount = async (account: LedgerAccount) => {
    const template = a('ledgerConfirmDeactivate', 'Deactivate account "{name}"? It will be hidden from the chart of accounts and can no longer be used in new entries.');
    if (!confirm(template.replace('{name}', accountDisplayName(account)))) return;
    setBusyAccountId(account.id);
    await deleteAccount(
      account.id,
      (message) => showToast.success(message),
      (error) => showToast.error(error)
    );
    setBusyAccountId(null);
  };

  const handleActivateAccount = async (account: LedgerAccount) => {
    setBusyAccountId(account.id);
    await updateAccount(
      account.id,
      { isActive: true },
      () => showToast.success(a('ledgerAccountActivated', 'Account activated')),
      (error) => showToast.error(error)
    );
    setBusyAccountId(null);
  };

  const openCreateEntry = () => {
    setEntryMemo('');
    setEntryLines(emptyLines());
    setEntryFormError(null);
    setShowCreateEntry(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountForm.code || !accountForm.name) return;
    setAccountFormError(null);
    setSavingAccount(true);
    const onError = (error: string) => setAccountFormError(error);
    if (editingAccount) {
      // The API rejects code/type changes on system accounts; only send the name for those.
      const updates = editingAccount.isSystemAccount ? { name: accountForm.name } : accountForm;
      await updateAccount(
        editingAccount.id,
        updates,
        () => {
          showToast.success(a('ledgerAccountUpdated', 'Account updated successfully'));
          setShowCreateAccount(false);
        },
        onError
      );
    } else {
      await createAccount(
        accountForm,
        () => {
          showToast.success(a('ledgerAccountCreated', 'Account created successfully'));
          setShowCreateAccount(false);
        },
        onError
      );
    }
    setSavingAccount(false);
  };

  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lineTotals.balanced) {
      setEntryFormError(a('ledgerMustBalance', 'Debits and credits must balance before saving'));
      return;
    }
    // Drop untouched blank lines (e.g. an extra "Add Line" left empty) — the
    // server rejects any line without an amount.
    const lines = entryLines.filter((l) => l.accountId || Number(l.debit) || Number(l.credit));
    if (lines.some((l) => !Number(l.debit) && !Number(l.credit))) {
      setEntryFormError(a('ledgerLineNeedsAmount', 'Every line needs a debit or a credit amount.'));
      return;
    }
    if (lines.length < 2) {
      setEntryFormError(a('ledgerNeedsTwoLines', 'A journal entry needs at least two lines.'));
      return;
    }
    setEntryFormError(null);
    setSavingEntry(true);
    await createManualEntry(
      { memo: entryMemo, lines },
      () => {
        showToast.success(a('ledgerEntryCreated', 'Journal entry created successfully'));
        setShowCreateEntry(false);
      },
      (error) => setEntryFormError(error)
    );
    setSavingEntry(false);
  };

  const updateLine = (idx: number, patch: Partial<ManualJournalLineInput>) => {
    setEntryLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const addLine = () => setEntryLines((prev) => [...prev, { accountId: '', debit: 0, credit: 0 }]);
  const removeLine = (idx: number) => setEntryLines((prev) => prev.filter((_, i) => i !== idx));

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  const typeLabel = (type: string) => {
    const entry = TYPE_LABEL_KEY[type as LedgerAccount['type']];
    return entry ? a(entry[0], entry[1]) : type;
  };

  const closeLabel = c('close', 'Close');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'accounts', label: a('ledgerTabAccounts', 'Chart of Accounts') },
    { id: 'entries', label: a('ledgerTabEntries', 'Journal Entries') },
    { id: 'trial-balance', label: a('ledgerTabTrialBalance', 'Trial Balance') },
  ];

  const loadingState = (text: string) => (
    <div className="text-center py-12 bg-white border border-gray-300">
      <Spinner />
      <p className="mt-3 text-gray-400 text-sm">{text}</p>
    </div>
  );

  const errorState = (message: string, retry: () => void) => (
    <div className="text-center py-12 bg-white border border-gray-300">
      <p className="text-win8-danger text-sm font-medium">{message}</p>
      <button
        type="button"
        onClick={retry}
        className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
      >
        {c('retry', 'Retry')}
      </button>
    </div>
  );

  const emptyState = (text: string) => (
    <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">{text}</div>
  );

  const toolbar = (summary: string, action?: React.ReactNode, filters?: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 flex-wrap bg-white border border-gray-300 p-3">
      <div className="flex items-center gap-4 flex-wrap">
        {filters}
        <p className="text-sm text-gray-500 tabular-nums">{summary}</p>
      </div>
      {action}
    </div>
  );

  const renderAccounts = () => {
    const editLabel = c('edit', 'Edit');
    const deactivateLabel = a('ledgerDeactivate', 'Deactivate');
    const activateLabel = a('ledgerActivate', 'Activate');
    let body: React.ReactNode;
    // Only show the spinner on first load; refetches after a save keep the table in place.
    if (accountsLoading && accounts.length === 0) body = loadingState(a('ledgerLoadingAccounts', 'Loading accounts…'));
    else if (accountsError) body = errorState(accountsError, () => fetchAccounts());
    else if (accounts.length === 0) body = emptyState(a('ledgerNoAccounts', 'No accounts yet.'));
    else {
      body = (
        <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-medium">{a('code', 'Code')}</th>
                <th className="px-4 py-3 text-left font-medium">{a('name', 'Name')}</th>
                <th className="px-4 py-3 text-left font-medium">{a('type', 'Type')}</th>
                <th className="px-4 py-3 text-left font-medium">{a('ledgerSystem', 'System')}</th>
                <th className="px-4 py-3 text-left font-medium">{a('status', 'Status')}</th>
                {showRowActions && <th className="px-4 py-3 text-right font-medium">{c('actions', 'Actions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {accounts.map((account) => {
                const busy = busyAccountId === account.id;
                const label = accountDisplayName(account);
                return (
                <tr key={account.id} className="hover:bg-gray-100 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{account.code}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{account.name}</td>
                  <td className="px-4 py-3">
                    <span className={`${BADGE} ${TYPE_BADGE[account.type] || 'bg-gray-500 text-white'}`}>{typeLabel(account.type)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {account.isSystemAccount
                      ? <span className={`${BADGE} bg-gray-500 text-white`}>{a('ledgerSystem', 'System')}</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`${BADGE} ${account.isActive ? 'bg-win8-success' : 'bg-gray-500'} text-white`}>
                      {account.isActive ? a('active', 'Active') : a('inactive', 'Inactive')}
                    </span>
                  </td>
                  {showRowActions && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {canEdit && (<button
                          type="button"
                          onClick={() => openAccountForm(account)}
                          disabled={!ledgerEnabled || busy}
                          title={editLabel}
                          aria-label={`${editLabel}: ${label}`}
                          className={`${ICON_BUTTON} bg-brand`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
                          </svg>
                        </button>)}
                        {account.isActive ? (
                          canDelete && !account.isSystemAccount && (
                            <button
                              type="button"
                              onClick={() => handleDeactivateAccount(account)}
                              disabled={!ledgerEnabled || busy}
                              title={deactivateLabel}
                              aria-label={`${deactivateLabel}: ${label}`}
                              className={`${ICON_BUTTON} bg-win8-danger`}
                            >
                              {busy ? (
                                <span className="win8-spinner win8-spinner-sm"><span /><span /><span /><span /><span /></span>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" />
                                </svg>
                              )}
                            </button>
                          )
                        ) : (
                          canEdit && <button
                            type="button"
                            onClick={() => handleActivateAccount(account)}
                            disabled={!ledgerEnabled || busy}
                            title={activateLabel}
                            aria-label={`${activateLabel}: ${label}`}
                            className={`${ICON_BUTTON} bg-win8-success`}
                          >
                            {busy ? (
                              <span className="win8-spinner win8-spinner-sm"><span /><span /><span /><span /><span /></span>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 5 5L20 7" />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {toolbar(
          (accountsLoading && accounts.length === 0) || accountsError ? '' :`${accounts.length.toLocaleString()} ${a('ledgerAccountsCount', 'accounts')}`,
          canCreate && (
            <button type="button" disabled={!ledgerEnabled} onClick={() => openAccountForm(null)} className={PRIMARY_BUTTON}>
              + {a('ledgerAddAccount', 'Add Account')}
            </button>
          ),
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox-win8"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            {a('ledgerShowInactive', 'Show inactive')}
          </label>
        )}
        {body}
      </div>
    );
  };

  const renderEntries = () => {
    let body: React.ReactNode;
    if (entriesLoading && entries.length === 0) body = loadingState(a('ledgerLoadingEntries', 'Loading journal entries…'));
    else if (entriesError) body = errorState(entriesError, () => fetchEntries());
    else if (entries.length === 0) body = emptyState(a('ledgerNoEntries', 'No journal entries yet.'));
    else {
      body = (
        <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-medium">{a('date', 'Date')}</th>
                <th className="px-4 py-3 text-left font-medium">{a('ledgerMemo', 'Memo')}</th>
                <th className="px-4 py-3 text-left font-medium">{a('ledgerSource', 'Source')}</th>
                <th className="px-4 py-3 text-right font-medium">{a('ledgerAmount', 'Amount')}</th>
                <th className="px-4 py-3 text-right font-medium">{a('ledgerLines', 'Lines')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {entries.map((entry) => {
                const expanded = expandedEntryId === entry.id;
                const amount = entry.lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
                return (
                  <Fragment key={entry.id}>
                    <tr className={`hover:bg-gray-100 transition-colors ${expanded ? 'bg-brand-soft' : ''}`}>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700 tabular-nums">
                        {new Date(entry.entryDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-gray-900 max-w-[320px] truncate" title={entry.memo || undefined}>
                        {entry.memo || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {SOURCE_LABEL_KEY[entry.source] ? (
                          <span className={`${BADGE} ${SOURCE_BADGE[entry.source]}`}>
                            {a(SOURCE_LABEL_KEY[entry.source][0], SOURCE_LABEL_KEY[entry.source][1])}
                          </span>
                        ) : (
                          <span className="text-xs font-mono bg-gray-500 text-white px-1.5 py-0.5">{entry.source.replace(/_/g, ' ')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums font-semibold text-gray-900">
                        {formatAmount(amount)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => setExpandedEntryId(expanded ? null : entry.id)}
                          aria-expanded={expanded}
                          className="text-xs text-brand hover:underline tabular-nums"
                        >
                          {expanded ? a('ledgerHideLines', 'Hide lines') : `${a('ledgerShowLines', 'View lines')} (${entry.lines.length})`}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={5} className="px-4 py-3 bg-gray-100">
                          <div className="bg-white border border-gray-300 p-3 overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-200">
                                  <th className="pb-2 text-left text-xs font-medium text-gray-500">{a('ledgerAccount', 'Account')}</th>
                                  <th className="pb-2 text-right text-xs font-medium text-gray-500">{a('ledgerDebit', 'Debit')}</th>
                                  <th className="pb-2 text-right text-xs font-medium text-gray-500">{a('ledgerCredit', 'Credit')}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {entry.lines.map((line) => (
                                  <tr key={line.id}>
                                    <td className="py-2 pr-3">
                                      {line.account ? (
                                        <>
                                          <span className="font-mono text-xs text-gray-500 mr-2">{line.account.code}</span>
                                          <span className="text-gray-900">{line.account.name}</span>
                                        </>
                                      ) : (
                                        <span className="font-mono text-xs text-gray-500">{line.accountId}</span>
                                      )}
                                      {line.description && <p className="text-xs text-gray-400">{line.description}</p>}
                                    </td>
                                    <td className="py-2 text-right tabular-nums text-gray-900">
                                      {Number(line.debit) ? formatAmount(line.debit) : <span className="text-gray-400">—</span>}
                                    </td>
                                    <td className="py-2 text-right tabular-nums text-gray-900">
                                      {Number(line.credit) ? formatAmount(line.credit) : <span className="text-gray-400">—</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {toolbar(
          (entriesLoading && entries.length === 0) || entriesError ? '' :`${entries.length.toLocaleString()} ${a('ledgerEntriesCount', 'entries')}`,
          canCreate && (
            <button type="button" disabled={!ledgerEnabled} onClick={openCreateEntry} className={PRIMARY_BUTTON}>
              + {a('ledgerNewEntry', 'New Manual Entry')}
            </button>
          )
        )}
        {body}
      </div>
    );
  };

  const renderTrialBalance = () => (
    <div className="space-y-4">
      {toolbar(
        '',
        <button
          type="button"
          onClick={loadTrialBalance}
          disabled={trialBalanceLoading}
          className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors"
        >
          {trialBalanceLoading ? a('ledgerRefreshing', 'Refreshing…') : a('ledgerRefresh', 'Refresh')}
        </button>
      )}
      {renderTrialBalanceBody()}
    </div>
  );

  const renderTrialBalanceBody = () => {
    if (!trialBalance && !trialBalanceError) {
      return loadingState(a('ledgerLoadingTrialBalance', 'Loading trial balance…'));
    }
    if (trialBalanceError || !trialBalance) {
      return errorState(trialBalanceError || a('ledgerTrialBalanceFailed', 'Failed to load trial balance'), loadTrialBalance);
    }
    if (trialBalance.rows.length === 0) {
      return emptyState(a('ledgerNoTrialBalance', 'No account activity yet.'));
    }

    return (
      <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{a('code', 'Code')}</th>
              <th className="px-4 py-3 text-left font-medium">{a('ledgerAccount', 'Account')}</th>
              <th className="px-4 py-3 text-right font-medium">{a('ledgerDebit', 'Debit')}</th>
              <th className="px-4 py-3 text-right font-medium">{a('ledgerCredit', 'Credit')}</th>
              <th className="px-4 py-3 text-right font-medium">{a('ledgerBalance', 'Balance')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {trialBalance.rows.map((row) => (
              <tr key={row.accountId} className="hover:bg-gray-100 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{row.code}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{row.name}</p>
                  <p className="text-xs text-gray-400">{typeLabel(row.type)}</p>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-900">{formatAmount(row.totalDebit)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-900">{formatAmount(row.totalCredit)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{formatAmount(row.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-100 font-semibold border-t border-gray-300">
            <tr>
              <td className="px-4 py-3 text-gray-900" colSpan={2}>{a('total', 'Total')}</td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-900">{formatAmount(trialBalance.totalDebit)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-900">{formatAmount(trialBalance.totalCredit)}</td>
              <td className="px-4 py-3 text-right">
                <span className={`${BADGE} text-white ${trialBalance.isBalanced ? 'bg-win8-success' : 'bg-win8-danger'}`}>
                  {trialBalance.isBalanced ? a('ledgerBalanced', 'Balanced') : a('ledgerNotBalanced', 'Out of balance')}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  return (
    <>
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={a('ledger', 'Accounting Ledger')}
          description={a('ledgerSubtitle', 'Chart of accounts, journal entries, and trial balance')}
        />

        <div className="space-y-4">
          {!ledgerEnabled && (
            <div className="p-3 bg-white border border-win8-warning text-win8-warning text-sm">
              {a('ledgerDisabledNote', 'Accounting is turned off for this store. Enable it in Settings → Business Features.')}
            </div>
          )}

          <div role="tablist" aria-label={a('ledger', 'Accounting Ledger')} className="flex flex-wrap border border-gray-300 bg-white w-fit">
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    active ? 'bg-brand text-white' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div role="tabpanel">
            {tab === 'accounts' && renderAccounts()}
            {tab === 'entries' && renderEntries()}
            {tab === 'trial-balance' && renderTrialBalance()}
          </div>
        </div>
      </div>

      {/* Add / edit account drawer */}
      <Win8Drawer open={showCreateAccount} onClose={() => setShowCreateAccount(false)}>
        <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
          <h2 className="text-base font-semibold">
            {editingAccount ? a('ledgerEditAccount', 'Edit Account') : a('ledgerAddAccount', 'Add Account')}
          </h2>
          <button type="button" onClick={() => setShowCreateAccount(false)} title={closeLabel} aria-label={closeLabel} className="text-white/70 hover:text-white">
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={handleSaveAccount} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
            {editingAccount?.isSystemAccount && (
              <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
                {a('ledgerSystemAccountLocked', 'This is a system account used for automatic posting. Only its name can be changed.')}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="ledger-account-code" className={LABEL_CLASS}>
                  {a('code', 'Code')} <span className="text-win8-danger">*</span>
                </label>
                <input
                  id="ledger-account-code"
                  type="text"
                  placeholder={a('ledgerCodePlaceholder', 'e.g. 5030')}
                  value={accountForm.code}
                  onChange={(e) => setAccountForm((f) => ({ ...f, code: e.target.value }))}
                  disabled={!!editingAccount?.isSystemAccount}
                  className={`${INPUT_CLASS} font-mono disabled:bg-gray-100 disabled:cursor-not-allowed`}
                  required
                />
              </div>
              <div className="col-span-2">
                <label htmlFor="ledger-account-type" className={LABEL_CLASS}>{a('type', 'Type')}</label>
                <select
                  id="ledger-account-type"
                  value={accountForm.type}
                  onChange={(e) => setAccountForm((f) => ({ ...f, type: e.target.value as LedgerAccount['type'] }))}
                  disabled={!!editingAccount?.isSystemAccount}
                  className={`${INPUT_CLASS} disabled:bg-gray-100 disabled:cursor-not-allowed`}
                >
                  {ACCOUNT_TYPES.map((type) => (
                    <option key={type} value={type}>{typeLabel(type)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="ledger-account-name" className={LABEL_CLASS}>
                {a('name', 'Name')} <span className="text-win8-danger">*</span>
              </label>
              <input
                id="ledger-account-name"
                type="text"
                value={accountForm.name}
                onChange={(e) => setAccountForm((f) => ({ ...f, name: e.target.value }))}
                className={INPUT_CLASS}
                required
              />
            </div>
            {accountFormError && <div className="bg-win8-danger text-white text-sm p-3">{accountFormError}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
            <button type="button" onClick={() => setShowCreateAccount(false)} className={SECONDARY_BUTTON}>
              {c('cancel', 'Cancel')}
            </button>
            <button type="submit" disabled={savingAccount} className={PRIMARY_BUTTON}>
              {savingAccount ? c('saving', 'Saving…') : c('save', 'Save')}
            </button>
          </div>
        </form>
      </Win8Drawer>

      {/* New manual journal entry drawer */}
      <Win8Drawer open={showCreateEntry} onClose={() => setShowCreateEntry(false)} widthClass="max-w-2xl">
        <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
          <h2 className="text-base font-semibold">{a('ledgerNewEntryTitle', 'New Manual Journal Entry')}</h2>
          <button type="button" onClick={() => setShowCreateEntry(false)} title={closeLabel} aria-label={closeLabel} className="text-white/70 hover:text-white">
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={handleCreateEntry} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
            <div>
              <label htmlFor="ledger-entry-memo" className={LABEL_CLASS}>
                {a('ledgerMemo', 'Memo')} <span className="text-gray-400 font-normal">({c('optional', 'optional')})</span>
              </label>
              <input
                id="ledger-entry-memo"
                type="text"
                value={entryMemo}
                onChange={(e) => setEntryMemo(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>

            <hr className="border-gray-300" />

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {a('ledgerLines', 'Lines')} <span className="text-win8-danger">*</span>
                </p>
                <button
                  type="button"
                  onClick={addLine}
                  className="px-3 py-1 text-xs border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition-colors"
                >
                  + {a('ledgerAddLine', 'Add Line')}
                </button>
              </div>
              <div className="space-y-2">
                {entryLines.map((line, idx) => {
                  const removeLabel = a('ledgerRemoveLine', 'Remove line');
                  return (
                    <div key={idx} className="flex gap-2 items-center border border-gray-300 p-3">
                      <select
                        value={line.accountId}
                        onChange={(e) => updateLine(idx, { accountId: e.target.value })}
                        aria-label={a('ledgerAccount', 'Account')}
                        className={`${INPUT_CLASS} flex-1 min-w-0`}
                        required
                      >
                        <option value="">{a('ledgerSelectAccount', 'Select account…')}</option>
                        {activeAccounts.map((acct) => (
                          <option key={acct.id} value={acct.id}>{acct.code} — {acct.name}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={a('ledgerDebit', 'Debit')}
                        aria-label={a('ledgerDebit', 'Debit')}
                        value={line.debit || ''}
                        onChange={(e) => updateLine(idx, { debit: parseFloat(e.target.value) || 0, credit: 0 })}
                        className="w-28 border border-gray-300 px-2 py-2 text-sm bg-white tabular-nums"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={a('ledgerCredit', 'Credit')}
                        aria-label={a('ledgerCredit', 'Credit')}
                        value={line.credit || ''}
                        onChange={(e) => updateLine(idx, { credit: parseFloat(e.target.value) || 0, debit: 0 })}
                        className="w-28 border border-gray-300 px-2 py-2 text-sm bg-white tabular-nums"
                      />
                      {entryLines.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          title={removeLabel}
                          aria-label={removeLabel}
                          className="inline-flex items-center justify-center p-2.5 text-white bg-win8-danger hover:brightness-110 transition-[filter]"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-4 text-sm tabular-nums" aria-live="polite">
              <span className="text-gray-600">
                {a('ledgerDebit', 'Debit')}: <span className="font-semibold text-gray-900">{formatAmount(lineTotals.debit)}</span>
              </span>
              <span className="text-gray-600">
                {a('ledgerCredit', 'Credit')}: <span className="font-semibold text-gray-900">{formatAmount(lineTotals.credit)}</span>
              </span>
              <span className={`${BADGE} text-white ${lineTotals.balanced ? 'bg-win8-success' : 'bg-win8-danger'}`}>
                {lineTotals.balanced ? a('ledgerBalanced', 'Balanced') : a('ledgerNotBalanced', 'Out of balance')}
              </span>
            </div>

            {entryFormError && <div className="bg-win8-danger text-white text-sm p-3">{entryFormError}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
            <button type="button" onClick={() => setShowCreateEntry(false)} className={SECONDARY_BUTTON}>
              {c('cancel', 'Cancel')}
            </button>
            <button type="submit" disabled={!lineTotals.balanced || savingEntry} className={PRIMARY_BUTTON}>
              {savingEntry ? c('saving', 'Saving…') : a('ledgerSaveEntry', 'Save Entry')}
            </button>
          </div>
        </form>
      </Win8Drawer>
    </>
  );
}
