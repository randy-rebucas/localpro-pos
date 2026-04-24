'use client';

import { useState, useEffect } from 'react';
import { ITenantSettings } from '@/types/tenant';

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
  settings: ITenantSettings;
  tenant: string;
  onUpdate: (updates: Partial<ITenantSettings>) => void;
  dict?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export default function HolidaysManager({ settings, tenant, onUpdate, dict }: HolidaysManagerProps) { // eslint-disable-line @typescript-eslint/no-unused-vars
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [showForm, setShowForm] = useState(false);
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

      console.log('Saving holiday:', body); // Debug log

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();
      console.log('Holiday save response:', data); // Debug log

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

      {message && (
        <div
          className={`p-3 rounded ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
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
              className="p-4 border-2 border-gray-300 rounded hover:bg-gray-50"
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
    <div className="border-2 border-gray-300 rounded p-6 bg-white">
      <h4 className="text-lg font-semibold mb-4">{holiday ? (dict?.holidays?.editHoliday || 'Edit Holiday') : (dict?.holidays?.addHoliday || 'Add Holiday')}</h4>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{dict?.holidays?.holidayName || 'Holiday Name'} *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand"
            placeholder={dict?.holidays?.holidayNamePlaceholder || "e.g., New Year's Day"}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{dict?.holidays?.type || 'Type'} *</label>
          <select
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
            <label className="block text-sm font-medium text-gray-700 mb-2">{dict?.holidays?.date || 'Date'} *</label>
            <input
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
              <label className="block text-sm font-medium text-gray-700 mb-2">{dict?.holidays?.recurringPattern || 'Recurring Pattern'} *</label>
              <select
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">{dict?.holidays?.monthRange || 'Month (1-12)'}</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{dict?.holidays?.dayOfMonth || 'Day of Month (1-31)'}</label>
                  <input
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
                <label className="block text-sm font-medium text-gray-700 mb-2">{dict?.holidays?.dayOfWeek || 'Day of Week'}</label>
                <select
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
                <label className="block text-sm font-medium text-gray-700 mb-2">{dict?.holidays?.dayOfMonth || 'Day of Month (1-31)'}</label>
                <input
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
            className="w-4 h-4 text-brand border-gray-300 rounded focus:ring-brand"
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
