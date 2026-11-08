'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Ban, Check, Eye, LayoutGrid, List, Loader2, Plus, Printer, RotateCcw, X } from 'lucide-react';
import { LineTag, ReceiptRow } from '@/components/marketing/primitives';
import Currency from '@/components/Currency';
import FormattedDate from '@/components/FormattedDate';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import TransactionsCatalogSkeleton from '@/components/transactions/TransactionsCatalogSkeleton';
import TransactionFilters, { type ExportFormat, type TransactionFilterLabels } from '@/components/transactions/TransactionFilters';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { usePermissions } from '@/hooks/usePermissions';
import { getDefaultTenantSettings } from '@/lib/currency';
import { formatDate, formatDateTime } from '@/lib/formatting';
import { hardwareService } from '@/lib/hardware';
import { showToast } from '@/lib/toast';
import {
  EMPTY_TRANSACTION_FILTERS,
  transactionFilterQuery,
  useTransactionsCatalog,
  type TransactionFilterValues,
  type CatalogTransaction,
  type CatalogExpense,
  type CatalogView,
} from '@/hooks/useTransactionsCatalog';
import type { TranslationDict } from '@/types/dictionary';
import { receiptStoreInfo } from '@/lib/receipt-store-info';
import { getTenantDateString } from '@/lib/timezone';

type Transaction = CatalogTransaction;
type Expense = CatalogExpense;

type ViewType = CatalogView;

const ICON = 'h-[18px] w-[18px]';
const FIELD = 'w-full border border-ink/25 bg-paper-white px-3 py-2 font-receipt text-sm text-ink placeholder:text-ink/50 focus:border-ink focus:outline-none';
const LABEL = 'mb-1 block font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/70';
const KEY = 'flex min-h-[44px] flex-1 items-center justify-center gap-2 px-4 font-receipt text-sm font-medium uppercase transition-colors touch-manipulation disabled:cursor-not-allowed disabled:opacity-50';
const KEY_PRIMARY = `${KEY} bg-ink text-paper-white hover:bg-brand-navy`;
const KEY_SECONDARY = `${KEY} border border-ink/25 text-ink hover:border-ink`;
const KEY_STAMP = `${KEY} bg-stamp text-paper-white hover:brightness-110`;
const ERROR_NOTE = 'border border-stamp px-3 py-2 font-receipt text-sm text-stamp';

const receiptNo = (transaction: Transaction) => transaction.receiptNumber || transaction._id.slice(-8);

const personName = (value: Transaction['customerId'] | Transaction['userId']) => {
  if (!value || typeof value === 'string') return '';
  return 'name' in value ? value.name : [value.firstName, value.lastName].filter(Boolean).join(' ');
};

const TAG_TONES = {
  plain: 'border-ink/25 text-ink/70',
  stamp: 'border-stamp font-semibold text-stamp',
  void: 'border-dashed border-ink/40 text-ink/60',
  inverse: 'border-ink bg-ink text-paper-white',
} as const;

function Tag({ tone, children }: { tone: keyof typeof TAG_TONES; children: ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap border px-2 py-0.5 font-receipt text-xs uppercase ${TAG_TONES[tone]}`}>
      {children}
    </span>
  );
}

function StatusTag({ status, label }: { status: Transaction['status']; label?: ReactNode }) {
  const tone = status === 'completed' ? 'plain' : status === 'refunded' ? 'stamp' : 'void';
  return <Tag tone={tone}>{label || status}</Tag>;
}

/** Money paid out of the drawer, as opposed to a sale. */
function PaidOut({ amount, className = '' }: { amount: number; className?: string }) {
  return <span className={`whitespace-nowrap ${className}`}>&minus;<Currency amount={amount} /></span>;
}

function SlipModal({ title, closeLabel, onClose, wide = false, children }: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className={`my-6 w-full ${wide ? 'max-w-lg' : 'max-w-md'}`}>
        <div className="bg-paper-white text-ink">
          <div className="flex items-start justify-between gap-4 border-b border-dashed border-ink/30 px-5 py-4">
            <h2 className="text-4xl">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 -mt-1 flex min-h-[44px] w-11 shrink-0 items-center justify-center text-ink transition-colors hover:bg-paper"
              aria-label={closeLabel}
            >
              <X className={ICON} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
          {children}
        </div>
        <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
      </div>
    </div>
  );
}

function DoneNote({ message, note, closeLabel, onClose }: {
  message?: string;
  note?: string;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="px-5 py-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center border-2 border-ink">
        <Check className="h-6 w-6" strokeWidth={1.75} aria-hidden />
      </div>
      <p className="text-base font-semibold">{message}</p>
      {note && <p className="mt-1 text-sm text-ink/60">{note}</p>}
      <button type="button" onClick={onClose} className={`${KEY_PRIMARY} mx-auto mt-4 max-w-40`}>
        {closeLabel}
      </button>
    </div>
  );
}

interface ExportRow {
  date: string;
  type: string;
  receipt: string;
  description: string;
  status: string;
  customer: string;
  cashier: string;
  items: string | number;
  payment: string;
  subtotal: string | number;
  discount: string | number;
  tax: string | number;
  total: number;
  cash: string | number;
  change: string | number;
}

function SaveIcon({ loading }: { loading: boolean }) {
  const Icon = loading ? Loader2 : Check;
  return <Icon className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} strokeWidth={1.75} aria-hidden />;
}

interface TransactionsWorkspaceProps {
  /** Show an access notice to anyone without `transactions.view` (the admin console asks for it). */
  requireView?: boolean;
}

/**
 * The transactions journal on the dark till backdrop: sales and expenses, filters, export,
 * the detail drawer, void, refund and manual entry. Pages supply the surrounding shell
 * (navbar or admin console) and the `bg-brand-navy-deep` surface it sits on.
 */
export default function TransactionsWorkspace({ requireView = false }: TransactionsWorkspaceProps) {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [page, setPage] = useState(1);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [adjustTransaction, setAdjustTransaction] = useState<Transaction | null>(null);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustError, setAdjustError] = useState('');
  const [adjustSuccess, setAdjustSuccess] = useState(false);

  // Manual transaction modal
  const [showAddModal, setShowAddModal] = useState(false);
  interface ManualLineItem { name: string; price: string; quantity: string; }
  const emptyItem = (): ManualLineItem => ({ name: '', price: '', quantity: '1' });
  const [manualItems, setManualItems] = useState<ManualLineItem[]>([emptyItem()]);
  const [manualPayment, setManualPayment] = useState<'cash' | 'card' | 'digital'>('cash');
  const [manualCash, setManualCash] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState('');
  const [manualSuccess, setManualSuccess] = useState(false);
  // Regenerated each time the modal opens/succeeds so a client retry after a
  // dropped response reuses the same key (server dedupes), but a genuinely
  // new manual entry gets a fresh one.
  const [manualIdempotencyKey, setManualIdempotencyKey] = useState('');

  // Manual expense modal
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseName, setExpenseName] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  // Store day, not the UTC day (seeded with the default zone; reset uses the store's)
  const [expenseDate, setExpenseDate] = useState(() => getTenantDateString());
  const [expensePayment, setExpensePayment] = useState<'cash' | 'card' | 'digital' | 'other'>('cash');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [expenseError, setExpenseError] = useState('');
  const [expenseSuccess, setExpenseSuccess] = useState(false);

  // Void
  const [voidTransaction, setVoidTransaction] = useState<Transaction | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidError, setVoidError] = useState('');
  const [voidSuccess, setVoidSuccess] = useState(false);

  const [viewType, setViewType] = useState<ViewType>('all');
  const [filters, setFilters] = useState<TransactionFilterValues>(EMPTY_TRANSACTION_FILTERS);
  const [filterOptions, setFilterOptions] = useState<{ cashiers: { _id: string; name: string }[]; branches: { _id: string; name: string }[] }>({ cashiers: [], branches: [] });
  const [exporting, setExporting] = useState(false);
  const [displayMode, setDisplayMode] = useState<'grid' | 'list'>('list');
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const { settings: tenantSettings } = useTenantSettings();
  const { canAccess } = usePermissions();
  // Mirror the backend's refunds.process / expenses.manage permission checks so the UI doesn't
  // offer an action the API will reject — respects tenant-configured role overrides.
  const canRefund = canAccess('refunds.process');
  const canManageExpenses = canAccess('expenses.manage');
  const canVoid = canAccess('transactions.edit');
  const canExport = canAccess('reports.view');
  const canView = canAccess('transactions.view');
  // Manual entry is its own permission; hide the key instead of failing with a 403 after the form
  const canCreateManual = canAccess('transactions.create_manual');

  const {
    items,
    totalPages,
    status,
    error,
    refetch,
    updateTransactionStatus,
  } = useTransactionsCatalog(tenant, page, viewType, filters);

  const txText = (key: string, fallback: string) => (dict?.transactions?.[key] as string | undefined) || fallback;

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    let current = true;
    fetch(`/api/transactions/filters?tenant=${tenant}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => { if (current && data.success) setFilterOptions(data.data); })
      .catch(() => { /* the filter panel works without these two lists */ });
    return () => { current = false; };
  }, [tenant]);

  // Initialize hardware config from localStorage or tenant settings
  useEffect(() => {
    if (!tenant) return;
    const stored = localStorage.getItem(`hardware_config_${tenant}`);
    if (stored) {
      try {
        hardwareService.setConfig(JSON.parse(stored));
      } catch { /* ignore */ }
    } else if (tenantSettings?.hardwareConfig) {
      hardwareService.setConfig(tenantSettings.hardwareConfig);
    }
  }, [tenant, tenantSettings]);

  // Load display mode from localStorage
  useEffect(() => {
    const savedDisplayMode = localStorage.getItem(`transactionsDisplayMode_${tenant}`);
    if (savedDisplayMode === 'list' || savedDisplayMode === 'grid') {
      setDisplayMode(savedDisplayMode);
    }
  }, [tenant]);

  // Save display mode to localStorage
  useEffect(() => {
    localStorage.setItem(`transactionsDisplayMode_${tenant}`, displayMode);
  }, [displayMode, tenant]);

  const doRefund = async () => {
    if (!adjustTransaction) return;
    setAdjustLoading(true);
    setAdjustError('');
    try {
      const res = await fetch(`/api/transactions/${adjustTransaction._id}/refund?tenant=${tenant}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: adjustReason, notes: adjustNotes }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setAdjustError(data.error || txText('refundFailed', 'Refund failed'));
      } else {
        setAdjustSuccess(true);
        refetch();
        updateTransactionStatus(adjustTransaction._id, 'refunded');
      }
    } catch {
      setAdjustError(txText('networkError', 'Network error. Please try again.'));
    } finally {
      setAdjustLoading(false);
    }
  };

  const openVoidModal = (transaction: Transaction) => {
    setVoidTransaction(transaction);
    setVoidReason('');
    setVoidError('');
    setVoidSuccess(false);
  };

  const doVoid = async () => {
    if (!voidTransaction) return;
    setVoidLoading(true);
    setVoidError('');
    try {
      const res = await fetch(`/api/transactions/${voidTransaction._id}?tenant=${tenant}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'cancelled', reason: voidReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setVoidError(data.error || txText('voidFailed', 'The sale could not be voided'));
      } else {
        setVoidSuccess(true);
        updateTransactionStatus(voidTransaction._id, 'cancelled');
        refetch();
      }
    } catch {
      setVoidError(txText('networkError', 'Network error. Please try again.'));
    } finally {
      setVoidLoading(false);
    }
  };

  const openAdjustModal = (transaction: Transaction) => {
    setAdjustTransaction(transaction);
    setAdjustReason('');
    setAdjustNotes('');
    setAdjustError('');
    setAdjustSuccess(false);
  };

  const closeAdjustModal = () => {
    setAdjustTransaction(null);
    setAdjustReason('');
    setAdjustNotes('');
    setAdjustError('');
    setAdjustSuccess(false);
  };

  const submitManualTransaction = async () => {
    setManualLoading(true);
    setManualError('');
    try {
      const parsedItems = manualItems.map((it) => ({
        name: it.name.trim(),
        price: parseFloat(it.price),
        quantity: parseInt(it.quantity, 10),
      }));

      // client-side validation
      for (const it of parsedItems) {
        if (!it.name) { setManualError(txText('itemNameRequired', 'Each item must have a name.')); setManualLoading(false); return; }
        if (isNaN(it.price) || it.price < 0) { setManualError(txText('invalidItemPrice', 'Invalid price for "{name}".').replace('{name}', it.name)); setManualLoading(false); return; }
        if (isNaN(it.quantity) || it.quantity < 1) { setManualError(txText('invalidItemQuantity', 'Invalid quantity for "{name}".').replace('{name}', it.name)); setManualLoading(false); return; }
      }

      const body: Record<string, unknown> = {
        items: parsedItems,
        paymentMethod: manualPayment,
        notes: manualNotes || undefined,
        idempotencyKey: manualIdempotencyKey || crypto.randomUUID(),
      };
      if (manualPayment === 'cash' && manualCash) body.cashReceived = parseFloat(manualCash);

      const res = await fetch(`/api/transactions/manual?tenant=${tenant}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setManualError(data.error || txText('createTransactionFailed', 'Failed to create transaction'));
      } else {
        setManualSuccess(true);
        setManualIdempotencyKey(crypto.randomUUID());
        refetch();
      }
    } catch {
      setManualError(txText('networkError', 'Network error. Please try again.'));
    } finally {
      setManualLoading(false);
    }
  };

  const submitManualExpense = async () => {
    setExpenseLoading(true);
    setExpenseError('');
    try {
      if (!expenseName.trim()) { setExpenseError(txText('expenseNameRequired', 'Name is required.')); setExpenseLoading(false); return; }
      if (!expenseDescription.trim()) { setExpenseError(txText('expenseDescriptionRequired', 'Description is required.')); setExpenseLoading(false); return; }
      const parsedAmount = parseFloat(expenseAmount);
      if (isNaN(parsedAmount) || parsedAmount < 0) { setExpenseError(txText('expenseAmountRequired', 'A valid amount is required.')); setExpenseLoading(false); return; }

      const res = await fetch(`/api/expenses?tenant=${tenant}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: expenseName.trim(),
          description: expenseDescription.trim(),
          amount: parsedAmount,
          date: expenseDate || getTenantDateString(tenantSettings?.timezone),
          paymentMethod: expensePayment,
          notes: expenseNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setExpenseError(data.error || txText('createExpenseFailed', 'Failed to create expense'));
      } else {
        setExpenseSuccess(true);
        refetch();
      }
    } catch {
      setExpenseError(txText('networkError', 'Network error. Please try again.'));
    } finally {
      setExpenseLoading(false);
    }
  };

  const formatDateForReceipt = (dateString: string) => {
    const settingsValue = tenantSettings || getDefaultTenantSettings();
    return formatDateTime(dateString, settingsValue);
  };

  const printReceipt = async (transaction: Transaction) => {
    if (!dict) return;
    const settings = tenantSettings;
    const isScPwd = transaction.discountCategory === 'senior' || transaction.discountCategory === 'pwd';
    const taxEnabled = settings?.taxEnabled && settings?.taxRate;
    // What was charged at the time, so a later change to the tax settings can't rewrite an old receipt.
    // SC/PWD transactions are fully VAT-exempt (RA 9994 / RA 10754) — never taxed
    const taxAmount = isScPwd ? 0 : (transaction.taxAmount || undefined);
    const isVAT = !isScPwd && !!(taxEnabled && (settings?.taxLabel || '').toUpperCase().includes('VAT'));
    const cashierName = typeof transaction.userId === 'object' ? transaction.userId?.name : undefined;

    const receiptData = {
      storeName: settings?.companyName || dict.pos.receiptTitle || 'POS SYSTEM',
      ...receiptStoreInfo(settings),
      receiptNumber: transaction.receiptNumber || transaction._id.slice(-8),
      date: formatDateForReceipt(transaction.createdAt),
      items: transaction.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.subtotal,
        taxable: isScPwd ? false : undefined,
      })),
      subtotal: transaction.subtotal ?? transaction.total,
      discount: transaction.discountAmount,
      tax: taxAmount,
      taxLabel: settings?.taxLabel,
      taxRate: settings?.taxRate,
      zeroRatedSales: transaction.zeroRatedAmount || 0,
      total: transaction.total,
      paymentMethod: transaction.paymentMethod,
      cashReceived: transaction.cashReceived,
      change: transaction.change,
      footer: dict.pos.thankYou || 'Thank you for your business!',
      cashierName,
      // BIR compliance
      tin: settings?.birTin,
      businessStyle: settings?.birBusinessStyle,
      ptuNumber: settings?.birPtuNumber,
      ptuDate: settings?.birPtuIssuedDate ? formatDate(settings.birPtuIssuedDate, settings) : undefined,
      ptuValidUntil: settings?.birPtuExpiryDate ? formatDate(settings.birPtuExpiryDate, settings) : undefined,
      minNumber: settings?.birMinNumber,
      terminalSN: transaction.deviceSerialNumber || settings?.birTerminalSN,
      terminalId: transaction.terminalId,
      systemProvider: settings?.birSystemProvider,
      accreditationNo: settings?.birAccreditationNo,
      accreditationDate: settings?.birAccreditationDate ? formatDate(settings.birAccreditationDate, settings) : undefined,
      accreditationValidUntil: settings?.birAccreditationValidUntil ? formatDate(settings.birAccreditationValidUntil, settings) : undefined,
      isVAT,
      // Senior Citizen / PWD discount block
      scPwdName: isScPwd ? transaction.scPwdName : undefined,
      scPwdId: isScPwd ? transaction.scPwdId : undefined,
      scPwdDiscount: isScPwd ? (transaction.discountAmount ?? 0) - (transaction.vatRemovedAmount ?? 0) : undefined,
    };
    const printFailed = dict.pos?.printFailed || 'Receipt could not be printed. Check printer settings.';
    try {
      if (!(await hardwareService.printReceipt(receiptData))) showToast.error(printFailed);
    } catch (err) {
      console.error('Failed to print receipt:', err);
      showToast.error(printFailed);
    }
  };

  if (!dict) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <LoadingSpinner size="md" color="#8fe3d0" />
      </div>
    );
  }

  const txDict = dict.transactions ?? {};

  if (requireView && !canView) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <h1 className="text-5xl text-paper-white sm:text-6xl lg:text-7xl">{txDict.title || 'Transactions'}</h1>
        <section className="mt-6 max-w-2xl">
          <div className="border-l-4 border-stamp bg-paper-white px-5 py-4 text-ink">
            <h2 className="text-3xl">{dict.admin?.accessRestricted || 'Access Restricted'}</h2>
            <p className="mt-2 text-sm">
              {dict.admin?.accessRestrictedTransactions || "You don't have permission to view transactions. Contact an admin or owner."}
            </p>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      </div>
    );
  }
  const closeLabel = dict.common?.close || 'Close';
  const paymentLabel = (method: string) =>
    dict.pos?.[method] || (method === 'other' ? txDict.reasonOther || 'Other' : method);
  const itemCount = (transaction: Transaction) =>
    `${transaction.items.length} ${transaction.items.length === 1 ? txDict.item : txDict.items}`.toLowerCase();

  const openExpenseModal = () => {
    setShowExpenseModal(true);
    setExpenseName('');
    setExpenseDescription('');
    setExpenseAmount('');
    setExpenseDate(getTenantDateString(tenantSettings?.timezone));
    setExpensePayment('cash');
    setExpenseNotes('');
    setExpenseError('');
    setExpenseSuccess(false);
  };

  const openManualModal = () => {
    setShowAddModal(true);
    setManualItems([emptyItem()]);
    setManualPayment('cash');
    setManualCash('');
    setManualNotes('');
    setManualError('');
    setManualSuccess(false);
    setManualIdempotencyKey(crypto.randomUUID());
  };

  const updateFilters = (patch: Partial<TransactionFilterValues>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const filterLabels: TransactionFilterLabels = {
    search: txDict?.searchPlaceholder || 'Search receipt, customer or expense…',
    filters: txDict?.filters || 'Filters',
    clear: txDict?.clearFilters || 'Clear filters',
    from: txDict?.fromDate || 'From',
    to: txDict?.toDate || 'To',
    status: txDict.status || 'Status',
    payment: txDict?.payment || 'Payment',
    cashier: txDict?.cashier || 'Cashier',
    branch: txDict?.branch || 'Branch',
    any: txDict?.anyOption || 'Any',
    export: txDict?.exportLabel || 'Export',
    statuses: { completed: txDict.completed || 'Completed', refunded: txDict.refunded || 'Refunded', cancelled: txDict.cancelled || 'Cancelled' },
    payments: {
      cash: paymentLabel('cash'),
      card: paymentLabel('card'),
      digital: paymentLabel('digital'),
      on_account: dict.pos?.onAccount || 'On account',
      other: paymentLabel('other'),
    },
  };
  const filtersActive = Object.values(filters).some(Boolean);

  const exportView = async (format: ExportFormat) => {
    setExporting(true);
    try {
      const res = await fetch(`/api/transactions/export?${transactionFilterQuery(viewType, filters)}&tenant=${tenant}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast.error(data.error || txText('exportFailed', 'The export could not be created'));
        return;
      }

      const settingsValue = tenantSettings || getDefaultTenantSettings();
      const columns: [string, (row: ExportRow) => string | number][] = [
        [txDict.date || 'Date', (row) => formatDateTime(row.date, settingsValue)],
        [txDict.type || 'Type', (row) => (row.type === 'expense' ? txDict.expense || 'Expense' : txDict.sale || 'Sale')],
        [txDict?.receipt || 'Receipt', (row) => row.receipt],
        [txDict?.description || 'Description', (row) => row.description],
        [txDict.status || 'Status', (row) => (row.status ? txDict[row.status] || row.status : '')],
        [txDict?.customer || 'Customer', (row) => row.customer],
        [txDict?.cashier || 'Cashier', (row) => row.cashier],
        [txDict.items || 'Items', (row) => row.items],
        [txDict.payment || 'Payment', (row) => paymentLabel(row.payment)],
        [txDict?.subtotal || 'Subtotal', (row) => row.subtotal],
        [txDict?.discount || 'Discount', (row) => row.discount],
        [txDict?.tax || 'Tax', (row) => row.tax],
        [dict.common.total || 'Total', (row) => row.total],
        [txDict.cash || 'Cash', (row) => row.cash],
        [txDict.change || 'Change', (row) => row.change],
      ];
      // A page is too narrow for every column, so the PDF keeps the ones people read
      const pdfColumns = new Set([0, 2, 4, 8, 12]);
      const used = format === 'pdf' ? columns.filter((_, index) => pdfColumns.has(index)) : columns;
      const headers = used.map(([label]) => label);
      const rows = (data.data as ExportRow[]).map((row) => Object.fromEntries(used.map(([label, read]) => [label, read(row)])));

      const filename = `transactions-${new Date().toISOString().slice(0, 10)}.${format}`;
      const { arrayToCSV, downloadCSV, downloadExcel, downloadPDF } = await import('@/lib/export');
      if (format === 'csv') downloadCSV(`\uFEFF${arrayToCSV(rows, headers)}`, filename);
      else if (format === 'xlsx') await downloadExcel(rows, headers, filename);
      else await downloadPDF(rows, headers, filename, txDict.title || 'Transactions');

      if (data.truncated) {
        showToast.info(
          txText('exportTruncated', 'Exported the newest {shown} of {total}. Narrow the dates to get the rest.')
            .replace('{shown}', String(rows.length))
            .replace('{total}', String(data.total))
        );
      }
    } catch (err) {
      console.error('Failed to export transactions:', err);
      showToast.error(txText('exportFailed', 'The export could not be created'));
    } finally {
      setExporting(false);
    }
  };

  const voidable = (transaction: Transaction) =>
    canVoid && transaction.status === 'completed' && !transaction.refundCount && (!transaction.salesChannel || transaction.salesChannel === 'pos');

  const closeDrawer = () => {
    setSelectedTransaction(null);
    setSelectedExpense(null);
  };

  const viewTransaction = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setSelectedExpense(null);
  };

  const viewExpense = (expense: Expense) => {
    setSelectedExpense(selectedExpense?._id === expense._id ? null : expense);
    setSelectedTransaction(null);
  };

  const manualTotal = manualItems.reduce((sum, it) => {
    const p = parseFloat(it.price);
    const q = parseInt(it.quantity, 10);
    return sum + (isNaN(p) || isNaN(q) ? 0 : p * q);
  }, 0);
  const manualChange = parseFloat(manualCash) - manualTotal;

  const keyWidth = (canRefund ? 3 : 2) * 44 + 2;
  const viewTypes: { view: ViewType; label: string }[] = [
    { view: 'all', label: txDict?.all || 'All' },
    { view: 'transactions', label: txDict?.transactions || 'Transactions' },
    { view: 'expenses', label: txDict?.expenses || 'Expenses' },
  ];
  const displayModes = [
    { mode: 'grid', label: dict.common?.gridView || 'Grid View', Icon: LayoutGrid },
    { mode: 'list', label: dict.common?.listView || 'List View', Icon: List },
  ] as const;
  const toggleTone = (active: boolean) => (active ? 'bg-paper-white text-ink' : 'text-paper hover:bg-white/10');
  const pageKey = 'flex min-h-[44px] w-full items-center justify-center border border-white/25 px-5 font-receipt text-xs font-medium uppercase text-paper transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent touch-manipulation sm:w-auto';

  /** Till keys for a sale: joined in a list row, spanning the bottom edge of a grid slip. */
  const renderKeys = (transaction: Transaction, layout: 'row' | 'strip') => {
    const strip = layout === 'strip';
    const key = `flex min-h-[44px] items-center justify-center gap-2 font-receipt text-xs font-medium uppercase text-ink touch-manipulation transition-colors hover:bg-paper ${strip ? 'min-w-0 flex-1' : 'w-11'}`;
    return (
      <div className={`flex divide-x divide-ink/25 ${strip ? 'border-t border-ink/25' : 'actions-touch-visible border border-ink/25 transition-opacity duration-200'}`}>
        <button type="button" onClick={() => viewTransaction(transaction)} className={key} title={txDict.view} aria-label={txDict.view}>
          <Eye className={ICON} strokeWidth={1.75} aria-hidden />
        </button>
        <button type="button" onClick={() => printReceipt(transaction)} className={key} title={dict.common.print} aria-label={dict.common.print}>
          <Printer className={ICON} strokeWidth={1.75} aria-hidden />
          {strip && <span className="hidden sm:inline">{dict.common.print}</span>}
        </button>
        {transaction.status === 'completed' && canRefund && (
          <button
            type="button"
            onClick={() => openAdjustModal(transaction)}
            className={`${key} hover:text-stamp`}
            title={txDict?.adjustRefund || 'Adjust / Refund'}
            aria-label={txDict?.adjustRefund || 'Adjust / Refund'}
          >
            <RotateCcw className={ICON} strokeWidth={1.75} aria-hidden />
            {strip && <span className="hidden sm:inline">{txDict?.adjust || 'Adjust'}</span>}
          </button>
        )}
      </div>
    );
  };

  const renderExpenseKey = (expense: Expense, layout: 'row' | 'strip') => {
    const label = selectedExpense?._id === expense._id ? txDict.hide : txDict.view;
    const strip = layout === 'strip';
    return (
      <div className={strip ? 'border-t border-ink/25' : 'actions-touch-visible border border-ink/25 transition-opacity duration-200'}>
        <button
          type="button"
          onClick={() => viewExpense(expense)}
          className={`flex min-h-[44px] items-center justify-center gap-2 font-receipt text-xs font-medium uppercase text-ink touch-manipulation transition-colors hover:bg-paper ${strip ? 'w-full' : 'w-11'}`}
          title={label}
          aria-label={label}
        >
          <Eye className={ICON} strokeWidth={1.75} aria-hidden />
          {strip && <span className="hidden sm:inline">{label}</span>}
        </button>
      </div>
    );
  };

  const renderContent = () => {
    if (status === 'loading') {
      return <TransactionsCatalogSkeleton mode={displayMode} />;
    }

    if (status === 'error') {
      return (
        <div className="bg-paper-white text-ink">
          <ErrorState
            title={txDict.failedToLoadTransactions || 'Failed to load transactions'}
            description={error || undefined}
            onRetry={refetch}
            retryLabel={dict.common.retry || 'Retry'}
          />
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <EmptyState
          icon="savedCarts"
          title={
            filtersActive
              ? (dict.common.noResults || 'No results found')
              : viewType === 'expenses'
              ? (txDict.noExpenses || 'No expenses found')
              : viewType === 'transactions'
              ? (txDict.noTransactions || 'No transactions found')
              : (txDict.noActivityYet || 'No transactions or expenses yet')
          }
          action={
            filtersActive
              ? undefined
              : viewType === 'expenses'
              ? (canManageExpenses ? { label: txDict.addExpense || 'Add Expense', onClick: openExpenseModal } : undefined)
              : (canCreateManual ? { label: txDict.addManual || 'Add Transaction', onClick: openManualModal } : undefined)
          }
          className="bg-paper-white text-ink"
        />
      );
    }

    if (displayMode === 'grid') {
      return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            if (item.type === 'transaction') {
              const transaction = item.data;
              return (
                <article key={transaction._id} className="flex min-w-0 flex-col">
                  <div className="flex flex-1 flex-col bg-paper-white text-ink">
                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-receipt text-sm font-semibold">#{receiptNo(transaction)}</p>
                          <FormattedDate date={transaction.createdAt} includeTime={true} className="font-receipt text-xs text-ink/60" />
                        </div>
                        <StatusTag status={transaction.status} label={txDict[transaction.status]} />
                      </div>
                      <div className="space-y-1 border-y border-dashed border-ink/30 py-2 font-receipt text-sm">
                        <ReceiptRow label={txDict.items} value={transaction.items.length} />
                        <ReceiptRow label={txDict.payment} value={paymentLabel(transaction.paymentMethod)} />
                        {!!transaction.cashReceived && <ReceiptRow label={txDict.cash} value={<Currency amount={transaction.cashReceived} />} />}
                        {!!transaction.change && <ReceiptRow label={txDict.change} value={<Currency amount={transaction.change} />} />}
                      </div>
                      <div className="mt-auto font-receipt text-lg">
                        <ReceiptRow strong label={dict.common.total} value={<Currency amount={transaction.total} />} />
                      </div>
                    </div>
                    {renderKeys(transaction, 'strip')}
                  </div>
                  <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
                </article>
              );
            }
            const expense = item.data;
            return (
              <article key={expense._id} className="flex min-w-0 flex-col">
                <div className="flex flex-1 flex-col bg-paper-white text-ink">
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold">{expense.name}</p>
                        <FormattedDate date={expense.date || expense.createdAt} includeTime={true} className="font-receipt text-xs text-ink/60" />
                      </div>
                      <Tag tone="inverse">{txDict?.expense || 'Expense'}</Tag>
                    </div>
                    <div className="space-y-1 border-y border-dashed border-ink/30 py-2 text-sm">
                      {expense.description && <p className="line-clamp-2 text-ink/60">{expense.description}</p>}
                      <div className="font-receipt">
                        <ReceiptRow label={txDict.payment} value={paymentLabel(expense.paymentMethod)} />
                      </div>
                    </div>
                    <div className="mt-auto font-receipt text-lg">
                      <ReceiptRow strong label={dict.common.total} value={<PaidOut amount={expense.amount} />} />
                    </div>
                  </div>
                  {renderExpenseKey(expense, 'strip')}
                </div>
                <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
              </article>
            );
          })}
        </div>
      );
    }

    const keyColumn = 'ml-auto shrink-0 md:ml-0 md:flex md:w-[var(--tx-keys)] md:justify-end';

    return (
      <div style={{ '--tx-keys': `${keyWidth}px` } as CSSProperties}>
        <div className="bg-paper-white text-ink">
          <div className="hidden items-center gap-3 border-b border-dashed border-ink/30 px-4 py-2 font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/60 md:flex">
            <span className="flex-1">{txDict?.receipt || 'Receipt'}</span>
            <span className="w-28 text-right">{txDict.status}</span>
            <span className="w-32 text-right">{dict.common.total}</span>
            <span className="w-[var(--tx-keys)] shrink-0" aria-hidden />
          </div>
          <div className="divide-y divide-dashed divide-ink/20">
            {items.map((item) => {
              if (item.type === 'transaction') {
                const transaction = item.data;
                return (
                  <div key={transaction._id} className="group flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 transition-colors hover:bg-paper md:flex-nowrap">
                    <div className="flex min-w-0 basis-full items-center gap-3 md:flex-1 md:basis-0">
                      <div className="min-w-0">
                        <p className="truncate font-receipt text-sm font-semibold">#{receiptNo(transaction)}</p>
                        <div className="flex flex-wrap gap-x-3 font-receipt text-xs text-ink/60">
                          <FormattedDate date={transaction.createdAt} includeTime={true} />
                          <span>{itemCount(transaction)}</span>
                          <span>{paymentLabel(transaction.paymentMethod)}</span>
                          {!!transaction.cashReceived && <span>{txDict.cash}: <Currency amount={transaction.cashReceived} /></span>}
                          {!!transaction.change && <span>{txDict.change}: <Currency amount={transaction.change} /></span>}
                        </div>
                      </div>
                      <span className="mk-leader hidden md:block" aria-hidden />
                    </div>
                    <div className="md:w-28 md:text-right">
                      <StatusTag status={transaction.status} label={txDict[transaction.status]} />
                    </div>
                    <Currency amount={transaction.total} className="whitespace-nowrap font-receipt text-base font-semibold md:w-32 md:text-right" />
                    <div className={keyColumn}>{renderKeys(transaction, 'row')}</div>
                  </div>
                );
              }
              const expense = item.data;
              return (
                <div key={expense._id} className="group flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 transition-colors hover:bg-paper md:flex-nowrap">
                  <div className="flex min-w-0 basis-full items-center gap-3 md:flex-1 md:basis-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{expense.name}</p>
                      <div className="flex flex-wrap gap-x-3 font-receipt text-xs text-ink/60">
                        <FormattedDate date={expense.date || expense.createdAt} includeTime={true} />
                        <span>{paymentLabel(expense.paymentMethod)}</span>
                      </div>
                      {expense.description && <p className="line-clamp-1 text-xs text-ink/60">{expense.description}</p>}
                    </div>
                    <span className="mk-leader hidden md:block" aria-hidden />
                  </div>
                  <div className="md:w-28 md:text-right">
                    <Tag tone="inverse">{txDict?.expense || 'Expense'}</Tag>
                  </div>
                  <PaidOut amount={expense.amount} className="font-receipt text-base font-semibold md:w-32 md:text-right" />
                  <div className={keyColumn}>{renderExpenseKey(expense, 'row')}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
      </div>
    );
  };

  return (
    <>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0">
              {tenantSettings?.companyName && (
                <LineTag no="EJ" className="mb-3 text-[#8fe3d0]">{tenantSettings.companyName}</LineTag>
              )}
              <h1 className="text-5xl text-paper-white sm:text-6xl lg:text-7xl">{txDict.title || 'Transactions'}</h1>
            </div>
            <div className="flex w-full flex-wrap items-stretch gap-3 sm:w-auto">
              <div className="flex items-center gap-3 border border-white/10 bg-black/30 px-4 py-2">
                <span className="mk-led-glow font-led text-4xl leading-none text-[#7df0d6]">
                  {status === 'ready' ? `${page}/${totalPages}` : '---'}
                </span>
                <span className="font-receipt text-xs uppercase tracking-[0.14em] text-white/60">{txDict.page}</span>
              </div>
              {canManageExpenses && (
                <button
                  type="button"
                  onClick={openExpenseModal}
                  className="flex min-h-[44px] flex-1 items-center justify-center gap-2 border border-white/25 px-3 font-receipt text-xs font-medium uppercase text-paper transition-colors hover:bg-white/10 touch-manipulation sm:flex-none sm:px-5 sm:text-sm"
                >
                  <Plus className={ICON} strokeWidth={1.75} aria-hidden />
                  <span className="hidden sm:inline">{txDict?.addExpense || 'Add Expense'}</span>
                  <span className="sm:hidden">{txDict?.expense || 'Expense'}</span>
                </button>
              )}
              {canCreateManual && (
              <button
                type="button"
                onClick={openManualModal}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 bg-paper-white px-3 font-receipt text-xs font-medium uppercase text-ink transition-colors hover:bg-paper touch-manipulation sm:flex-none sm:px-5 sm:text-sm"
              >
                <Plus className={ICON} strokeWidth={1.75} aria-hidden />
                <span className="hidden sm:inline">{txDict?.addManual || 'Add Transaction'}</span>
                <span className="sm:hidden">{txDict?.sale || 'Sale'}</span>
              </button>
              )}
            </div>
          </div>

          <div className="mb-3 mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex divide-x divide-white/25 border border-white/25">
              {viewTypes.map(({ view, label }) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => { setViewType(view); setPage(1); }}
                  aria-pressed={viewType === view}
                  className={`flex min-h-[44px] flex-auto items-center justify-center px-2 font-receipt text-xs font-medium uppercase transition-colors touch-manipulation sm:flex-none sm:px-4 ${toggleTone(viewType === view)}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex shrink-0 divide-x divide-white/25 border border-white/25">
              {displayModes.map(({ mode, label, Icon }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDisplayMode(mode)}
                  aria-pressed={displayMode === mode}
                  title={label}
                  aria-label={label}
                  className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 px-4 font-receipt text-xs font-medium uppercase transition-colors touch-manipulation sm:flex-none ${toggleTone(displayMode === mode)}`}
                >
                  <Icon className={ICON} strokeWidth={1.75} aria-hidden />
                  <span className="hidden lg:inline">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <TransactionFilters
            view={viewType}
            values={filters}
            onChange={updateFilters}
            cashiers={filterOptions.cashiers}
            branches={filterOptions.branches}
            labels={filterLabels}
            onExport={canExport ? exportView : undefined}
            exporting={exporting}
          />

          {renderContent()}

          {totalPages > 1 && (
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className={pageKey}
              >
                {txDict.previous}
              </button>
              <span className="mk-led-glow px-3 font-led text-2xl leading-none text-[#7df0d6]">
                {page}/{totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className={pageKey}
              >
                {txDict.next}
              </button>
            </div>
          )}
        </div>

      {/* Detail drawer: the sale or expense reprinted as a slip */}
      {(selectedTransaction || selectedExpense) && (
        <div className="fixed inset-0 z-50 bg-ink/60" onClick={closeDrawer}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={selectedTransaction ? txDict.transactionDetails : (txDict?.expenseDetails || 'Expense Details')}
            className="animate-slide-in-right absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-brand-navy-deep text-paper motion-reduce:animate-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 p-5">
              <div className="min-w-0">
                <h2 className="text-4xl text-paper-white">
                  {selectedTransaction ? txDict.transactionDetails : (txDict?.expenseDetails || 'Expense Details')}
                </h2>
                <FormattedDate
                  date={selectedTransaction ? selectedTransaction.createdAt : (selectedExpense!.date || selectedExpense!.createdAt)}
                  includeTime={true}
                  className="mt-2 block font-receipt text-xs text-[#8fe3d0]"
                />
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="-mr-2 -mt-1 flex min-h-[44px] w-11 shrink-0 items-center justify-center text-paper transition-colors hover:bg-white/10"
                aria-label={closeLabel}
              >
                <X className={ICON} strokeWidth={1.75} aria-hidden />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-5">
              <div className="bg-paper-white p-5 font-receipt text-sm text-ink">
                {selectedTransaction ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-[0.14em] text-ink/60">{txDict?.receipt || 'Receipt'}</p>
                        <p className="truncate font-semibold">#{receiptNo(selectedTransaction)}</p>
                      </div>
                      <StatusTag status={selectedTransaction.status} label={txDict[selectedTransaction.status]} />
                    </div>

                    <div className="mt-3 space-y-2 border-t border-dashed border-ink/30 pt-3">
                      {selectedTransaction.items.map((item, index) => (
                        <div key={index}>
                          <p className="break-words font-medium">{item.name}</p>
                          <ReceiptRow
                            label={<span className="text-ink/60"><Currency amount={item.price} /> × {item.quantity}</span>}
                            value={<Currency amount={item.subtotal} />}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 space-y-1 border-t border-dashed border-ink/30 pt-3">
                      {selectedTransaction.subtotal !== undefined && !!selectedTransaction.discountAmount && (
                        <ReceiptRow label={txDict?.subtotal || 'Subtotal'} value={<Currency amount={selectedTransaction.subtotal} />} />
                      )}
                      {!!selectedTransaction.discountAmount && (
                        <ReceiptRow
                          label={
                            <>
                              {txDict?.discount || 'Discount'}
                              {selectedTransaction.discountCode && <span className="ml-2 border border-ink/25 px-1.5 py-0.5 text-xs">{selectedTransaction.discountCode}</span>}
                            </>
                          }
                          value={<PaidOut amount={selectedTransaction.discountAmount} />}
                        />
                      )}
                      <div className="text-lg">
                        <ReceiptRow strong label={dict.common.total} value={<Currency amount={selectedTransaction.total} />} />
                      </div>
                    </div>

                    <div className="mt-3 space-y-1 border-t border-dashed border-ink/30 pt-3">
                      {personName(selectedTransaction.customerId) && (
                        <ReceiptRow label={txDict?.customer || 'Customer'} value={personName(selectedTransaction.customerId)} />
                      )}
                      {personName(selectedTransaction.userId) && (
                        <ReceiptRow label={txDict?.cashier || 'Cashier'} value={personName(selectedTransaction.userId)} />
                      )}
                      <ReceiptRow label={txDict.payment} value={paymentLabel(selectedTransaction.paymentMethod)} />
                      {!!selectedTransaction.cashReceived && (
                        <ReceiptRow label={txDict.cash} value={<Currency amount={selectedTransaction.cashReceived} />} />
                      )}
                      {!!selectedTransaction.change && (
                        <ReceiptRow label={txDict.change} value={<Currency amount={selectedTransaction.change} />} />
                      )}
                    </div>

                    {selectedTransaction.voidReason && (
                      <div className="mt-3 border-t border-dashed border-ink/30 pt-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-ink/60">{txDict?.voidReason || 'Reason for void'}</p>
                        <p className="mt-1 font-body">{selectedTransaction.voidReason}</p>
                      </div>
                    )}
                  </>
                ) : selectedExpense ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-words font-body text-base font-semibold">{selectedExpense.name}</p>
                      <Tag tone="inverse">{txDict?.expense || 'Expense'}</Tag>
                    </div>
                    {selectedExpense.description && (
                      <div className="mt-3 border-t border-dashed border-ink/30 pt-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-ink/60">{txDict?.description || 'Description'}</p>
                        <p className="mt-1 font-body">{selectedExpense.description}</p>
                      </div>
                    )}
                    {selectedExpense.notes && (
                      <div className="mt-3 border-t border-dashed border-ink/30 pt-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-ink/60">{txDict?.notes || 'Notes'}</p>
                        <p className="mt-1 font-body">{selectedExpense.notes}</p>
                      </div>
                    )}
                    <div className="mt-3 space-y-1 border-t border-dashed border-ink/30 pt-3">
                      <ReceiptRow label={txDict.payment} value={paymentLabel(selectedExpense.paymentMethod)} />
                      <div className="text-lg">
                        <ReceiptRow strong label={dict.common.total} value={<PaidOut amount={selectedExpense.amount} />} />
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
              <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
            </div>

            {selectedTransaction && (
              <div className="flex gap-2 border-t border-white/10 p-5">
                <button
                  type="button"
                  onClick={() => printReceipt(selectedTransaction)}
                  className={`${KEY} bg-paper-white text-ink hover:bg-paper`}
                >
                  <Printer className={ICON} strokeWidth={1.75} aria-hidden />
                  {dict.common.print}
                </button>
                {selectedTransaction.status === 'completed' && canRefund && (
                  <button
                    type="button"
                    onClick={() => { openAdjustModal(selectedTransaction); setSelectedTransaction(null); }}
                    className={`${KEY} border border-white/25 text-paper hover:bg-white/10`}
                  >
                    <RotateCcw className={ICON} strokeWidth={1.75} aria-hidden />
                    {txDict?.adjust || 'Adjust'}
                  </button>
                )}
                {voidable(selectedTransaction) && (
                  <button
                    type="button"
                    onClick={() => { openVoidModal(selectedTransaction); setSelectedTransaction(null); }}
                    className={`${KEY} border border-white/25 text-paper hover:border-stamp hover:bg-stamp`}
                  >
                    <Ban className={ICON} strokeWidth={1.75} aria-hidden />
                    {txDict?.voidLabel || 'Void'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Manual Expense Modal */}
      {showExpenseModal && (
        <SlipModal title={txDict?.addExpense || 'Add Expense'} closeLabel={closeLabel} onClose={() => setShowExpenseModal(false)}>
          {expenseSuccess ? (
            <DoneNote
              message={txDict?.expenseCreated || 'Expense recorded successfully'}
              closeLabel={closeLabel}
              onClose={() => setShowExpenseModal(false)}
            />
          ) : (
            <div className="space-y-4 px-5 py-4">
              <div>
                <label htmlFor="expense-name" className={LABEL}>{txDict?.name || 'Name'} <span className="text-stamp">*</span></label>
                <input
                  id="expense-name"
                  type="text"
                  value={expenseName}
                  onChange={(e) => setExpenseName(e.target.value)}
                  placeholder={txDict?.expenseNamePlaceholder || 'e.g. Office supplies'}
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor="expense-description" className={LABEL}>{txDict?.description || 'Description'} <span className="text-stamp">*</span></label>
                <input
                  id="expense-description"
                  type="text"
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
                  placeholder={txDict?.expenseDescPlaceholder || 'Brief description of the expense'}
                  className={FIELD}
                />
              </div>

              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <label htmlFor="expense-amount" className={LABEL}>{txDict?.amount || 'Amount'} <span className="text-stamp">*</span></label>
                  <input
                    id="expense-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    placeholder="0.00"
                    className={FIELD}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <label htmlFor="expense-date" className={LABEL}>{txDict?.date || 'Date'}</label>
                  <input
                    id="expense-date"
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className={FIELD}
                  />
                </div>
              </div>

              <div>
                <p className={LABEL}>{txDict?.payment || 'Payment Method'}</p>
                <div className="flex divide-x divide-ink/25 border border-ink/25">
                  {(['cash', 'card', 'digital', 'other'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setExpensePayment(m)}
                      aria-pressed={expensePayment === m}
                      className={`flex min-h-[44px] min-w-0 flex-1 items-center justify-center font-receipt text-xs font-medium uppercase transition-colors ${expensePayment === m ? 'bg-ink text-paper-white' : 'text-ink hover:bg-paper'}`}
                    >
                      {paymentLabel(m)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="expense-notes" className={LABEL}>{txDict?.notes || 'Notes'} ({dict.common?.optional || 'optional'})</label>
                <textarea
                  id="expense-notes"
                  value={expenseNotes}
                  onChange={(e) => setExpenseNotes(e.target.value)}
                  rows={2}
                  placeholder={txDict?.expenseNotesPlaceholder || 'Additional details…'}
                  className={`${FIELD} resize-none`}
                />
              </div>

              {expenseError && <div className={ERROR_NOTE}>{expenseError}</div>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowExpenseModal(false)} className={KEY_SECONDARY}>
                  {dict.common?.cancel || 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={submitManualExpense}
                  disabled={expenseLoading || !expenseName.trim() || !expenseDescription.trim() || !expenseAmount}
                  className={KEY_PRIMARY}
                >
                  <SaveIcon loading={expenseLoading} />
                  {txDict?.saveExpense || 'Save Expense'}
                </button>
              </div>
            </div>
          )}
        </SlipModal>
      )}

      {/* Add Manual Transaction Modal */}
      {showAddModal && (
        <SlipModal title={txDict?.addManual || 'Add Transaction'} closeLabel={closeLabel} onClose={() => setShowAddModal(false)} wide>
          {manualSuccess ? (
            <DoneNote
              message={txDict?.transactionCreated || 'Transaction created successfully'}
              closeLabel={closeLabel}
              onClose={() => setShowAddModal(false)}
            />
          ) : (
            <div className="space-y-5 px-5 py-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className={`${LABEL} mb-0`}>{txDict?.items || 'Items'}</p>
                  <button
                    type="button"
                    onClick={() => setManualItems((prev) => [...prev, emptyItem()])}
                    className="flex min-h-[44px] items-center gap-1 font-receipt text-xs font-medium uppercase text-brand-hover transition-colors hover:text-ink"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                    {txDict?.addItem || 'Add item'}
                  </button>
                </div>
                <div className="space-y-2">
                  {manualItems.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <input
                        type="text"
                        placeholder={txDict?.itemName || 'Item name'}
                        aria-label={txDict?.itemName || 'Item name'}
                        value={item.name}
                        onChange={(e) => setManualItems((prev) => prev.map((it, i) => i === idx ? { ...it, name: e.target.value } : it))}
                        className={`${FIELD} min-w-0 flex-1`}
                      />
                      <input
                        type="number"
                        placeholder={dict.products?.price || 'Price'}
                        aria-label={dict.products?.price || 'Price'}
                        value={item.price}
                        min="0"
                        step="0.01"
                        onChange={(e) => setManualItems((prev) => prev.map((it, i) => i === idx ? { ...it, price: e.target.value } : it))}
                        className={`${FIELD} !w-24`}
                      />
                      <input
                        type="number"
                        placeholder={txDict?.qty || 'Qty'}
                        aria-label={txDict?.qty || 'Qty'}
                        value={item.quantity}
                        min="1"
                        step="1"
                        onChange={(e) => setManualItems((prev) => prev.map((it, i) => i === idx ? { ...it, quantity: e.target.value } : it))}
                        className={`${FIELD} !w-16`}
                      />
                      {manualItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setManualItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="flex min-h-[44px] w-9 shrink-0 items-center justify-center text-ink/60 transition-colors hover:text-stamp"
                          title={dict?.pos?.removeItem || 'Remove item'}
                          aria-label={dict?.pos?.removeItem || 'Remove item'}
                        >
                          <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {manualItems.some((it) => it.price && it.quantity) && (
                  <div className="mt-3 font-receipt text-sm">
                    <ReceiptRow strong label={dict.common?.total || 'Total'} value={<Currency amount={manualTotal} />} />
                  </div>
                )}
              </div>

              <div>
                <p className={LABEL}>{txDict?.payment || 'Payment Method'}</p>
                <div className="flex divide-x divide-ink/25 border border-ink/25">
                  {(['cash', 'card', 'digital'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setManualPayment(m)}
                      aria-pressed={manualPayment === m}
                      className={`flex min-h-[44px] min-w-0 flex-1 items-center justify-center font-receipt text-xs font-medium uppercase transition-colors ${manualPayment === m ? 'bg-ink text-paper-white' : 'text-ink hover:bg-paper'}`}
                    >
                      {paymentLabel(m)}
                    </button>
                  ))}
                </div>
              </div>

              {manualPayment === 'cash' && (
                <div>
                  <label htmlFor="manual-cash" className={LABEL}>{txDict?.cash || 'Cash Received'} ({dict.common?.optional || 'optional'})</label>
                  <input
                    id="manual-cash"
                    type="number"
                    min="0"
                    step="0.01"
                    value={manualCash}
                    onChange={(e) => setManualCash(e.target.value)}
                    placeholder="0.00"
                    className={FIELD}
                  />
                  {manualCash && (manualChange >= 0 ? (
                    <div className="mt-2 font-receipt text-sm">
                      <ReceiptRow label={txDict?.change || 'Change'} value={<Currency amount={manualChange} />} />
                    </div>
                  ) : (
                    <p className="mt-1 font-receipt text-xs text-stamp">{txDict?.insufficientCash || 'Cash received is less than total'}</p>
                  ))}
                </div>
              )}

              <div>
                <label htmlFor="manual-notes" className={LABEL}>{txDict?.notes || 'Notes'} ({dict.common?.optional || 'optional'})</label>
                <textarea
                  id="manual-notes"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  rows={2}
                  placeholder={txDict?.notesPlaceholder || 'e.g. walk-in customer, special order…'}
                  className={`${FIELD} resize-none`}
                />
              </div>

              {manualError && <div className={ERROR_NOTE}>{manualError}</div>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAddModal(false)} className={KEY_SECONDARY}>
                  {dict.common?.cancel || 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={submitManualTransaction}
                  disabled={manualLoading || manualItems.every((it) => !it.name)}
                  className={KEY_PRIMARY}
                >
                  <SaveIcon loading={manualLoading} />
                  {txDict?.saveTransaction || 'Save Transaction'}
                </button>
              </div>
            </div>
          )}
        </SlipModal>
      )}

      {/* Void Modal */}
      {voidTransaction && (
        <SlipModal title={txDict?.voidTitle || 'Void Sale'} closeLabel={closeLabel} onClose={() => setVoidTransaction(null)}>
          <div className="space-y-4 px-5 py-4">
            <div className="space-y-1 border-b border-dashed border-ink/30 pb-3 font-receipt text-sm">
              <ReceiptRow label={txDict?.receipt || 'Receipt'} value={`#${receiptNo(voidTransaction)}`} />
              <ReceiptRow label={txDict.date} value={<FormattedDate date={voidTransaction.createdAt} includeTime={true} />} />
              <ReceiptRow strong label={dict.common.total} value={<Currency amount={voidTransaction.total} />} />
            </div>
            {voidSuccess ? (
              <DoneNote
                message={txDict?.voidSuccess || 'Sale voided'}
                note={txDict?.voidDone || 'Stock and balances have been restored.'}
                closeLabel={closeLabel}
                onClose={() => setVoidTransaction(null)}
              />
            ) : (
              <>
                <p className="text-sm text-ink/70">
                  {txDict?.voidNotice || "This cancels the whole sale and can't be undone. Stock, payment records, account balance, loyalty points and discount usage are reversed. Return any money to the customer yourself."}
                </p>
                <div>
                  <label htmlFor="void-reason" className={LABEL}>
                    {txDict?.voidReason || 'Reason for void'} <span className="text-stamp">*</span>
                  </label>
                  <textarea
                    id="void-reason"
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder={txDict?.voidReasonPlaceholder || 'e.g. Wrong item keyed'}
                    className={`${FIELD} resize-none`}
                  />
                </div>
                {voidError && <div className={ERROR_NOTE}>{voidError}</div>}
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setVoidTransaction(null)} className={KEY_SECONDARY}>
                    {dict.common?.cancel || 'Cancel'}
                  </button>
                  <button type="button" onClick={doVoid} disabled={!voidReason.trim() || voidLoading} className={KEY_STAMP}>
                    {voidLoading ? <SaveIcon loading /> : <Ban className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
                    {txDict?.voidTitle || 'Void Sale'}
                  </button>
                </div>
              </>
            )}
          </div>
        </SlipModal>
      )}

      {/* Adjustment / Refund Modal */}
      {adjustTransaction && (
        <SlipModal title={txDict?.adjustRefund || 'Adjust / Refund Transaction'} closeLabel={closeLabel} onClose={closeAdjustModal}>
          <div className="space-y-4 px-5 py-4">
            <div className="space-y-1 border-b border-dashed border-ink/30 pb-3 font-receipt text-sm">
              <ReceiptRow label={txDict.date} value={<FormattedDate date={adjustTransaction.createdAt} includeTime={true} />} />
              <ReceiptRow label={txDict.items} value={adjustTransaction.items.length} />
              {(adjustTransaction.refundedAmount ?? 0) > 0 ? (
                <>
                  {/* The server refunds what is left (total − already refunded); show that, so staff hand back the right amount */}
                  <ReceiptRow label={dict.common.total} value={<Currency amount={adjustTransaction.total} />} />
                  <ReceiptRow label={txDict?.alreadyRefunded || 'Already refunded'} value={<Currency amount={-(adjustTransaction.refundedAmount ?? 0)} />} />
                  <ReceiptRow
                    strong
                    label={txDict?.refundDue || 'To refund'}
                    value={<Currency amount={Math.max(0, Math.round((adjustTransaction.total - (adjustTransaction.refundedAmount ?? 0)) * 100) / 100)} />}
                  />
                </>
              ) : (
                <ReceiptRow strong label={dict.common.total} value={<Currency amount={adjustTransaction.total} />} />
              )}
            </div>
            {!adjustSuccess ? (
              <>
                <div>
                  <label htmlFor="refund-reason" className={LABEL}>
                    {txDict?.refundReason || 'Reason'} <span className="text-stamp">*</span>
                  </label>
                  <select
                    id="refund-reason"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    className={FIELD}
                  >
                    <option value="">{txDict?.selectReason || '— Select a reason —'}</option>
                    <option value="customer_request">{txDict?.reasonCustomerRequest || 'Customer request'}</option>
                    <option value="defective_item">{txDict?.reasonDefectiveItem || 'Defective item'}</option>
                    <option value="wrong_item">{txDict?.reasonWrongItem || 'Wrong item'}</option>
                    <option value="overcharge">{txDict?.reasonOvercharge || 'Overcharge'}</option>
                    <option value="other">{txDict?.reasonOther || 'Other'}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="refund-notes" className={LABEL}>
                    {txDict?.refundNotes || 'Notes (optional)'}
                  </label>
                  <textarea
                    id="refund-notes"
                    value={adjustNotes}
                    onChange={(e) => setAdjustNotes(e.target.value)}
                    rows={3}
                    placeholder={txDict?.refundNotesPlaceholder || 'Additional details…'}
                    className={`${FIELD} resize-none`}
                  />
                </div>
                {adjustError && <div className={ERROR_NOTE}>{adjustError}</div>}
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={closeAdjustModal} className={KEY_SECONDARY}>
                    {dict.common?.cancel || 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={doRefund}
                    disabled={!adjustReason || adjustLoading}
                    className={KEY_STAMP}
                  >
                    {adjustLoading
                      ? <SaveIcon loading />
                      : <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
                    {txDict?.processRefund || 'Process Refund'}
                  </button>
                </div>
              </>
            ) : (
              <DoneNote
                message={txDict?.refundSuccess || 'Refund processed successfully'}
                note={txDict?.stockRestored || 'Stock has been restored.'}
                closeLabel={closeLabel}
                onClose={closeAdjustModal}
              />
            )}
          </div>
        </SlipModal>
      )}
    </>
  );
}
