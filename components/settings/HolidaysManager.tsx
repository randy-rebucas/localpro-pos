'use client';

import { useState, useEffect } from 'react';
import Win8Drawer from '@/components/admin/Win8Drawer';
import { showToast } from '@/lib/toast';

interface Holiday {
  id: string;
  name: string;
  date: string;
  type: 'single' | 'recurring';
  recurring?: {
    pattern: 'yearly' | 'monthly' | 'weekly';
    dayOfMonth?: number;
    dayOfWeek?: number;
    month?: number;
  };
  isBusinessClosed: boolean;
  createdAt?: Date;
}

interface HolidaysManagerProps {
  tenant: string;
  dict?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Add + import suggestions. The list and Retry are always usable. */
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

const TYPE_BADGE: Record<string, string> = {
  single: 'bg-brand-navy text-white',
  recurring: 'bg-win8-info text-white',
};

const INPUT = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';
const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_FALLBACK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function Spinner({ small }: { small?: boolean }) {
  return (
    <span className={`win8-spinner${small ? ' win8-spinner-sm' : ''}`}>
      <span /><span /><span /><span /><span />
    </span>
  );
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

export default function HolidaysManager({ tenant, dict, canCreate = true, canEdit = true, canDelete = true }: HolidaysManagerProps) {
  const showRowActions = canEdit || canDelete;
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // `editing` is only reset when the drawer opens, so its title doesn't flip
  // from "Edit" to "Add" while it slides out.
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    fetchHolidays();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `quiet` refetches after a write without swapping the table for a spinner.
  const fetchHolidays = async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);
      setLoadError(null);
      const res = await fetch(`/api/tenants/${tenant}/holidays`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setHolidays(data.data || []);
      } else {
        setLoadError(data.error || dict?.holidays?.failedToLoad || 'Failed to load holidays');
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setLoadError(error.message || dict?.holidays?.failedToLoad || 'Failed to load holidays');
    } finally {
      setLoading(false);
    }
  };

  const openForm = (holiday: Holiday | null) => {
    setEditing(holiday);
    setFormError(null);
    setFormKey((k) => k + 1);
    setShowForm(true);
  };

  const handleSave = async (holiday: Partial<Holiday>) => {
    try {
      setSaving(true);
      setFormError(null);
      const url = `/api/tenants/${tenant}/holidays`;
      const method = editing ? 'PUT' : 'POST';
      const body = editing ? { id: editing.id, ...holiday } : holiday;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.success) {
        showToast.success(editing ? (dict?.holidays?.holidayUpdated || 'Holiday updated successfully') : (dict?.holidays?.holidayCreated || 'Holiday created successfully'));
        setShowForm(false);
        fetchHolidays(true);
      } else {
        setFormError(data.error || dict?.holidays?.failedToSave || 'Failed to save holiday');
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error('Error saving holiday:', error);
      setFormError(error.message || dict?.holidays?.failedToSave || 'Failed to save holiday');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (holiday: Holiday) => {
    const prompt = (dict?.holidays?.deleteConfirmNamed || 'Delete holiday "{name}"? This cannot be undone.').replace('{name}', holiday.name);
    if (!confirm(prompt)) return;

    try {
      setDeletingId(holiday.id);
      const res = await fetch(`/api/tenants/${tenant}/holidays?id=${holiday.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        showToast.success(dict?.holidays?.holidayDeleted || 'Holiday deleted successfully');
        fetchHolidays(true);
      } else {
        showToast.error(data.error || dict?.holidays?.failedToDelete || 'Failed to delete holiday');
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      showToast.error(error.message || dict?.holidays?.failedToDelete || 'Failed to delete holiday');
    } finally {
      setDeletingId(null);
    }
  };

  const describeSchedule = (holiday: Holiday) => {
    if (holiday.type === 'single') return holiday.date || '—';
    const r = holiday.recurring;
    if (!r) return '—';
    const parts: string[] = [dict?.holidays?.[r.pattern] || r.pattern];
    if (r.pattern === 'weekly' && r.dayOfWeek !== undefined && r.dayOfWeek !== null) {
      parts.push(dict?.businessHours?.[WEEKDAY_KEYS[r.dayOfWeek]] || WEEKDAY_FALLBACK[r.dayOfWeek] || '');
    } else {
      if (r.month) parts.push((dict?.holidays?.monthTemplate || '(Month {month})').replace('{month}', String(r.month)));
      if (r.dayOfMonth) parts.push((dict?.holidays?.dayTemplate || '(Day {day})').replace('{day}', String(r.dayOfMonth)));
    }
    return parts.filter(Boolean).join(' ');
  };

  const headers = [
    dict?.holidays?.holiday || 'Holiday',
    dict?.common?.type || 'Type',
    dict?.holidays?.schedule || 'Schedule',
    dict?.holidays?.businessClosed || 'Business Closed',
  ];

  return (
    <>
      <div className="space-y-4">
        <fieldset disabled={!canCreate} className="flex items-center justify-between gap-3 flex-wrap bg-white border border-gray-300 p-3">
          <p className="text-sm text-gray-500 tabular-nums">
            {loading || loadError ? '' : (dict?.holidays?.count || '{count} holiday(s)').replace('{count}', holidays.length.toLocaleString())}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowSuggestions(true)}
              className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              {dict?.holidays?.suggestHolidays || 'Suggest Holidays'}
            </button>
            <button
              type="button"
              onClick={() => openForm(null)}
              className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              <span aria-hidden="true">+ </span>
              {dict?.holidays?.addHoliday || 'Add Holiday'}
            </button>
          </div>
        </fieldset>

        {loading ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
            <p className="mt-3 text-gray-400 text-sm">{dict?.holidays?.loading || 'Loading holidays…'}</p>
          </div>
        ) : loadError ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <p className="text-win8-danger text-sm font-medium">{loadError}</p>
            <button
              type="button"
              onClick={() => fetchHolidays()}
              className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
            >
              {dict?.common?.retry || 'Retry'}
            </button>
          </div>
        ) : holidays.length === 0 ? (
          <div className="text-center py-12 px-4 text-gray-400 bg-white border border-gray-300">
            {dict?.holidays?.noHolidays || 'No holidays configured. Add holidays to mark days when your business is closed.'}
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
                <tr>
                  {headers.map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                  {showRowActions && (
                    <th className="px-4 py-3 text-right font-medium">{dict?.common?.actions || 'Actions'}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {holidays.map((holiday) => (
                  <tr key={holiday.id} className="hover:bg-gray-100 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{holiday.name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold ${TYPE_BADGE[holiday.type] || 'bg-gray-500 text-white'}`}>
                        {holiday.type === 'single'
                          ? (dict?.holidays?.singleDate || 'Single Date')
                          : (dict?.holidays?.recurring || 'Recurring')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 tabular-nums">{describeSchedule(holiday)}</td>
                    <td className="px-4 py-3">
                      {holiday.isBusinessClosed ? (
                        <span className="px-2 py-0.5 text-xs font-semibold bg-win8-danger text-white">
                          {dict?.holidays?.businessClosed || 'Business Closed'}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs font-semibold bg-win8-success text-white">
                          {dict?.holidays?.businessOpen || 'Open'}
                        </span>
                      )}
                    </td>
                    {showRowActions && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          {canEdit && (<button
                            type="button"
                            onClick={() => openForm(holiday)}
                            title={dict?.common?.edit || 'Edit'}
                            aria-label={dict?.common?.edit || 'Edit'}
                            className="inline-flex items-center justify-center p-2.5 text-white bg-brand hover:brightness-110 transition-[filter]"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
                            </svg>
                          </button>)}
                          {canDelete && (<button
                            type="button"
                            onClick={() => handleDelete(holiday)}
                            disabled={deletingId === holiday.id}
                            title={dict?.common?.delete || 'Delete'}
                            aria-label={dict?.common?.delete || 'Delete'}
                            className="inline-flex items-center justify-center p-2.5 text-white bg-win8-danger hover:brightness-110 disabled:opacity-50 transition-[filter]"
                          >
                            {deletingId === holiday.id ? (
                              <Spinner small />
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Win8Drawer open={showForm} onClose={() => setShowForm(false)}>
        <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
          <h2 className="text-base font-semibold">
            {editing ? (dict?.holidays?.editHoliday || 'Edit Holiday') : (dict?.holidays?.addHoliday || 'Add Holiday')}
          </h2>
          <button
            type="button"
            onClick={() => setShowForm(false)}
            title={dict?.common?.close || 'Close'}
            aria-label={dict?.common?.close || 'Close'}
            className="text-white/70 hover:text-white"
          >
            <CloseIcon />
          </button>
        </div>
        <HolidayForm
          key={formKey}
          holiday={editing}
          saving={saving}
          error={formError}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
          dict={dict}
        />
      </Win8Drawer>

      <Win8Drawer open={showSuggestions} onClose={() => setShowSuggestions(false)}>
        <SuggestedHolidays
          tenant={tenant}
          dict={dict}
          onClose={() => setShowSuggestions(false)}
          onImported={(count) => {
            setShowSuggestions(false);
            showToast.success(
              (dict?.holidays?.holidaysImported || '{count} holiday(s) imported').replace('{count}', String(count))
            );
            fetchHolidays(true);
          }}
        />
      </Win8Drawer>
    </>
  );
}

function HolidayForm({
  holiday,
  saving,
  error,
  onSave,
  onCancel,
  dict,
}: {
  holiday: Holiday | null;
  saving: boolean;
  error: string | null;
  onSave: (holiday: Partial<Holiday>) => void;
  onCancel: () => void;
  dict?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const [name, setName] = useState(holiday?.name || '');
  const [type, setType] = useState<'single' | 'recurring'>(holiday?.type || 'single');
  const [date, setDate] = useState(holiday?.date || '');
  const [isBusinessClosed, setIsBusinessClosed] = useState(holiday?.isBusinessClosed !== false);
  const [recurringPattern, setRecurringPattern] = useState<'yearly' | 'monthly' | 'weekly'>(
    holiday?.recurring?.pattern || 'yearly'
  );
  const [month, setMonth] = useState(holiday?.recurring?.month?.toString() || '');
  const [dayOfMonth, setDayOfMonth] = useState(holiday?.recurring?.dayOfMonth?.toString() || '');
  const [dayOfWeek, setDayOfWeek] = useState(holiday?.recurring?.dayOfWeek?.toString() || '0');

  const required = <span className="text-win8-danger">*</span>;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name,
          type,
          date: type === 'single' ? date : '',
          isBusinessClosed,
          recurring:
            type === 'recurring'
              ? {
                  pattern: recurringPattern,
                  month: month ? parseInt(month) : undefined,
                  dayOfMonth: dayOfMonth ? parseInt(dayOfMonth) : undefined,
                  dayOfWeek: dayOfWeek ? parseInt(dayOfWeek) : undefined,
                }
              : undefined,
        });
      }}
      className="flex flex-col flex-1 min-h-0"
    >
      <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
        <div>
          <label htmlFor="holidayName" className={LABEL}>{dict?.holidays?.holidayName || 'Holiday Name'} {required}</label>
          <input
            id="holidayName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT}
            placeholder={dict?.holidays?.holidayNamePlaceholder || "e.g., New Year's Day"}
            required
          />
        </div>

        <div>
          <label htmlFor="holidayType" className={LABEL}>{dict?.holidays?.type || 'Type'} {required}</label>
          <select
            id="holidayType"
            value={type}
            onChange={(e) => setType(e.target.value as 'single' | 'recurring')}
            className={INPUT}
          >
            <option value="single">{dict?.holidays?.singleDate || 'Single Date'}</option>
            <option value="recurring">{dict?.holidays?.recurring || 'Recurring'}</option>
          </select>
        </div>

        {type === 'single' ? (
          <div>
            <label htmlFor="holidayDate" className={LABEL}>{dict?.holidays?.date || 'Date'} {required}</label>
            <input
              id="holidayDate"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={INPUT}
              required
            />
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="recurringPattern" className={LABEL}>{dict?.holidays?.recurringPattern || 'Recurring Pattern'} {required}</label>
              <select
                id="recurringPattern"
                value={recurringPattern}
                onChange={(e) => setRecurringPattern(e.target.value as any)} // eslint-disable-line @typescript-eslint/no-explicit-any
                className={INPUT}
              >
                <option value="yearly">{dict?.holidays?.yearly || 'Yearly'}</option>
                <option value="monthly">{dict?.holidays?.monthly || 'Monthly'}</option>
                <option value="weekly">{dict?.holidays?.weekly || 'Weekly'}</option>
              </select>
            </div>
            {recurringPattern === 'yearly' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="recurringMonth" className={LABEL}>{dict?.holidays?.monthRange || 'Month (1-12)'}</label>
                  <input
                    id="recurringMonth"
                    type="number"
                    min="1"
                    max="12"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className={`${INPUT} tabular-nums`}
                  />
                </div>
                <div>
                  <label htmlFor="recurringDayOfMonth" className={LABEL}>{dict?.holidays?.dayOfMonth || 'Day of Month (1-31)'}</label>
                  <input
                    id="recurringDayOfMonth"
                    type="number"
                    min="1"
                    max="31"
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(e.target.value)}
                    className={`${INPUT} tabular-nums`}
                  />
                </div>
              </div>
            )}
            {recurringPattern === 'weekly' && (
              <div>
                <label htmlFor="recurringDayOfWeek" className={LABEL}>{dict?.holidays?.dayOfWeek || 'Day of Week'}</label>
                <select
                  id="recurringDayOfWeek"
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(e.target.value)}
                  className={INPUT}
                >
                  {WEEKDAY_KEYS.map((key, i) => (
                    <option key={key} value={String(i)}>{dict?.businessHours?.[key] || WEEKDAY_FALLBACK[i]}</option>
                  ))}
                </select>
              </div>
            )}
            {recurringPattern === 'monthly' && (
              <div>
                <label htmlFor="recurringDayOfMonth" className={LABEL}>{dict?.holidays?.dayOfMonth || 'Day of Month (1-31)'}</label>
                <input
                  id="recurringDayOfMonth"
                  type="number"
                  min="1"
                  max="31"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                  className={`${INPUT} tabular-nums`}
                />
              </div>
            )}
          </>
        )}

        <hr className="border-gray-300" />

        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            id="isBusinessClosed"
            checked={isBusinessClosed}
            onChange={(e) => setIsBusinessClosed(e.target.checked)}
            className="checkbox-win8"
          />
          {dict?.holidays?.businessClosedLabel || 'Business is closed on this holiday'}
        </label>

        {error && <div role="alert" className="bg-win8-danger text-white text-sm p-3">{error}</div>}
      </div>

      <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
        >
          {dict?.common?.cancel || 'Cancel'}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
        >
          {saving ? (dict?.common?.saving || 'Saving…') : (dict?.holidays?.saveHoliday || 'Save Holiday')}
        </button>
      </div>
    </form>
  );
}

interface SuggestionHoliday {
  name: string;
  date: string;
  type: 'public' | 'bank';
  alreadyAdded: boolean;
}

interface CountryOption {
  code: string;
  name: string;
}

function SuggestedHolidays({
  tenant,
  dict,
  onClose,
  onImported,
}: {
  tenant: string;
  dict?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [availableCountries, setAvailableCountries] = useState<CountryOption[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionHoliday[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const year = new Date().getFullYear();

  const fetchSuggestions = async (countryOverride?: string) => {
    try {
      setLoading(true);
      setError(null);
      const query = new URLSearchParams({ year: String(year) });
      if (countryOverride) query.set('country', countryOverride);

      const res = await fetch(`/api/tenants/${tenant}/holidays/suggestions?${query.toString()}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setCountryCode(data.data.countryCode);
        setAvailableCountries(data.data.availableCountries || []);
        setSuggestions(data.data.holidays || []);
        const initialSelected: Record<string, boolean> = {};
        for (const h of data.data.holidays || []) {
          if (!h.alreadyAdded) initialSelected[h.date] = true;
        }
        setSelected(initialSelected);
      } else {
        setError(data.error || dict?.holidays?.failedToLoadSuggestions || 'Failed to load holiday suggestions');
      }
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setError(err.message || dict?.holidays?.failedToLoadSuggestions || 'Failed to load holiday suggestions');
    } finally {
      setLoading(false);
    }
  };

  // The drawer unmounts its children when closed, so this runs on every open.
  useEffect(() => {
    fetchSuggestions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const handleImport = async () => {
    const toImport = suggestions.filter((h) => selected[h.date] && !h.alreadyAdded);
    if (toImport.length === 0) return;

    try {
      setImporting(true);
      setError(null);
      const res = await fetch(`/api/tenants/${tenant}/holidays/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          holidays: toImport.map((h) => ({ name: h.name, date: h.date, isBusinessClosed: true })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        onImported(data.imported ?? toImport.length);
      } else {
        setError(data.error || dict?.holidays?.failedToImport || 'Failed to import holidays');
      }
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setError(err.message || dict?.holidays?.failedToImport || 'Failed to import holidays');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
        <div>
          <h2 className="text-base font-semibold">{dict?.holidays?.suggestHolidays || 'Suggest Holidays'}</h2>
          <p className="text-xs text-white/80">
            {(dict?.holidays?.suggestHolidaysDescription || "Public holidays for {year} from your country's calendar").replace('{year}', String(year))}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          title={dict?.common?.close || 'Close'}
          aria-label={dict?.common?.close || 'Close'}
          className="text-white/70 hover:text-white"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
        <div>
          <label htmlFor="suggestionsCountry" className={LABEL}>
            {dict?.holidays?.country || 'Country'}
          </label>
          <select
            id="suggestionsCountry"
            value={countryCode || ''}
            onChange={(e) => fetchSuggestions(e.target.value)}
            className={INPUT}
          >
            <option value="" disabled>
              {dict?.holidays?.selectCountry || 'Select a country'}
            </option>
            {availableCountries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          {!countryCode && !loading && (
            <p className="text-xs text-gray-400 mt-1">
              {dict?.holidays?.countryNotDetected ||
                "We couldn't match your tenant's configured country automatically — pick one above."}
            </p>
          )}
        </div>

        {error && (
          <div role="alert" className="p-3 bg-white border border-win8-danger text-win8-danger text-sm">{error}</div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
            <p className="mt-3 text-gray-400 text-sm">{dict?.holidays?.loading || 'Loading holidays…'}</p>
          </div>
        ) : countryCode && suggestions.length === 0 ? (
          <p className="text-sm text-gray-400 italic">
            {dict?.holidays?.noSuggestions || 'No public holidays found for this country/year.'}
          </p>
        ) : countryCode ? (
          <div className="border border-gray-300 divide-y divide-gray-200">
            {suggestions.map((h) => (
              <label
                key={h.date}
                htmlFor={`suggestion-${h.date}`}
                className={`flex items-center gap-3 px-4 py-3 ${h.alreadyAdded ? 'bg-gray-100 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-100 transition-colors'}`}
              >
                <input
                  type="checkbox"
                  id={`suggestion-${h.date}`}
                  checked={!!selected[h.date]}
                  disabled={h.alreadyAdded}
                  onChange={(e) => setSelected((prev) => ({ ...prev, [h.date]: e.target.checked }))}
                  className="checkbox-win8 disabled:opacity-50"
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-gray-900">{h.name}</span>
                  <span className="block text-xs text-gray-500 tabular-nums">{h.date}</span>
                </span>
                {h.alreadyAdded && (
                  <span className="px-2 py-0.5 text-xs font-semibold bg-gray-500 text-white shrink-0">
                    {dict?.holidays?.alreadyAdded || 'Already added'}
                  </span>
                )}
              </label>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
        >
          {dict?.common?.cancel || 'Cancel'}
        </button>
        {countryCode && suggestions.length > 0 && (
          <button
            type="button"
            onClick={handleImport}
            disabled={importing || selectedCount === 0}
            className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {importing
              ? dict?.holidays?.importing || 'Importing…'
              : (dict?.holidays?.importSelected || 'Import {count} selected').replace('{count}', String(selectedCount))}
          </button>
        )}
      </div>
    </>
  );
}
