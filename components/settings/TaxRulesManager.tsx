'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { MapPin, Pencil, Plus, Power, Receipt, Trash2 } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  ICON, CHECKBOX, CHECK_ROW, DARK_KEY_PRIMARY, HINT, INPUT, KEY, KEY_PRIMARY, LABEL, ROW_KEY,
  LedReadout, RegisterPage, Sheet, Strip,
} from '@/components/admin/register-ui';
import { useConfirm } from '@/lib/confirm';
import type { ITenantSettings } from '@/types/tenant';

type Scope = 'all' | 'products' | 'services' | 'categories';

interface TaxRule {
  _id: string;
  name: string;
  rate: number;
  label: string;
  appliesTo?: Scope;
  categoryIds?: string[];
  productIds?: string[];
  region?: { country?: string; state?: string; city?: string; zipCodes?: string[] };
  priority: number;
  isActive: boolean;
}

type Dict = Record<string, Record<string, string | undefined> | undefined>;

const SCOPES: Scope[] = ['all', 'products', 'services', 'categories'];

const hasRegion = (r?: TaxRule['region']) => !!(r && (r.country || r.state || r.city || r.zipCodes?.length));

/** Formats a rate the way a till prints it: 12% stays 12%, 7.5% keeps its decimal. */
const pct = (rate: number) => `${Number.isInteger(rate) ? rate : rate.toFixed(2).replace(/0$/, '')}%`;

/**
 * The tenant's tax table. Rules are printed as lines on one slip, highest priority first,
 * because the first active rule that matches a sale sets that sale's rate.
 */
export default function TaxRulesManager({ settings, dict, header }: {
  settings: ITenantSettings;
  dict: Dict;
  header: { tag?: string; title: string; subtitle?: string };
}) {
  const [rules, setRules] = useState<TaxRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sheetRule, setSheetRule] = useState<TaxRule | null | undefined>(undefined); // undefined: closed, null: new
  const [busyId, setBusyId] = useState<string | null>(null);
  const { confirm, Dialog } = useConfirm();

  const dictRef = useRef(dict);
  dictRef.current = dict;
  const tr = (key: string, fallback: string) => dict.taxRules?.[key] || fallback;

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tax-rules', { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setRules(data.data || []);
        setLoadError('');
      } else {
        setLoadError(data?.error || dictRef.current.taxRules?.failedToLoad || 'Failed to load tax rules');
      }
    } catch {
      setLoadError(dictRef.current.taxRules?.failedToLoad || 'Failed to load tax rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const activeRules = rules.filter((r) => r.isActive);
  const sorted = [...rules].sort((a, b) => Number(b.isActive) - Number(a.isActive) || b.priority - a.priority);

  const send = async (rule: TaxRule, method: 'PATCH' | 'DELETE', body: object | null, ok: string, fail: string) => {
    setBusyId(rule._id);
    try {
      const res = await fetch(`/api/tax-rules/${rule._id}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        toast.success(ok);
        await fetchRules();
      } else {
        toast.error(data?.error || fail);
      }
    } catch {
      toast.error(fail);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (rule: TaxRule) => {
    const ok = await confirm(
      tr('deleteRuleTitle', 'Delete {name}?').replace('{name}', rule.name),
      tr('deleteRuleWarning', 'Sales from now on stop using this rule. Past receipts keep the tax they were charged. To pause it instead, switch it off.'),
      { variant: 'danger', confirmText: dict.common?.delete || 'Delete', cancelText: dict.common?.cancel || 'Cancel' }
    );
    if (!ok) return;
    await send(rule, 'DELETE', null, tr('ruleDeleted', 'Tax rule deleted'), tr('failedToDelete', 'Failed to delete tax rule'));
  };

  const handleToggle = (rule: TaxRule) =>
    send(rule, 'PATCH', { isActive: !rule.isActive },
      rule.isActive ? tr('ruleSwitchedOff', 'Tax rule switched off') : tr('ruleSwitchedOn', 'Tax rule switched on'),
      tr('failedToSave', 'Failed to save tax rule'));

  // Spinner only before the first answer, so refetches keep the table (and any open sheet) on screen.
  const [loadedOnce, setLoadedOnce] = useState(false);
  if (!loading && !loadedOnce) setLoadedOnce(true);

  if (!loadedOnce) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const scopeLabel: Record<Scope, string> = {
    all: tr('allProductsServices', 'All Products & Services'),
    products: tr('productsOnly', 'Products Only'),
    services: tr('servicesOnly', 'Services Only'),
    categories: tr('specificCategories', 'Specific Categories'),
  };
  // A rule that applies to everything, everywhere, catches any sale the others miss.
  const hasCatchAll = activeRules.some((r) => (r.appliesTo ?? 'all') === 'all' && !hasRegion(r.region) && !r.productIds?.length);
  const settingsRate = settings.taxEnabled && settings.taxRate
    ? `${pct(settings.taxRate)} ${settings.taxLabel || 'Tax'}`
    : tr('settingsNoTax', 'no tax');
  const editLabel = dict.common?.edit || 'Edit';
  const deleteLabel = dict.common?.delete || 'Delete';

  return (
    <RegisterPage
      tagNo="TX"
      tag={header.tag}
      title={header.title}
      subtitle={header.subtitle}
      side={<LedReadout value={activeRules.length} label={dict.admin?.activeNow || 'Active'} />}
    >
      {Dialog}
      <div className="mt-6 grid gap-6 xl:grid-cols-12">

        <section className="min-w-0 xl:col-span-8">
          <div className="mb-3 flex justify-end">
            <button type="button" onClick={() => setSheetRule(null)} className={DARK_KEY_PRIMARY}>
              <Plus className={ICON} strokeWidth={1.75} aria-hidden />
              {tr('addTaxRule', 'Add Tax Rule')}
            </button>
          </div>

          {loadError && <div className="mb-3"><Strip tone="error">{loadError}</Strip></div>}

          <div className={`bg-paper-white text-ink transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-ink/30 px-4 py-3 sm:px-5">
              <h2 className="text-3xl sm:text-4xl">{tr('taxTable', 'Tax table')}</h2>
              <span className="font-receipt text-xs uppercase tracking-[0.08em] text-ink/60">{tr('priority', 'Priority')} ↓</span>
            </div>
            {sorted.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Receipt className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
                <p className="font-receipt text-sm text-ink/60">{tr('noRules', 'No tax rules yet. Add your first tax rule to get started.')}</p>
              </div>
            ) : (
              <ul className="divide-y divide-dashed divide-ink/20">
                {sorted.map((rule) => {
                  const busy = busyId === rule._id;
                  const scope = rule.appliesTo ?? 'all';
                  const region = [rule.region?.city, rule.region?.state, rule.region?.country].filter(Boolean).join(', ');
                  const zips = rule.region?.zipCodes?.length ? rule.region.zipCodes.join(', ') : '';
                  const toggleLabel = rule.isActive ? tr('switchOff', 'Switch off') : tr('switchOn', 'Switch on');
                  return (
                    <li key={rule._id} className={`px-4 py-3 sm:px-5 ${rule.isActive ? '' : 'bg-ink/[0.04]'}`}>
                      <div className="flex flex-wrap items-start gap-x-3">
                        <span className="mt-1 w-10 shrink-0 font-receipt text-xs text-ink/60" title={tr('priority', 'Priority')}>
                          P{rule.priority}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2 font-receipt">
                            <span className={`min-w-0 break-words text-sm font-semibold ${rule.isActive ? '' : 'text-ink/50 line-through'}`}>{rule.name}</span>
                            <span className="mk-leader" aria-hidden="true" />
                            <span className={`whitespace-nowrap text-base font-semibold ${rule.isActive ? '' : 'text-ink/50'}`}>
                              {pct(rule.rate)} <span className="text-xs font-medium uppercase">{rule.label}</span>
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-receipt text-[11px] uppercase tracking-[0.06em] text-ink/60">
                            <span>{scopeLabel[scope]}{scope === 'categories' ? ` · ${rule.categoryIds?.length || 0}` : ''}</span>
                            {(region || zips) && (
                              <span className="flex items-center gap-1 normal-case tracking-normal">
                                <MapPin className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                                {[region, zips].filter(Boolean).join(' · ')}
                              </span>
                            )}
                            {!rule.isActive && <span className="bg-ink/10 px-1.5 py-0.5 text-ink/70">{tr('inactive', 'Inactive')}</span>}
                          </div>
                        </div>
                        <div className="-my-1 flex w-full shrink-0 justify-end sm:w-auto">
                          <button type="button" disabled={busy} onClick={() => handleToggle(rule)} className={`${ROW_KEY} ${rule.isActive ? 'hover:text-stamp' : 'text-brand-hover'} disabled:opacity-40`} aria-label={`${toggleLabel} ${rule.name}`} aria-pressed={rule.isActive} title={toggleLabel}>
                            <Power className={ICON} strokeWidth={1.75} aria-hidden />
                          </button>
                          <button type="button" disabled={busy} onClick={() => setSheetRule(rule)} className={`${ROW_KEY} disabled:opacity-40`} aria-label={`${editLabel} ${rule.name}`} title={editLabel}>
                            <Pencil className={ICON} strokeWidth={1.75} aria-hidden />
                          </button>
                          <button type="button" disabled={busy} onClick={() => handleDelete(rule)} className={`${ROW_KEY} hover:text-stamp disabled:opacity-40`} aria-label={`${deleteLabel} ${rule.name}`} title={deleteLabel}>
                            <Trash2 className={ICON} strokeWidth={1.75} aria-hidden />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
        {/* How the till picks a rate, printed beside the table */}
        <aside className="space-y-3 xl:col-span-4">
          <div className="border border-white/15 px-4 py-4 font-receipt text-xs leading-relaxed text-paper/80">
            <p className="mb-2 uppercase tracking-[0.14em] text-[#8fe3d0]">{tr('howItWorks', 'How a rate is picked')}</p>
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>{tr('howHighestFirst', 'Active rules are checked from the highest priority down.')}</li>
              <li>{tr('howFirstMatch', 'The first rule that matches the sale sets its rate. Only one rate applies per sale.')}</li>
              <li>{tr('howRegion', 'A rule with a region only matches sales from that region.')}</li>
            </ol>
          </div>
          {activeRules.length === 0 ? (
            <Strip tone="ok">{tr('usingSettingsRate', 'No rule is active, so sales use the rate in Settings: {rate}.').replace('{rate}', settingsRate)}</Strip>
          ) : (
            <>
              {hasCatchAll ? (
                <Strip tone="ok">{tr('catchAllOverrides', 'A rule covers every sale, so the rate in Settings ({rate}) is not used.').replace('{rate}', settingsRate)}</Strip>
              ) : settings.taxEnabled && settings.taxRate ? (
                <Strip tone="ok">{tr('unmatchedUseSettings', 'A sale that no rule matches uses the rate in Settings: {rate}.').replace('{rate}', settingsRate)}</Strip>
              ) : (
                <Strip tone="error">{tr('unmatchedNoTax', 'A sale that no rule matches is charged no tax, because tax is off in Settings.')}</Strip>
              )}
            </>
          )}
        </aside>
      </div>

      {sheetRule !== undefined && (
        <TaxRuleSheet
          rule={sheetRule}
          dict={dict}
          onClose={() => setSheetRule(undefined)}
          onSaved={async () => {
            setSheetRule(undefined);
            await fetchRules();
          }}
        />
      )}
    </RegisterPage>
  );
}

function TaxRuleSheet({ rule, dict, onClose, onSaved }: {
  rule: TaxRule | null;
  dict: Dict;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const tr = (key: string, fallback: string) => dict.taxRules?.[key] || fallback;
  const [name, setName] = useState(rule?.name || '');
  const [rate, setRate] = useState(rule ? String(rule.rate) : '');
  const [label, setLabel] = useState(rule?.label || 'Tax');
  const [appliesTo, setAppliesTo] = useState<Scope>(rule?.appliesTo || 'all');
  const [priority, setPriority] = useState(String(rule?.priority ?? 0));
  const [isActive, setIsActive] = useState(rule?.isActive !== false);
  const [country, setCountry] = useState(rule?.region?.country || '');
  const [state, setState] = useState(rule?.region?.state || '');
  const [city, setCity] = useState(rule?.region?.city || '');
  const [zipCodes, setZipCodes] = useState(rule?.region?.zipCodes?.join(', ') || '');
  const [categoryIds, setCategoryIds] = useState<string[]>(rule?.categoryIds?.map(String) || []);
  const [categories, setCategories] = useState<Array<{ _id: string; name: string }> | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (appliesTo !== 'categories' || categories) return;
    fetch('/api/categories', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setCategories(data?.success ? data.data || [] : []))
      .catch(() => setCategories([]));
  }, [appliesTo, categories]);

  const scopeLabel: Record<Scope, string> = {
    all: tr('scopeAll', 'Everything'),
    products: tr('scopeProducts', 'Products'),
    services: tr('scopeServices', 'Services'),
    categories: tr('scopeCategories', 'Categories'),
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    const rateNum = Number(rate);
    if (!name.trim()) { setError(tr('nameRequired', 'Give the rule a name')); return; }
    if (rate.trim() === '' || !Number.isFinite(rateNum) || rateNum < 0 || rateNum > 100) { setError(tr('rateRange', 'Tax rate must be between 0 and 100')); return; }
    const prio = Number(priority || 0);
    if (!Number.isInteger(prio) || prio < 0 || prio > 1000) { setError(tr('priorityRange', 'Priority must be a whole number from 0 to 1000')); return; }
    // Drop ids of categories that no longer exist, or the server rejects the whole rule.
    const known = categories ? categoryIds.filter((id) => categories.some((c) => c._id === id)) : categoryIds;
    if (appliesTo === 'categories' && known.length === 0) { setError(tr('pickCategory', 'Pick at least one category')); return; }

    setSaving(true);
    try {
      const res = await fetch(rule ? `/api/tax-rules/${rule._id}` : '/api/tax-rules', {
        method: rule ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          rate: rateNum,
          label: label.trim() || 'Tax',
          appliesTo,
          // [] and {} rather than undefined when cleared: JSON drops undefined, so the PATCH kept the old value.
          categoryIds: appliesTo === 'categories' ? known : [],
          priority: prio,
          isActive,
          region: {
            country: country.trim(),
            state: state.trim(),
            city: city.trim(),
            zipCodes: zipCodes.split(',').map((z) => z.trim()).filter(Boolean),
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        toast.success(rule ? tr('ruleUpdated', 'Tax rule updated') : tr('ruleCreated', 'Tax rule added'));
        await onSaved();
      } else {
        setError(data?.error || tr('failedToSave', 'Failed to save tax rule'));
      }
    } catch {
      setError(tr('failedToSave', 'Failed to save tax rule'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      wide
      title={rule ? tr('editTaxRule', 'Edit Tax Rule') : tr('addTaxRule', 'Add Tax Rule')}
      subtitle={rule?.name}
      onClose={onClose}
      closeLabel={dict.common?.close || 'Close'}
      footer={
        <>
          <button type="button" onClick={onClose} className={KEY}>{dict.common?.cancel || 'Cancel'}</button>
          <button type="submit" form="tax-rule-form" disabled={saving} className={KEY_PRIMARY}>
            {saving ? (dict.common?.saving || 'Saving...') : tr('saveRule', 'Save Rule')}
          </button>
        </>
      }
    >
      <form id="tax-rule-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="tax-name" className={LABEL}>{tr('ruleName', 'Rule Name')} *</label>
          <input id="tax-name" type="text" maxLength={100} autoFocus value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder={tr('ruleNamePlaceholderPh', 'e.g. Standard VAT')} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="tax-rate" className={LABEL}>{tr('taxRate', 'Tax Rate (%)')} *</label>
            <input id="tax-rate" type="number" inputMode="decimal" min={0} max={100} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className={`${INPUT} font-receipt`} placeholder="12" />
          </div>
          <div>
            <label htmlFor="tax-label" className={LABEL}>{tr('taxLabel', 'Tax Label')}</label>
            <input id="tax-label" type="text" maxLength={30} value={label} onChange={(e) => setLabel(e.target.value)} className={`${INPUT} font-receipt uppercase`} placeholder="VAT" />
            <p className={HINT}>{tr('labelHint', 'Printed on the receipt next to the tax.')}</p>
          </div>
          <div>
            <label htmlFor="tax-priority" className={LABEL}>{tr('priorityLabel', 'Priority')}</label>
            <input id="tax-priority" type="number" inputMode="numeric" min={0} max={1000} step={1} value={priority} onChange={(e) => setPriority(e.target.value)} className={`${INPUT} font-receipt`} />
            <p className={HINT}>{tr('priorityHintShort', 'Higher is checked first.')}</p>
          </div>
        </div>

        <fieldset>
          <legend className={LABEL}>{tr('appliesToLabel', 'Applies To')}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SCOPES.map((s) => {
              const on = appliesTo === s;
              return (
                <label key={s} className={`flex min-h-[44px] cursor-pointer items-center justify-center border px-2 text-center font-receipt text-xs font-medium uppercase tracking-[0.08em] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-hover ${on ? 'border-ink bg-ink text-paper-white' : 'border-ink/25 text-ink hover:bg-paper'}`}>
                  <input type="radio" name="tax-scope" value={s} checked={on} onChange={() => setAppliesTo(s)} className="sr-only" />
                  {scopeLabel[s]}
                </label>
              );
            })}
          </div>
        </fieldset>

        {appliesTo === 'categories' && (
          <fieldset>
            <legend className={LABEL}>{tr('selectCategories', 'Categories')} *</legend>
            {categories === null ? (
              <div className="py-3"><LoadingSpinner size="sm" /></div>
            ) : categories.length === 0 ? (
              <p className={HINT}>{tr('noCategories', 'No categories found.')}</p>
            ) : (
              <div className="grid max-h-48 grid-cols-1 overflow-y-auto border border-ink/20 px-3 py-1 sm:grid-cols-2">
                {categories.map((c) => (
                  <label key={c._id} className={CHECK_ROW}>
                    <input
                      type="checkbox"
                      className={CHECKBOX}
                      checked={categoryIds.includes(c._id)}
                      onChange={() => setCategoryIds((prev) => (prev.includes(c._id) ? prev.filter((x) => x !== c._id) : [...prev, c._id]))}
                    />
                    <span className="min-w-0 truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}

        <fieldset>
          <legend className={LABEL}>{tr('regionOptional', 'Region (Optional)')}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { id: 'tax-country', value: country, set: setCountry, ph: tr('countryPlaceholder', 'Country') },
              { id: 'tax-state', value: state, set: setState, ph: tr('statePlaceholder', 'State/Province') },
              { id: 'tax-city', value: city, set: setCity, ph: tr('cityPlaceholder', 'City') },
            ].map((f) => (
              <div key={f.id}>
                <label htmlFor={f.id} className="mb-0.5 block font-receipt text-[11px] uppercase tracking-[0.08em] text-ink/50">{f.ph}</label>
                <input id={f.id} type="text" maxLength={60} value={f.value} onChange={(e) => f.set(e.target.value)} className={INPUT} />
              </div>
            ))}
          </div>
          <label htmlFor="tax-zips" className="mb-0.5 mt-3 block font-receipt text-[11px] uppercase tracking-[0.08em] text-ink/50">{tr('zipCodesLabel', 'ZIP codes')}</label>
          <input id="tax-zips" type="text" value={zipCodes} onChange={(e) => setZipCodes(e.target.value)} className={`${INPUT} font-receipt`} placeholder={tr('zipCodesPlaceholder', 'Zip Codes (comma-separated)')} />
          <p className={HINT}>{tr('regionHint', 'Leave blank to apply everywhere.')}</p>
        </fieldset>

        <label className={CHECK_ROW}>
          <input type="checkbox" className={CHECKBOX} checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          {tr('active', 'Active')}
        </label>

        {error && <Strip tone="error">{error}</Strip>}
      </form>
    </Sheet>
  );
}
