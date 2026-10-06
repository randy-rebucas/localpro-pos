'use client';

import { useState, useEffect } from 'react';
import Win8Drawer from '@/components/admin/Win8Drawer';
import { showToast } from '@/lib/toast';

type AppliesTo = 'all' | 'products' | 'services' | 'categories';

interface TaxRule {
  id: string;
  name: string;
  rate: number | string; // Prisma Decimal serializes as a string
  label: string;
  appliesTo?: AppliesTo;
  categoryIds?: string[];
  productIds?: string[];
  region?: {
    country?: string | null;
    state?: string | null;
    city?: string | null;
    zipCodes?: string[];
  };
  priority: number;
  isActive: boolean;
}

interface TaxRulesManagerProps {
  /** When false, the list is read-only (no create/edit/delete controls). */
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  dict?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-win8-success text-white',
  inactive: 'bg-gray-500 text-white',
};

const INPUT = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function appliesToLabel(value: AppliesTo | undefined, dict: any): string {
  switch (value) {
    case 'products': return dict?.taxRules?.productsOnly || 'Products Only';
    case 'services': return dict?.taxRules?.servicesOnly || 'Services Only';
    case 'categories': return dict?.taxRules?.specificCategories || 'Specific Categories';
    default: return dict?.taxRules?.allProductsServices || 'All Products & Services';
  }
}

export default function TaxRulesManager({ canCreate = true, canEdit = true, canDelete = true, dict }: TaxRulesManagerProps) {
  const showRowActions = canEdit || canDelete;
  const [rules, setRules] = useState<TaxRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  // Kept after close so the drawer title doesn't flip mid-animation; reset on open.
  const [editing, setEditing] = useState<TaxRule | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRules();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRules = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch(`/api/tax-rules`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setRules(data.data || []);
      } else {
        setLoadError(data.error || dict?.taxRules?.failedToLoad || 'Failed to load tax rules');
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setLoadError(error.message || dict?.taxRules?.failedToLoad || 'Failed to load tax rules');
    } finally {
      setLoading(false);
    }
  };

  const openForm = (rule: TaxRule | null) => {
    setEditing(rule);
    setFormKey((k) => k + 1);
    setShowForm(true);
  };

  /** Returns an error message for the drawer, or null on success. */
  const handleSave = async (rule: Partial<TaxRule>): Promise<string | null> => {
    try {
      const url = editing ? `/api/tax-rules/${editing.id}` : '/api/tax-rules';
      const method = editing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(rule),
      });

      const data = await res.json();
      if (data.success) {
        showToast.success(editing ? (dict?.taxRules?.ruleUpdated || 'Tax rule updated successfully') : (dict?.taxRules?.ruleCreated || 'Tax rule created successfully'));
        setShowForm(false);
        fetchRules();
        return null;
      }
      return data.error || dict?.taxRules?.failedToSave || 'Failed to save tax rule';
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      return error.message || dict?.taxRules?.failedToSave || 'Failed to save tax rule';
    }
  };

  const handleDelete = async (rule: TaxRule) => {
    const prompt = (dict?.taxRules?.deleteConfirmNamed || 'Delete tax rule "{name}"? This cannot be undone.').replace('{name}', rule.name);
    if (!confirm(prompt)) return;

    try {
      setDeletingId(rule.id);
      const res = await fetch(`/api/tax-rules/${rule.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        showToast.success(dict?.taxRules?.ruleDeleted || 'Tax rule deleted successfully');
        fetchRules();
      } else {
        showToast.error(data.error || dict?.taxRules?.failedToDelete || 'Failed to delete tax rule');
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      showToast.error(error.message || dict?.taxRules?.failedToDelete || 'Failed to delete tax rule');
    } finally {
      setDeletingId(null);
    }
  };

  const hasFilters = search.trim() !== '' || statusFilter !== '';
  const query = search.trim().toLowerCase();
  const visibleRules = [...rules]
    .sort((a, b) => b.priority - a.priority)
    .filter((r) => {
      if (statusFilter === 'active' && !r.isActive) return false;
      if (statusFilter === 'inactive' && r.isActive) return false;
      if (query && !`${r.name} ${r.label}`.toLowerCase().includes(query)) return false;
      return true;
    });

  const headers = [
    dict?.taxRules?.colName || 'Name',
    dict?.taxRules?.colRate || 'Rate',
    dict?.taxRules?.colAppliesTo || 'Applies To',
    dict?.taxRules?.colRegion || 'Region',
    dict?.taxRules?.colPriority || 'Priority',
    dict?.taxRules?.colStatus || 'Status',
    ...(showRowActions ? [dict?.taxRules?.colActions || 'Actions'] : []),
  ];
  // Rate, Priority and Actions are right-aligned.
  const rightAlignedCols = new Set([1, 4, 6]);

  return (
    <>
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap bg-white border border-gray-300 p-3">
          <div className="flex gap-3 flex-wrap">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={dict?.taxRules?.searchPlaceholder || 'Search by name or label…'}
                aria-label={dict?.taxRules?.searchAria || 'Search tax rules'}
                className="pl-8 pr-3 py-2 border border-gray-300 text-sm w-56"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label={dict?.taxRules?.filterByStatus || 'Filter by status'}
              className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900"
            >
              <option value="">{dict?.taxRules?.allStatuses || 'All statuses'}</option>
              <option value="active">{dict?.taxRules?.active || 'Active'}</option>
              <option value="inactive">{dict?.taxRules?.inactive || 'Inactive'}</option>
            </select>
          </div>
          {canCreate && (
            <button
              onClick={() => openForm(null)}
              className="inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
            >
              + {dict?.taxRules?.addTaxRule || 'Add Tax Rule'}
            </button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
            <p className="mt-3 text-gray-400 text-sm">{dict?.taxRules?.loading || 'Loading tax rules…'}</p>
          </div>
        ) : loadError ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <p className="text-win8-danger text-sm font-medium">{loadError}</p>
            <button
              onClick={fetchRules}
              className="mt-4 inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
            >
              {dict?.common?.retry || 'Retry'}
            </button>
          </div>
        ) : visibleRules.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
            {hasFilters
              ? (dict?.taxRules?.noRulesMatch || 'No tax rules match your filters.')
              : (dict?.taxRules?.noRules || 'No tax rules yet. Add your first tax rule to get started.')}
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
                <tr>
                  {headers.map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-3 font-medium ${rightAlignedCols.has(i) ? 'text-right' : 'text-left'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visibleRules.map((rule) => {
                  const regionParts = [rule.region?.city, rule.region?.state, rule.region?.country].filter(Boolean);
                  const zipCodes = rule.region?.zipCodes || [];
                  const status = rule.isActive ? 'active' : 'inactive';
                  return (
                    <tr key={rule.id} className="hover:bg-gray-100 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{rule.name}</p>
                        <p className="text-xs text-gray-400">{rule.label}</p>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900 font-medium">
                        {Number(rule.rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700">
                        {appliesToLabel(rule.appliesTo, dict)}
                        {rule.appliesTo === 'categories' && (
                          <span className="text-gray-400 tabular-nums"> ({(rule.categoryIds || []).length})</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700">
                        {regionParts.length > 0 ? regionParts.join(', ') : '—'}
                        {zipCodes.length > 0 && (
                          <p className="text-gray-400 font-mono max-w-[200px] truncate" title={zipCodes.join(', ')}>
                            {zipCodes.join(', ')}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">{rule.priority}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[status] || 'bg-gray-500 text-white'}`}>
                          {rule.isActive ? (dict?.taxRules?.active || 'Active') : (dict?.taxRules?.inactive || 'Inactive')}
                        </span>
                      </td>
                      {showRowActions && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            {canEdit && (<button
                              onClick={() => openForm(rule)}
                              title={dict?.taxRules?.editRuleAria || 'Edit tax rule'}
                              aria-label={`${dict?.taxRules?.editRuleAria || 'Edit tax rule'}: ${rule.name}`}
                              className="inline-flex items-center justify-center p-2.5 text-white bg-brand hover:brightness-110 transition-[filter]"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
                              </svg>
                            </button>)}
                            {canDelete && (<button
                              onClick={() => handleDelete(rule)}
                              disabled={deletingId === rule.id}
                              title={dict?.taxRules?.deleteRuleAria || 'Delete tax rule'}
                              aria-label={`${dict?.taxRules?.deleteRuleAria || 'Delete tax rule'}: ${rule.name}`}
                              className="inline-flex items-center justify-center p-2.5 text-white bg-win8-danger hover:brightness-110 disabled:opacity-50 transition-[filter]"
                            >
                              {deletingId === rule.id ? (
                                <span className="win8-spinner win8-spinner-sm"><span /><span /><span /><span /><span /></span>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12.1a2 2 0 0 1-2 1.9H9.7a2 2 0 0 1-2-1.9L7 7h10Z" />
                                </svg>
                              )}
                            </button>)}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Win8Drawer open={showForm} onClose={() => setShowForm(false)}>
        <TaxRuleForm
          key={formKey}
          rule={editing}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
          dict={dict}
        />
      </Win8Drawer>
    </>
  );
}

function TaxRuleForm({
  rule,
  onSave,
  onCancel,
  dict,
}: {
  rule: TaxRule | null;
  onSave: (rule: Partial<TaxRule>) => Promise<string | null>;
  onCancel: () => void;
  dict?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const [name, setName] = useState(rule?.name || '');
  const [rate, setRate] = useState(rule?.rate?.toString() || '0');
  const [label, setLabel] = useState(rule?.label || 'Tax');
  const [appliesTo, setAppliesTo] = useState<AppliesTo>(rule?.appliesTo || 'all');
  const [priority, setPriority] = useState(rule?.priority?.toString() || '0');
  const [isActive, setIsActive] = useState(rule?.isActive !== false);
  const [country, setCountry] = useState(rule?.region?.country || '');
  const [state, setState] = useState(rule?.region?.state || '');
  const [city, setCity] = useState(rule?.region?.city || '');
  const [zipCodes, setZipCodes] = useState(rule?.region?.zipCodes?.join(', ') || '');
  const [categoryIds, setCategoryIds] = useState<string[]>(rule?.categoryIds || []);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (appliesTo !== 'categories') return;
    fetch('/api/categories', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => { if (data.success) setCategories(data.data || []); })
      .catch(() => { /* non-critical */ });
  }, [appliesTo]);

  const toggleCategory = (id: string) => {
    setCategoryIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const error = await onSave({
      name,
      rate: parseFloat(rate),
      label,
      appliesTo,
      // Always send the list so switching away from "Specific Categories" clears old links.
      categoryIds: appliesTo === 'categories' ? categoryIds : [],
      priority: parseInt(priority) || 0,
      isActive,
      region: country || state || city || zipCodes ? {
        country: country || undefined,
        state: state || undefined,
        city: city || undefined,
        zipCodes: zipCodes ? zipCodes.split(',').map((z) => z.trim()).filter(Boolean) : undefined,
      } : undefined,
    });
    setSaving(false);
    if (error) setFormError(error);
  };

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
        <h2 className="text-base font-semibold">
          {rule ? (dict?.taxRules?.editTaxRule || 'Edit Tax Rule') : (dict?.taxRules?.addTaxRule || 'Add Tax Rule')}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          title={dict?.taxRules?.close || 'Close'}
          aria-label={dict?.taxRules?.close || 'Close'}
          className="text-white/70 hover:text-white"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div>
            <label htmlFor="tax-rule-name" className={LABEL}>{dict?.taxRules?.ruleName || 'Rule Name'} <span className="text-win8-danger">*</span></label>
            <input
              id="tax-rule-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT}
              placeholder={dict?.taxRules?.ruleNamePlaceholder || 'e.g., California Sales Tax'}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="tax-rule-rate" className={LABEL}>{dict?.taxRules?.taxRate || 'Tax Rate (%)'} <span className="text-win8-danger">*</span></label>
              <input
                id="tax-rule-rate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className={`${INPUT} tabular-nums`}
                required
              />
            </div>
            <div>
              <label htmlFor="tax-rule-label" className={LABEL}>{dict?.taxRules?.taxLabel || 'Tax Label'} <span className="text-win8-danger">*</span></label>
              <input
                id="tax-rule-label"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className={INPUT}
                placeholder={dict?.taxRules?.taxLabelPlaceholder || 'e.g., VAT, GST, Sales Tax'}
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="tax-rule-applies" className={LABEL}>{dict?.taxRules?.appliesToLabel || 'Applies To'}</label>
            <select
              id="tax-rule-applies"
              value={appliesTo}
              onChange={(e) => setAppliesTo(e.target.value as AppliesTo)}
              className={INPUT}
            >
              <option value="all">{dict?.taxRules?.allProductsServices || 'All Products & Services'}</option>
              <option value="products">{dict?.taxRules?.productsOnly || 'Products Only'}</option>
              <option value="services">{dict?.taxRules?.servicesOnly || 'Services Only'}</option>
              <option value="categories">{dict?.taxRules?.specificCategories || 'Specific Categories'}</option>
            </select>
          </div>

          {appliesTo === 'categories' && (
            <div>
              <p className={LABEL}>{dict?.taxRules?.selectCategories || 'Categories'} <span className="text-win8-danger">*</span></p>
              {categories.length === 0 ? (
                <p className="text-sm text-gray-400 italic">{dict?.taxRules?.noCategories || 'No categories found.'}</p>
              ) : (
                <div className="border border-gray-300 p-3 max-h-40 overflow-y-auto grid grid-cols-2 gap-y-2 gap-x-4">
                  {categories.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        className="checkbox-win8"
                        checked={categoryIds.includes(c.id)}
                        onChange={() => toggleCategory(c.id)}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              )}
              {categoryIds.length === 0 && (
                <p className="mt-2 p-3 bg-white border border-win8-warning text-win8-warning text-xs">
                  {dict?.taxRules?.noCategoriesSelectedWarning || 'No categories selected — this rule will not apply to anything until at least one is checked.'}
                </p>
              )}
            </div>
          )}

          <hr className="border-gray-300" />

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{dict?.taxRules?.regionOptional || 'Region (Optional)'}</p>
            <div className="grid grid-cols-3 gap-3">
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                aria-label={dict?.taxRules?.countryPlaceholder || 'Country'}
                className={INPUT}
                placeholder={dict?.taxRules?.countryPlaceholder || 'Country'}
              />
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                aria-label={dict?.taxRules?.statePlaceholder || 'State/Province'}
                className={INPUT}
                placeholder={dict?.taxRules?.statePlaceholder || 'State/Province'}
              />
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                aria-label={dict?.taxRules?.cityPlaceholder || 'City'}
                className={INPUT}
                placeholder={dict?.taxRules?.cityPlaceholder || 'City'}
              />
            </div>
            <input
              type="text"
              value={zipCodes}
              onChange={(e) => setZipCodes(e.target.value)}
              aria-label={dict?.taxRules?.zipCodesPlaceholder || 'Zip Codes (comma-separated)'}
              className={`${INPUT} mt-3 font-mono`}
              placeholder={dict?.taxRules?.zipCodesPlaceholder || 'Zip Codes (comma-separated)'}
            />
          </div>

          <hr className="border-gray-300" />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="tax-rule-priority" className={LABEL}>{dict?.taxRules?.priorityLabel || 'Priority'}</label>
              <input
                id="tax-rule-priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={`${INPUT} tabular-nums`}
                placeholder="0"
              />
              <p className="text-xs text-gray-400 mt-1">{dict?.taxRules?.priorityHint || 'Higher priority rules are applied first'}</p>
            </div>
            <div className="pt-6">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="checkbox-win8"
                />
                {dict?.taxRules?.active || 'Active'}
              </label>
            </div>
          </div>

          {formError && <div className="bg-win8-danger text-white text-sm p-3">{formError}</div>}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100"
          >
            {dict?.common?.cancel || 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {saving
              ? (dict?.taxRules?.saving || 'Saving…')
              : rule ? (dict?.taxRules?.saveRule || 'Save Rule') : (dict?.taxRules?.createRule || 'Create Rule')}
          </button>
        </div>
      </form>
    </>
  );
}
