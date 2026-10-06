'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { usePermissions } from '@/hooks/usePermissions';
import { showToast } from '@/lib/toast';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';

interface PrescriptionItem {
  productId?: string;
  drugName: string;
  quantity: number;
  dosage: string;
  frequency: string;
  instructions?: string;
  dispensed: boolean;
  dispensedAt?: string;
}

interface ProductOption {
  _id: string;
  name: string;
  genericName?: string;
  drugSchedule?: string;
  stock?: number;
}

interface Prescription {
  _id: string;
  prescriptionNumber: string;
  patientName: string;
  doctorName: string;
  doctorPRCNumber: string;
  issuedDate: string;
  validUntil: string;
  status: 'pending' | 'partially_dispensed' | 'dispensed' | 'expired' | 'cancelled';
  items: PrescriptionItem[];
  notes?: string;
  createdAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-win8-warning text-white',
  partially_dispensed: 'bg-win8-info text-white',
  dispensed: 'bg-win8-success text-white',
  expired: 'bg-win8-danger text-white',
  cancelled: 'bg-gray-500 text-white',
};

const STATUS_FILTERS = ['', 'pending', 'partially_dispensed', 'dispensed', 'expired', 'cancelled'];
const CLOSED_STATUSES = ['dispensed', 'expired', 'cancelled'];

const emptyItem = () => ({ productId: undefined as string | undefined, drugName: '', quantity: 1, dosage: '', frequency: '', instructions: '' });

const emptyRx = () => ({
  patientName: '', patientAge: '', doctorName: '', doctorPRCNumber: '',
  doctorClinic: '', issuedDate: new Date().toISOString().split('T')[0],
  validUntil: '', notes: '',
  items: [emptyItem()],
});

const INPUT = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';

const MAX_SUGGESTIONS = 8;

const SCHEDULE_BADGE: Record<string, string> = {
  dangerous: 'bg-win8-danger text-white',
};

interface DrugNameComboboxProps {
  value: string;
  products: ProductOption[];
  productsLoading: boolean;
  placeholder: string;
  loadingText: string;
  noMatchText: string;
  stockLabel: string;
  onChange: (drugName: string, product: ProductOption | undefined) => void;
}

/** Drug-name input with inventory suggestions; free text is still allowed for unlinked drugs. */
function DrugNameCombobox({
  value, products, productsLoading, placeholder, loadingText, noMatchText, stockLabel, onChange,
}: DrugNameComboboxProps) {
  const listboxId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const query = value.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!query) return products.slice(0, MAX_SUGGESTIONS);
    const starts: ProductOption[] = [];
    const contains: ProductOption[] = [];
    for (const p of products) {
      const name = p.name.toLowerCase();
      const generic = p.genericName?.toLowerCase() ?? '';
      if (name.startsWith(query) || generic.startsWith(query)) starts.push(p);
      else if (name.includes(query) || generic.includes(query)) contains.push(p);
    }
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [products, query]);

  useEffect(() => {
    if (active < 0) return;
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const select = (p: ProductOption) => {
    onChange(p.name, p);
    setOpen(false);
    setActive(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive(i => (suggestions.length ? (i + 1) % suggestions.length : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive(i => (suggestions.length ? (i <= 0 ? suggestions.length - 1 : i - 1) : -1));
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && suggestions[active]) {
        e.preventDefault();
        select(suggestions[active]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        // Close only the list; stops the event before Win8Drawer's document-level Escape handler
        e.stopPropagation();
        setOpen(false);
        setActive(-1);
      }
    }
  };

  const highlight = (name: string) => {
    const i = query ? name.toLowerCase().indexOf(query) : -1;
    if (i < 0) return name;
    return (
      <>
        {name.slice(0, i)}
        <span className="font-semibold text-brand-navy">{name.slice(i, i + query.length)}</span>
        {name.slice(i + query.length)}
      </>
    );
  };

  const showList = open && (productsLoading || suggestions.length > 0 || query.length > 0);

  return (
    <div className="relative flex-1 min-w-0">
      <input
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listboxId}-${active}` : undefined}
        aria-label={placeholder}
        placeholder={placeholder}
        autoComplete="off"
        className={INPUT}
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); setActive(-1); }}
        onKeyDown={handleKeyDown}
        onChange={e => {
          const drugName = e.target.value;
          const exact = products.find(p => p.name.toLowerCase() === drugName.trim().toLowerCase());
          onChange(drugName, exact);
          setOpen(true);
          setActive(-1);
        }}
      />
      {showList && (
        <div className="absolute left-0 right-0 top-full z-20 bg-white border border-gray-300 border-t-0">
          {productsLoading && products.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400">
              <span className="win8-spinner win8-spinner-sm text-brand"><span /><span /><span /><span /><span /></span>
              {loadingText}
            </div>
          ) : suggestions.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-500">{noMatchText}</p>
          ) : (
            <ul ref={listRef} id={listboxId} role="listbox" className="max-h-60 overflow-y-auto divide-y divide-gray-200">
              {suggestions.map((p, i) => (
                <li
                  key={p._id}
                  id={`${listboxId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  // mousedown (not click) so the input's blur doesn't close the list first
                  onMouseDown={e => { e.preventDefault(); select(p); }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex items-center justify-between gap-3 px-3 py-2 text-sm cursor-pointer ${i === active ? 'bg-brand-soft' : 'hover:bg-gray-100'}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-gray-900" title={p.name}>{highlight(p.name)}</span>
                    {p.genericName && (
                      <span className="block truncate text-xs text-gray-500" title={p.genericName}>{highlight(p.genericName)}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {p.drugSchedule && (
                      <span className={`px-1.5 py-0.5 text-xs font-semibold capitalize ${SCHEDULE_BADGE[p.drugSchedule] || 'bg-gray-500 text-white'}`}>
                        {p.drugSchedule.replace(/_/g, ' ')}
                      </span>
                    )}
                    {typeof p.stock === 'number' && (
                      <span className={`text-xs tabular-nums ${p.stock > 0 ? 'text-gray-500' : 'text-win8-danger font-semibold'}`}>
                        {stockLabel} {p.stock.toLocaleString()}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function PrescriptionsPage() {
  const params = useParams();
  const lang = params.lang as string;
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { canAccess } = usePermissions();
  const canCreate = canAccess('prescriptions.create');
  const canDispense = canAccess('prescriptions.dispense');

  useEffect(() => {
    getDictionaryClient(lang as 'en' | 'es').then(setDict);
  }, [lang]);

  const t = (key: string, fallback: string): string => dict?.admin?.[key] || fallback;

  const STATUS_LABEL: Record<string, string> = {
    pending: t('rxStatusPending', 'Pending'),
    partially_dispensed: t('rxStatusPartial', 'Partial'),
    dispensed: t('rxStatusDispensed', 'Dispensed'),
    expired: t('rxStatusExpired', 'Expired'),
    cancelled: t('rxStatusCancelled', 'Cancelled'),
  };

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<Prescription | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [dispensingIndexes, setDispensingIndexes] = useState<number[]>([]);
  const [dispensing, setDispensing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newRx, setNewRx] = useState(emptyRx);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  useEffect(() => {
    if (!showCreate) return;
    setProductsLoading(true);
    fetch('/api/products?isActive=true&limit=500')
      .then(res => res.json())
      .then(json => { if (json.success) setProducts(json.data || []); })
      .catch(() => { /* non-critical — falls back to manual drug-name entry */ })
      .finally(() => setProductsLoading(false));
  }, [showCreate]);

  const fetchPrescriptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/prescriptions${qs}`);
      const json = await res.json();
      if (json.success) setPrescriptions(json.data);
      else setError(json.error || dict?.admin?.rxFailedToLoad || 'Failed to load prescriptions');
    } catch {
      setError(dict?.admin?.rxFailedToLoad || 'Failed to load prescriptions');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dict]);

  useEffect(() => { fetchPrescriptions(); }, [fetchPrescriptions]);

  const openDetail = (rx: Prescription) => {
    setSelected(rx);
    setDispensingIndexes([]);
    setDetailOpen(true);
  };

  const openCreate = () => {
    setFormError(null);
    setShowCreate(true);
  };

  const handleDispense = async () => {
    if (!selected || dispensingIndexes.length === 0) return;
    setDispensing(true);
    try {
      const res = await fetch(`/api/prescriptions/${selected._id}/dispense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIndexes: dispensingIndexes }),
      });
      const json = await res.json();
      if (json.success) {
        showToast.success(t('rxDispensedSuccess', 'Items dispensed successfully'));
        setSelected(json.data);
        setDispensingIndexes([]);
        fetchPrescriptions();
      } else {
        showToast.error(json.error || t('rxDispenseFailed', 'Dispense failed'));
      }
    } catch {
      showToast.error(t('rxFailedToDispense', 'Failed to dispense'));
    } finally {
      setDispensing(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRx.patientName || !newRx.doctorName || !newRx.doctorPRCNumber || !newRx.validUntil) {
      setFormError(t('rxRequiredFields', 'Please fill all required fields.'));
      return;
    }
    setFormError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newRx,
          patientAge: newRx.patientAge ? Number(newRx.patientAge) : undefined,
          items: newRx.items.filter(i => i.drugName.trim()),
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast.success(t('rxCreatedSuccess', 'Prescription {number} created').replace('{number}', json.data.prescriptionNumber));
        setShowCreate(false);
        setNewRx(emptyRx());
        fetchPrescriptions();
      } else {
        setFormError(json.error || t('rxFailedToCreate', 'Failed to create'));
      }
    } catch {
      setFormError(t('rxFailedToCreatePrescription', 'Failed to create prescription'));
    } finally {
      setCreating(false);
    }
  };

  const updateItem = (idx: number, patch: Partial<ReturnType<typeof emptyItem>>) => {
    setNewRx(s => {
      const items = [...s.items];
      items[idx] = { ...items[idx], ...patch };
      return { ...s, items };
    });
  };

  const removeItem = (idx: number) => {
    setNewRx(s => ({ ...s, items: s.items.filter((_, i) => i !== idx) }));
  };

  const fmtDate =(d: string) => (d ? new Date(d).toLocaleDateString() : '—');
  const doctorLabel = (name: string) => `${t('rxDoctorPrefix', 'Dr.')} ${name}`;
  const statusBadge = (s: string) => (
    <span className={`px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_BADGE[s] || 'bg-gray-500 text-white'}`}>
      {STATUS_LABEL[s] || s.replace(/_/g, ' ')}
    </span>
  );

  const headers = [
    t('rxNumber', 'Rx #'),
    t('rxPatient', 'Patient'),
    t('rxDoctor', 'Doctor'),
    t('rxIssued', 'Issued'),
    t('rxValidUntil', 'Valid Until'),
    t('items', 'Items'),
    t('status', 'Status'),
    dict?.common?.actions || 'Actions',
  ];
  const rightAligned = new Set([5, 7]);

  const selectedOpen = !!selected && !CLOSED_STATUSES.includes(selected.status);
  const dispenseLabel = t('rxDispenseSelected', 'Dispense Selected ({count})').replace('{count}', String(dispensingIndexes.length));

  return (
    <>
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader title={t('rxTitle', 'Prescriptions')} description={t('rxSubtitle', 'Manage and dispense Rx prescriptions')} />

        <div className="space-y-4">
          {/* Toolbar: status presets left, CTA right */}
          <div className="flex items-center justify-between gap-3 flex-wrap bg-white border border-gray-300 p-3">
            <div className="flex gap-2 flex-wrap" role="group" aria-label={t('status', 'Status')}>
              {STATUS_FILTERS.map(s => {
                const active = statusFilter === s;
                return (
                  <button
                    key={s || 'all'}
                    onClick={() => setStatusFilter(s)}
                    aria-pressed={active}
                    className={`inline-flex items-center justify-center px-3 py-2 text-sm border transition-colors ${active ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'}`}
                  >
                    {s === '' ? t('all', 'All') : STATUS_LABEL[s]}
                  </button>
                );
              })}
            </div>
            {canCreate && (
              <button
                onClick={openCreate}
                className="inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors whitespace-nowrap"
              >
                {`+ ${t('rxNew', 'New Prescription')}`}
              </button>
            )}
          </div>

          {/* List */}
          {loading ? (
            <div className="text-center py-12 bg-white border border-gray-300">
              <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
              <p className="mt-3 text-gray-400 text-sm">{t('rxLoading', 'Loading prescriptions…')}</p>
            </div>
          ) : error ? (
            <div className="text-center py-12 bg-white border border-gray-300">
              <p className="text-win8-danger text-sm font-medium">{error}</p>
              <button
                onClick={fetchPrescriptions}
                className="mt-4 inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
              >
                {dict?.common?.retry || 'Retry'}
              </button>
            </div>
          ) : prescriptions.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400 bg-white border border-gray-300">
              {statusFilter
                ? t('rxNoneMatchFilters', 'No prescriptions match your filters.')
                : t('rxNoneYet', 'No prescriptions yet.')}
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
                  <tr>
                    {headers.map((h, i) => (
                      <th key={h} className={`px-4 py-3 font-medium ${rightAligned.has(i) ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {prescriptions.map(rx => {
                    const isSelected = detailOpen && selected?._id === rx._id;
                    return (
                      <tr
                        key={rx._id}
                        onClick={() => openDetail(rx)}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-brand-soft' : 'hover:bg-gray-100'}`}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-gray-900">{rx.prescriptionNumber}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{rx.patientName}</td>
                        <td className="px-4 py-3">
                          <p className="text-gray-700">{doctorLabel(rx.doctorName)}</p>
                          <p className="text-xs text-gray-400 font-mono">{t('rxPrc', 'PRC')} {rx.doctorPRCNumber || '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{fmtDate(rx.issuedDate)}</td>
                        <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{fmtDate(rx.validUntil)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700">{rx.items.length.toLocaleString()}</td>
                        <td className="px-4 py-3">{statusBadge(rx.status)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <button
                              onClick={e => { e.stopPropagation(); openDetail(rx); }}
                              title={t('rxView', 'View prescription')}
                              aria-label={`${t('rxView', 'View prescription')} ${rx.prescriptionNumber}`}
                              className="inline-flex items-center justify-center p-2.5 text-white bg-brand hover:brightness-110 transition-[filter]"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail / dispense drawer */}
      <Win8Drawer open={detailOpen} onClose={() => setDetailOpen(false)}>
        <div className="flex items-center justify-between gap-3 px-6 py-4 bg-brand-navy text-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-base font-semibold font-mono truncate">{selected?.prescriptionNumber}</h2>
            {selected && statusBadge(selected.status)}
          </div>
          <button
            type="button"
            onClick={() => setDetailOpen(false)}
            title={dict?.common?.close || 'Close'}
            aria-label={dict?.common?.close || 'Close'}
            className="text-white/70 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {selected && (
          <>
            <div className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-gray-500">{t('rxPatientLabel', 'Patient:')}</dt>
                <dd className="font-medium text-gray-900">{selected.patientName}</dd>
                <dt className="text-gray-500">{t('rxDoctorLabel', 'Doctor:')}</dt>
                <dd className="text-gray-900">
                  {doctorLabel(selected.doctorName)}
                  <span className="block text-xs text-gray-400 font-mono">{t('rxPrc', 'PRC')} {selected.doctorPRCNumber || '—'}</span>
                </dd>
                <dt className="text-gray-500">{t('rxValidUntilLabel', 'Valid until:')}</dt>
                <dd className="text-gray-900">{fmtDate(selected.validUntil)}</dd>
                {selected.notes && (
                  <>
                    <dt className="text-gray-500">{t('rxNotesLabel', 'Notes:')}</dt>
                    <dd className="text-gray-900 whitespace-pre-line">{selected.notes}</dd>
                  </>
                )}
              </dl>

              <hr className="border-gray-300" />

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('rxItemsLabel', 'Items')}</p>
                <div className="space-y-2">
                  {selected.items.map((item, idx) => {
                    const selectable = !item.dispensed && selectedOpen && canDispense;
                    const checked = dispensingIndexes.includes(idx);
                    const body = (
                      <div className="text-sm min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-gray-900">{item.drugName}</p>
                          {item.dispensed && (
                            <span className="px-2 py-0.5 text-xs font-semibold bg-win8-success text-white shrink-0">{t('rxStatusDispensed', 'Dispensed')}</span>
                          )}
                        </div>
                        <p className="text-gray-500">
                          {t('rxUnits', '{count} unit(s)').replace('{count}', item.quantity.toLocaleString())} · {item.dosage || '—'} · {item.frequency || '—'}
                        </p>
                        {item.instructions && <p className="text-gray-400 text-xs">{item.instructions}</p>}
                        {item.dispensed && item.dispensedAt && (
                          <p className="text-win8-success text-xs mt-0.5">
                            {t('rxDispensedPrefix', 'Dispensed')} {new Date(item.dispensedAt).toLocaleString(undefined, { hour12: true })}
                          </p>
                        )}
                      </div>
                    );
                    return selectable ? (
                      <label
                        key={idx}
                        className={`flex items-start gap-3 p-3 border cursor-pointer transition-colors ${checked ? 'bg-brand-soft border-brand' : 'border-gray-300 hover:bg-gray-100'}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => setDispensingIndexes(prev =>
                            e.target.checked ? [...prev, idx] : prev.filter(i => i !== idx)
                          )}
                          className="checkbox-win8 mt-0.5"
                        />
                        {body}
                      </label>
                    ) : (
                      <div key={idx} className={`flex items-start gap-3 p-3 border border-gray-300 ${item.dispensed ? 'bg-gray-100' : ''}`}>
                        {body}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
              >
                {dict?.common?.close || 'Close'}
              </button>
              {canDispense && selectedOpen && (
                <button
                  type="button"
                  onClick={handleDispense}
                  disabled={dispensingIndexes.length === 0 || dispensing}
                  className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
                >
                  {dispensing ? t('rxDispensing', 'Dispensing…') : dispenseLabel}
                </button>
              )}
            </div>
          </>
        )}
      </Win8Drawer>

      {/* Create drawer */}
      <Win8Drawer open={showCreate} onClose={() => setShowCreate(false)} widthClass="max-w-2xl">
        <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
          <h2 className="text-base font-semibold">{t('rxNew', 'New Prescription')}</h2>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            title={dict?.common?.close || 'Close'}
            aria-label={dict?.common?.close || 'Close'}
            className="text-white/70 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleCreate} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="rx-patient" className={LABEL}>{t('rxPatientName', 'Patient Name')} <span className="text-win8-danger">*</span></label>
                <input id="rx-patient" className={INPUT} value={newRx.patientName} onChange={e => setNewRx(s => ({ ...s, patientName: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="rx-age" className={LABEL}>{t('rxAge', 'Age')}</label>
                <input id="rx-age" type="number" min={0} className={INPUT} value={newRx.patientAge} onChange={e => setNewRx(s => ({ ...s, patientAge: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="rx-doctor" className={LABEL}>{t('rxDoctorName', 'Doctor Name')} <span className="text-win8-danger">*</span></label>
                <input id="rx-doctor" className={INPUT} value={newRx.doctorName} onChange={e => setNewRx(s => ({ ...s, doctorName: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="rx-prc" className={LABEL}>{t('rxDoctorPRC', 'Doctor PRC No.')} <span className="text-win8-danger">*</span></label>
                <input id="rx-prc" className={`${INPUT} font-mono`} value={newRx.doctorPRCNumber} onChange={e => setNewRx(s => ({ ...s, doctorPRCNumber: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="rx-issued" className={LABEL}>{t('rxIssuedDate', 'Issued Date')}</label>
                <input id="rx-issued" type="date" className={INPUT} value={newRx.issuedDate} onChange={e => setNewRx(s => ({ ...s, issuedDate: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="rx-valid" className={LABEL}>{t('rxValidUntil', 'Valid Until')} <span className="text-win8-danger">*</span></label>
                <input id="rx-valid" type="date" className={INPUT} value={newRx.validUntil} onChange={e => setNewRx(s => ({ ...s, validUntil: e.target.value }))} />
              </div>
            </div>
            <div>
              <label htmlFor="rx-clinic" className={LABEL}>{t('rxClinicHospital', 'Clinic / Hospital')}</label>
              <input id="rx-clinic" className={INPUT} value={newRx.doctorClinic} onChange={e => setNewRx(s => ({ ...s, doctorClinic: e.target.value }))} />
            </div>

            <hr className="border-gray-300" />

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('rxDrugItems', 'Drug Items')}</p>
                <button
                  type="button"
                  onClick={() => setNewRx(s => ({ ...s, items: [...s.items, emptyItem()] }))}
                  className="inline-flex items-center justify-center px-3 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
                >
                  {t('rxAddItem', '+ Add Item')}
                </button>
              </div>
              <div className="space-y-2">
                {newRx.items.map((item, idx) => {
                  const matchedProduct = products.find(p => p._id === item.productId);
                  return (
                    <div key={idx} className="border border-gray-300 p-3 space-y-2">
                      <div>
                        <div className="flex gap-2">
                          <DrugNameCombobox
                            value={item.drugName}
                            products={products}
                            productsLoading={productsLoading}
                            placeholder={t('rxDrugNamePlaceholder', 'Drug name *')}
                            loadingText={t('rxSuggestLoading', 'Loading products…')}
                            noMatchText={t('rxSuggestNoMatch', 'No matching product. It will be saved as a free-text drug.')}
                            stockLabel={t('rxStockLabel', 'Stock')}
                            onChange={(drugName, product) => updateItem(idx, { drugName, productId: product?._id })}
                          />
                          {newRx.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              title={t('rxRemoveItem', 'Remove item')}
                              aria-label={`${t('rxRemoveItem', 'Remove item')} ${idx + 1}`}
                              className="inline-flex items-center justify-center p-2.5 text-white bg-win8-danger hover:brightness-110 transition-[filter] shrink-0"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12.1a2 2 0 0 1-2 1.9H9.7a2 2 0 0 1-2-1.9L7 7h10Z" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {item.productId ? (
                          <p className="text-xs text-win8-success mt-1">
                            {t('rxLinkedToInventory', 'Linked to inventory')}
                            {matchedProduct?.drugSchedule === 'dangerous' ? t('rxDangerousDrugSuffix', ' — dangerous drug (PDEA license required to dispense)') : ''}
                          </p>
                        ) : (
                          <p className="text-xs text-win8-warning mt-1">{t('rxNotLinked', "Not linked to inventory — stock won't be deducted on dispense")}</p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          placeholder={t('rxDosagePlaceholder', 'Dosage e.g. 500mg')}
                          aria-label={t('rxDosagePlaceholder', 'Dosage e.g. 500mg')}
                          className={INPUT}
                          value={item.dosage}
                          onChange={e => updateItem(idx, { dosage: e.target.value })}
                        />
                        <input
                          placeholder={t('rxFrequencyPlaceholder', 'Frequency e.g. 3x daily')}
                          aria-label={t('rxFrequencyPlaceholder', 'Frequency e.g. 3x daily')}
                          className={INPUT}
                          value={item.frequency}
                          onChange={e => updateItem(idx, { frequency: e.target.value })}
                        />
                        <input
                          type="number"
                          min={1}
                          placeholder={t('rxQtyPlaceholder', 'Qty')}
                          aria-label={t('rxQtyPlaceholder', 'Qty')}
                          className={`${INPUT} tabular-nums`}
                          value={item.quantity}
                          onChange={e => updateItem(idx, { quantity: Number(e.target.value) })}
                        />
                        <input
                          placeholder={t('rxInstructionsPlaceholder', 'Instructions (optional)')}
                          aria-label={t('rxInstructionsPlaceholder', 'Instructions (optional)')}
                          className={INPUT}
                          value={item.instructions}
                          onChange={e => updateItem(idx, { instructions: e.target.value })}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="rx-notes" className={LABEL}>{t('notes', 'Notes')}</label>
              <textarea id="rx-notes" rows={2} className={`${INPUT} resize-none`} value={newRx.notes} onChange={e => setNewRx(s => ({ ...s, notes: e.target.value }))} />
            </div>

            {formError && <div className="bg-win8-danger text-white text-sm p-3">{formError}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
            >
              {dict?.common?.cancel || 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {creating ? t('rxCreating', 'Creating…') : t('rxCreate', 'Create Prescription')}
            </button>
          </div>
        </form>
      </Win8Drawer>
    </>
  );
}
