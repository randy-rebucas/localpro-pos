'use client';

import { useState, useEffect } from 'react';

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
}

export default function HolidaysManager({ tenant, dict }: HolidaysManagerProps) {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchHolidays();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchHolidays = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/tenants/${tenant}/holidays`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setHolidays(data.data || []);
      } else {
        setMessage({ type: 'error', text: data.error || dict?.holidays?.failedToLoad || 'Failed to load holidays' });
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setMessage({ type: 'error', text: error.message || dict?.holidays?.failedToLoad || 'Failed to load holidays' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (holiday: Partial<Holiday>) => {
    try {
      setMessage(null);
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
        setMessage({ type: 'success', text: editing ? (dict?.holidays?.holidayUpdated || 'Holiday updated successfully') : (dict?.holidays?.holidayCreated || 'Holiday created successfully') });
        setShowForm(false);
        setEditing(null);
        fetchHolidays();
      } else {
        setMessage({ type: 'error', text: data.error || dict?.holidays?.failedToSave || 'Failed to save holiday' });
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error('Error saving holiday:', error);
      setMessage({ type: 'error', text: error.message || dict?.holidays?.failedToSave || 'Failed to save holiday' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(dict?.holidays?.deleteConfirm || 'Are you sure you want to delete this holiday?')) return;

    try {
      const res = await fetch(`/api/tenants/${tenant}/holidays?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: dict?.holidays?.holidayDeleted || 'Holiday deleted successfully' });
        fetchHolidays();
      } else {
        setMessage({ type: 'error', text: data.error || dict?.holidays?.failedToDelete || 'Failed to delete holiday' });
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setMessage({ type: 'error', text: error.message || dict?.holidays?.failedToDelete || 'Failed to delete holiday' });
    }
  };

  if (loading) {
    return <div className="text-center py-8">{dict?.holidays?.loading || 'Loading holidays...'}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{dict?.holidays?.holidayCalendar || 'Holiday Calendar'}</h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowSuggestions(true)}
            className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 border border-gray-300"
          >
            {dict?.holidays?.suggestHolidays || 'Suggest Holidays'}
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="px-4 py-2 bg-brand text-white text-sm font-medium hover:bg-brand-hover"
          >
            {dict?.holidays?.addHoliday || 'Add Holiday'}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-3 border ${
            message.type === 'success' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {showSuggestions && (
        <SuggestedHolidays
          tenant={tenant}
          dict={dict}
          onClose={() => setShowSuggestions(false)}
          onImported={(count) => {
            setShowSuggestions(false);
            setMessage({
              type: 'success',
              text: (dict?.holidays?.holidaysImported || '{count} holiday(s) imported').replace('{count}', String(count)),
            });
            fetchHolidays();
          }}
        />
      )}

      {showForm && (
        <HolidayForm
          holiday={editing}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
          dict={dict}
        />
      )}

      <div className="space-y-3">
        {holidays.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {dict?.holidays?.noHolidays || 'No holidays configured. Add holidays to mark days when your business is closed.'}
          </div>
        ) : (
          holidays.map((holiday) => (
            <div
              key={holiday.id}
              className="p-4 border-2 border-gray-300 hover:bg-gray-50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">{holiday.name}</h4>
                  <div className="text-sm text-gray-600 mt-1">
                    {holiday.type === 'single' ? (
                      <span>{dict?.holidays?.date || 'Date'}: {holiday.date}</span>
                    ) : (
                      <span>
                        {dict?.holidays?.recurring || 'Recurring'}: {holiday.recurring?.pattern}
                        {holiday.recurring?.month && ` ${(dict?.holidays?.monthTemplate || '(Month {month})').replace('{month}', String(holiday.recurring.month))}`}
                        {holiday.recurring?.dayOfMonth && ` ${(dict?.holidays?.dayTemplate || '(Day {day})').replace('{day}', String(holiday.recurring.dayOfMonth))}`}
                      </span>
                    )}
                    {holiday.isBusinessClosed && (
                      <span className="ml-2 text-red-600 font-medium">• {dict?.holidays?.businessClosed || 'Business Closed'}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setEditing(holiday);
                      setShowForm(true);
                    }}
                    className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800 font-medium"
                  >
                    {dict?.common?.edit || 'Edit'}
                  </button>
                  <button
                    onClick={() => handleDelete(holiday.id)}
                    className="px-3 py-1 text-xs text-red-600 hover:text-red-700 font-medium"
                  >
                    {dict?.common?.delete || 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function HolidayForm({
  holiday,
  onSave,
  onCancel,
  dict,
}: {
  holiday: Holiday | null;
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

  return (
    <div className="border-2 border-gray-300 p-6 bg-white">
      <h4 className="text-lg font-semibold mb-4">{holiday ? (dict?.holidays?.editHoliday || 'Edit Holiday') : (dict?.holidays?.addHoliday || 'Add Holiday')}</h4>

      <div className="space-y-4">
        <div>
          <label htmlFor="holidayName" className="block text-sm font-medium text-gray-700 mb-2">{dict?.holidays?.holidayName || 'Holiday Name'} *</label>
          <input
            id="holidayName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand"
            placeholder={dict?.holidays?.holidayNamePlaceholder || "e.g., New Year's Day"}
            required
          />
        </div>

        <div>
          <label htmlFor="holidayType" className="block text-sm font-medium text-gray-700 mb-2">{dict?.holidays?.type || 'Type'} *</label>
          <select
            id="holidayType"
            value={type}
            onChange={(e) => setType(e.target.value as 'single' | 'recurring')}
            className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand"
          >
            <option value="single">{dict?.holidays?.singleDate || 'Single Date'}</option>
            <option value="recurring">{dict?.holidays?.recurring || 'Recurring'}</option>
          </select>
        </div>

        {type === 'single' ? (
          <div>
            <label htmlFor="holidayDate" className="block text-sm font-medium text-gray-700 mb-2">{dict?.holidays?.date || 'Date'} *</label>
            <input
              id="holidayDate"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand"
              required
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label htmlFor="recurringPattern" className="block text-sm font-medium text-gray-700 mb-2">{dict?.holidays?.recurringPattern || 'Recurring Pattern'} *</label>
              <select
                id="recurringPattern"
                value={recurringPattern}
                onChange={(e) => setRecurringPattern(e.target.value as any)} // eslint-disable-line @typescript-eslint/no-explicit-any
                className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand"
              >
                <option value="yearly">{dict?.holidays?.yearly || 'Yearly'}</option>
                <option value="monthly">{dict?.holidays?.monthly || 'Monthly'}</option>
                <option value="weekly">{dict?.holidays?.weekly || 'Weekly'}</option>
              </select>
            </div>
            {recurringPattern === 'yearly' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="recurringMonth" className="block text-sm font-medium text-gray-700 mb-2">{dict?.holidays?.monthRange || 'Month (1-12)'}</label>
                  <input
                    id="recurringMonth"
                    type="number"
                    min="1"
                    max="12"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
                <div>
                  <label htmlFor="recurringDayOfMonth" className="block text-sm font-medium text-gray-700 mb-2">{dict?.holidays?.dayOfMonth || 'Day of Month (1-31)'}</label>
                  <input
                    id="recurringDayOfMonth"
                    type="number"
                    min="1"
                    max="31"
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(e.target.value)}
                    className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
              </div>
            )}
            {recurringPattern === 'weekly' && (
              <div>
                <label htmlFor="recurringDayOfWeek" className="block text-sm font-medium text-gray-700 mb-2">{dict?.holidays?.dayOfWeek || 'Day of Week'}</label>
                <select
                  id="recurringDayOfWeek"
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(e.target.value)}
                  className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand"
                >
                  <option value="0">{dict?.businessHours?.sunday || 'Sunday'}</option>
                  <option value="1">{dict?.businessHours?.monday || 'Monday'}</option>
                  <option value="2">{dict?.businessHours?.tuesday || 'Tuesday'}</option>
                  <option value="3">{dict?.businessHours?.wednesday || 'Wednesday'}</option>
                  <option value="4">{dict?.businessHours?.thursday || 'Thursday'}</option>
                  <option value="5">{dict?.businessHours?.friday || 'Friday'}</option>
                  <option value="6">{dict?.businessHours?.saturday || 'Saturday'}</option>
                </select>
              </div>
            )}
            {recurringPattern === 'monthly' && (
              <div>
                <label htmlFor="recurringDayOfMonth" className="block text-sm font-medium text-gray-700 mb-2">{dict?.holidays?.dayOfMonth || 'Day of Month (1-31)'}</label>
                <input
                  id="recurringDayOfMonth"
                  type="number"
                  min="1"
                  max="31"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                  className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand"
                />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="isBusinessClosed"
            checked={isBusinessClosed}
            onChange={(e) => setIsBusinessClosed(e.target.checked)}
            className="checkbox-win8"
          />
          <label htmlFor="isBusinessClosed" className="text-sm text-gray-700">
            {dict?.holidays?.businessClosedLabel || 'Business is closed on this holiday'}
          </label>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() =>
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
              })
            }
            className="px-4 py-2 bg-brand text-white font-medium hover:bg-brand-hover"
          >
            {dict?.holidays?.saveHoliday || 'Save Holiday'}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 text-gray-700 font-medium hover:bg-gray-300"
          >
            {dict?.common?.cancel || 'Cancel'}
          </button>
        </div>
      </div>
    </div>
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
    <div className="border-2 border-gray-300 p-6 bg-white">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-semibold">{dict?.holidays?.suggestHolidays || 'Suggest Holidays'}</h4>
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
          {dict?.common?.cancel || 'Cancel'}
        </button>
      </div>

      <div className="mb-4">
        <label htmlFor="suggestionsCountry" className="block text-sm font-medium text-gray-700 mb-2">
          {dict?.holidays?.country || 'Country'}
        </label>
        <select
          id="suggestionsCountry"
          value={countryCode || ''}
          onChange={(e) => fetchSuggestions(e.target.value)}
          className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand"
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
          <p className="text-xs text-gray-500 mt-1">
            {dict?.holidays?.countryNotDetected ||
              "We couldn't match your tenant's configured country automatically — pick one above."}
          </p>
        )}
      </div>

      {error && (
        <div className="p-3 mb-4 bg-red-50 text-red-800 border border-red-300">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-6 text-gray-500">{dict?.holidays?.loading || 'Loading holidays...'}</div>
      ) : countryCode && suggestions.length === 0 ? (
        <div className="text-center py-6 text-gray-500">
          {dict?.holidays?.noSuggestions || 'No public holidays found for this country/year.'}
        </div>
      ) : countryCode ? (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {suggestions.map((h) => (
            <div
              key={h.date}
              className={`flex items-center p-3 border ${h.alreadyAdded ? 'border-gray-200 bg-gray-50' : 'border-gray-300 hover:bg-gray-50'}`}
            >
              <input
                type="checkbox"
                id={`suggestion-${h.date}`}
                checked={!!selected[h.date]}
                disabled={h.alreadyAdded}
                onChange={(e) => setSelected((prev) => ({ ...prev, [h.date]: e.target.checked }))}
                className="checkbox-win8 h-5 w-5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <label htmlFor={`suggestion-${h.date}`} className="ml-3 flex-1">
                <div className="text-sm font-medium text-gray-900">{h.name}</div>
                <div className="text-xs text-gray-500">
                  {h.date}
                  {h.alreadyAdded && (
                    <span className="ml-2 text-brand">{dict?.holidays?.alreadyAdded || 'Already added'}</span>
                  )}
                </div>
              </label>
            </div>
          ))}
        </div>
      ) : null}

      {countryCode && suggestions.length > 0 && (
        <div className="flex items-center space-x-3 pt-4 mt-4 border-t border-gray-200">
          <button
            onClick={handleImport}
            disabled={importing || selectedCount === 0}
            className="px-4 py-2 bg-brand text-white font-medium hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing
              ? dict?.holidays?.importing || 'Importing...'
              : (dict?.holidays?.importSelected || 'Import {count} selected').replace('{count}', String(selectedCount))}
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 font-medium hover:bg-gray-300">
            {dict?.common?.cancel || 'Cancel'}
          </button>
        </div>
      )}
    </div>
  );
}
