'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { getDictionaryClient } from '../../dictionaries-client';
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

export default function LedgerPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const { canAccess } = usePermissions();
  const canManage = canAccess('ledger.manage');

  const { settings } = useTenantSettings();
  const ledgerEnabled = supportsFeature(settings ?? undefined, 'accounting');

  const [tab, setTab] = useState<Tab>('accounts');

  const { accounts, loading: accountsLoading, fetchAccounts, createAccount } = useLedgerAccounts(tenant);
  const { entries, loading: entriesLoading, fetchEntries, createManualEntry } = useJournalEntries(tenant);

  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [accountForm, setAccountForm] = useState({ code: '', name: '', type: 'expense' as LedgerAccount['type'] });

  const [showCreateEntry, setShowCreateEntry] = useState(false);
  const [entryMemo, setEntryMemo] = useState('');
  const [entryLines, setEntryLines] = useState<ManualJournalLineInput[]>([
    { accountId: '', debit: 0, credit: 0 },
    { accountId: '', debit: 0, credit: 0 },
  ]);

  const [trialBalance, setTrialBalance] = useState<{ rows: TrialBalanceRow[]; totalDebit: number; totalCredit: number; isBalanced: boolean } | null>(null);
  const [trialBalanceLoading, setTrialBalanceLoading] = useState(false);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchAccounts((error) => toast.error(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === 'entries') fetchEntries((error) => toast.error(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab !== 'trial-balance') return;
    const load = async () => {
      setTrialBalanceLoading(true);
      try {
        const res = await globalThis.fetch(`/api/ledger/reports/trial-balance?tenant=${tenant}`, { credentials: 'include' });
        const data = await res.json();
        if (data.success) {
          setTrialBalance(data.data);
        } else {
          toast.error(data.error || 'Failed to load trial balance');
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load trial balance');
      } finally {
        setTrialBalanceLoading(false);
      }
    };
    load();
  }, [tab, tenant]);

  const lineTotals = useMemo(() => {
    const debit = entryLines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
    const credit = entryLines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
    return { debit, credit, balanced: Math.round(debit * 100) === Math.round(credit * 100) && debit > 0 };
  }, [entryLines]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountForm.code || !accountForm.name) return;
    await createAccount(
      accountForm,
      () => {
        toast.success('Account created successfully');
        setShowCreateAccount(false);
        setAccountForm({ code: '', name: '', type: 'expense' });
      },
      (error) => toast.error(error)
    );
  };

  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lineTotals.balanced) {
      toast.error('Debits and credits must balance before saving');
      return;
    }
    await createManualEntry(
      { memo: entryMemo, lines: entryLines },
      () => {
        toast.success('Journal entry created successfully');
        setShowCreateEntry(false);
        setEntryMemo('');
        setEntryLines([{ accountId: '', debit: 0, credit: 0 }, { accountId: '', debit: 0, credit: 0 }]);
      },
      (error) => toast.error(error)
    );
  };

  const updateLine = (idx: number, patch: Partial<ManualJournalLineInput>) => {
    setEntryLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const addLine = () => setEntryLines((prev) => [...prev, { accountId: '', debit: 0, credit: 0 }]);
  const removeLine = (idx: number) => setEntryLines((prev) => prev.filter((_, i) => i !== idx));

  return (
    <div>
      <div className="px-4 sm:px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            {dict?.admin?.ledger || 'Accounting Ledger'}
          </h1>
          <p className="text-sm text-gray-500">
            {dict?.admin?.ledgerSubtitle || 'Chart of accounts, journal entries, and trial balance'}
          </p>
        </div>

        {!ledgerEnabled && (
          <div className="mb-6 border border-yellow-300 bg-yellow-50 text-yellow-800 px-4 py-3 text-sm">
            Accounting is turned off for this store. Enable it in Settings → Business Features.
          </div>
        )}

        <div className="mb-6 border-b border-gray-200 flex gap-4">
          {([
            { id: 'accounts', label: 'Chart of Accounts' },
            { id: 'entries', label: 'Journal Entries' },
            { id: 'trial-balance', label: 'Trial Balance' },
          ] as { id: Tab; label: string }[]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === t.id ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'accounts' && (
          <div>
            {canManage && (
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  disabled={!ledgerEnabled}
                  onClick={() => ledgerEnabled && setShowCreateAccount(true)}
                  className="px-4 py-2 bg-brand text-white hover:bg-brand-hover transition-colors border border-brand-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Account
                </button>
              </div>
            )}

            {accountsLoading ? (
              <p className="text-gray-500 text-sm">Loading accounts...</p>
            ) : (
              <div className="overflow-x-auto border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Code</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Name</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Type</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">System</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {accounts.map((a) => (
                      <tr key={a.id}>
                        <td className="px-4 py-2 font-mono">{a.code}</td>
                        <td className="px-4 py-2">{a.name}</td>
                        <td className="px-4 py-2 capitalize">{a.type}</td>
                        <td className="px-4 py-2">{a.isSystemAccount ? 'Yes' : 'No'}</td>
                        <td className="px-4 py-2">{a.isActive ? 'Active' : 'Inactive'}</td>
                      </tr>
                    ))}
                    {accounts.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-gray-500">No accounts found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {showCreateAccount && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                <div className="bg-white w-full max-w-md p-6">
                  <h2 className="text-lg font-semibold mb-4">Add Account</h2>
                  <form onSubmit={handleCreateAccount} className="space-y-3">
                    <input
                      type="text"
                      placeholder="Code (e.g. 5030)"
                      value={accountForm.code}
                      onChange={(e) => setAccountForm((f) => ({ ...f, code: e.target.value }))}
                      className="w-full border border-gray-300 px-3 py-2"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Name"
                      value={accountForm.name}
                      onChange={(e) => setAccountForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full border border-gray-300 px-3 py-2"
                      required
                    />
                    <select
                      value={accountForm.type}
                      onChange={(e) => setAccountForm((f) => ({ ...f, type: e.target.value as LedgerAccount['type'] }))}
                      className="w-full border border-gray-300 px-3 py-2"
                    >
                      <option value="asset">Asset</option>
                      <option value="liability">Liability</option>
                      <option value="equity">Equity</option>
                      <option value="revenue">Revenue</option>
                      <option value="expense">Expense</option>
                    </select>
                    <div className="flex justify-end gap-2 pt-2">
                      <button type="button" onClick={() => setShowCreateAccount(false)} className="px-4 py-2 border border-gray-300">
                        Cancel
                      </button>
                      <button type="submit" className="px-4 py-2 bg-brand text-white border border-brand-hover">
                        Save
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'entries' && (
          <div>
            {canManage && (
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  disabled={!ledgerEnabled}
                  onClick={() => ledgerEnabled && setShowCreateEntry(true)}
                  className="px-4 py-2 bg-brand text-white hover:bg-brand-hover transition-colors border border-brand-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  New Manual Entry
                </button>
              </div>
            )}

            {entriesLoading ? (
              <p className="text-gray-500 text-sm">Loading journal entries...</p>
            ) : (
              <div className="overflow-x-auto border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Date</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Memo</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Source</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500">Lines</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-4 py-2">{new Date(entry.entryDate).toLocaleDateString()}</td>
                        <td className="px-4 py-2">{entry.memo || '—'}</td>
                        <td className="px-4 py-2 capitalize">{entry.source.replace('_', ' ')}</td>
                        <td className="px-4 py-2 text-right">{entry.lines.length}</td>
                      </tr>
                    ))}
                    {entries.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-gray-500">No journal entries found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {showCreateEntry && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                <div className="bg-white w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
                  <h2 className="text-lg font-semibold mb-4">New Manual Journal Entry</h2>
                  <form onSubmit={handleCreateEntry} className="space-y-3">
                    <input
                      type="text"
                      placeholder="Memo"
                      value={entryMemo}
                      onChange={(e) => setEntryMemo(e.target.value)}
                      className="w-full border border-gray-300 px-3 py-2"
                    />

                    <div className="space-y-2">
                      {entryLines.map((line, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <select
                            value={line.accountId}
                            onChange={(e) => updateLine(idx, { accountId: e.target.value })}
                            className="flex-1 border border-gray-300 px-2 py-1.5"
                            required
                          >
                            <option value="">Select account…</option>
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Debit"
                            value={line.debit || ''}
                            onChange={(e) => updateLine(idx, { debit: parseFloat(e.target.value) || 0, credit: 0 })}
                            className="w-28 border border-gray-300 px-2 py-1.5"
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Credit"
                            value={line.credit || ''}
                            onChange={(e) => updateLine(idx, { credit: parseFloat(e.target.value) || 0, debit: 0 })}
                            className="w-28 border border-gray-300 px-2 py-1.5"
                          />
                          {entryLines.length > 2 && (
                            <button type="button" onClick={() => removeLine(idx)} className="px-2 py-1.5 text-red-600 border border-red-300">
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <button type="button" onClick={addLine} className="text-sm text-brand underline">
                      + Add line
                    </button>

                    <div className={`text-sm font-medium ${lineTotals.balanced ? 'text-green-600' : 'text-red-600'}`}>
                      Debits: {lineTotals.debit.toFixed(2)} / Credits: {lineTotals.credit.toFixed(2)}{' '}
                      {lineTotals.balanced ? '(balanced)' : '(not balanced)'}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button type="button" onClick={() => setShowCreateEntry(false)} className="px-4 py-2 border border-gray-300">
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!lineTotals.balanced}
                        className="px-4 py-2 bg-brand text-white border border-brand-hover disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Save Entry
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'trial-balance' && (
          <div>
            {trialBalanceLoading || !trialBalance ? (
              <p className="text-gray-500 text-sm">Loading trial balance...</p>
            ) : (
              <div className="overflow-x-auto border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Code</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Account</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500">Debit</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500">Credit</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {trialBalance.rows.map((row) => (
                      <tr key={row.accountId}>
                        <td className="px-4 py-2 font-mono">{row.code}</td>
                        <td className="px-4 py-2">{row.name}</td>
                        <td className="px-4 py-2 text-right">{row.totalDebit.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right">{row.totalCredit.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right">{row.balance.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-semibold">
                    <tr>
                      <td className="px-4 py-2" colSpan={2}>Total</td>
                      <td className="px-4 py-2 text-right">{trialBalance.totalDebit.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{trialBalance.totalCredit.toFixed(2)}</td>
                      <td className={`px-4 py-2 text-right ${trialBalance.isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                        {trialBalance.isBalanced ? 'Balanced' : 'Out of balance'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
