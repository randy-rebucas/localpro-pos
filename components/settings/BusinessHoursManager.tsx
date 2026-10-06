'use client';

import { useState, useEffect } from 'react';
import { ITenantSettings } from '@/types/tenant';

interface BusinessHoursManagerProps {
  settings: ITenantSettings;
  tenant: string;
  onUpdate: (updates: Partial<ITenantSettings>) => void;
  dict?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const INPUT = 'border border-gray-300 px-3 py-2 text-sm bg-white disabled:bg-gray-100';

export default function BusinessHoursManager({ settings, tenant, onUpdate, dict }: BusinessHoursManagerProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<Record<string, any>>({}); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [specialHours, setSpecialHours] = useState<Array<any>>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [timezone, setTimezone] = useState('');

  useEffect(() => {
    fetchBusinessHours();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchBusinessHours = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch(`/api/tenants/${tenant}/business-hours`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        const hours = data.data || {};
        setSchedule(hours.schedule || {});
        setSpecialHours(hours.specialHours || []);
        setTimezone(hours.timezone || settings.timezone || 'Asia/Manila');
      } else {
        setLoadError(data.error || dict?.businessHours?.failedToLoad || 'Failed to load business hours');
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setLoadError(error.message || dict?.businessHours?.failedToLoad || 'Failed to load business hours');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveError(null);
      const res = await fetch(`/api/tenants/${tenant}/business-hours`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ schedule, specialHours, timezone }),
      });

      const data = await res.json();
      if (data.success) {
        // Success feedback is a toast raised by the parent's onUpdate handler.
        setSchedule(data.data?.schedule || {});
        onUpdate({ businessHours: data.data });
      } else {
        setSaveError(data.error || dict?.businessHours?.failedToSave || 'Failed to save business hours');
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setSaveError(error.message || dict?.businessHours?.failedToSave || 'Failed to save business hours');
    } finally {
      setSaving(false);
    }
  };

  const updateDaySchedule = (day: string, updates: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    setSchedule({
      ...schedule,
      [day]: {
        ...schedule[day],
        ...updates,
      },
    });
  };

  const addSpecialHour = () => {
    setSpecialHours([
      ...specialHours,
      {
        date: '',
        enabled: true,
        openTime: '09:00',
        closeTime: '17:00',
        note: '',
      },
    ]);
  };

  const updateSpecialHour = (index: number, updates: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const updated = [...specialHours];
    updated[index] = { ...updated[index], ...updates };
    setSpecialHours(updated);
  };

  const removeSpecialHour = (index: number) => {
    setSpecialHours(specialHours.filter((_, i) => i !== index));
  };

  const dayLabel = (day: string) => dict?.businessHours?.[day] || day.charAt(0).toUpperCase() + day.slice(1);
  const openTimeLabel = dict?.businessHours?.openTime || 'Open Time';
  const closeTimeLabel = dict?.businessHours?.closeTime || 'Close Time';

  if (loading) {
    return (
      <div className="text-center py-12 bg-white border border-gray-300">
        <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
        <p className="mt-3 text-gray-400 text-sm">{dict?.businessHours?.loadingBusinessHours || 'Loading business hours…'}</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="text-center py-12 bg-white border border-gray-300">
        <p className="text-win8-danger text-sm font-medium">{loadError}</p>
        <button
          type="button"
          onClick={fetchBusinessHours}
          className="mt-4 inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
        >
          {dict?.common?.retry || 'Retry'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Timezone */}
      <section className="bg-white border border-gray-300">
        <div className="px-6 py-4 border-b border-gray-300">
          <h2 className="text-base font-bold text-gray-900">{dict?.businessHours?.timezone || 'Timezone'}</h2>
          <p className="text-sm text-gray-500">
            {dict?.businessHours?.timezoneDesc || 'IANA timezone used for all opening times, e.g. Asia/Manila'}
          </p>
        </div>
        <div className="p-6">
          <input
            type="text"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            aria-label={dict?.businessHours?.timezone || 'Timezone'}
            className={`${INPUT} w-full sm:w-80 font-mono`}
            placeholder="America/New_York"
          />
        </div>
      </section>

      {/* Weekly schedule */}
      <section className="bg-white border border-gray-300">
        <div className="px-6 py-4 border-b border-gray-300">
          <h2 className="text-base font-bold text-gray-900">{dict?.businessHours?.weeklySchedule || 'Weekly Schedule'}</h2>
          <p className="text-sm text-gray-500">
            {dict?.businessHours?.weeklyScheduleDesc || 'Tick the days you are open and set opening and closing times'}
          </p>
        </div>
        <div className="divide-y divide-gray-200">
          {DAYS.map((day) => {
            const daySchedule = schedule[day] || { enabled: false, openTime: '09:00', closeTime: '17:00', breaks: [] };
            const label = dayLabel(day);
            return (
              <div key={day} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3 hover:bg-gray-100 transition-colors">
                <label className="flex items-center gap-2 w-40 text-sm font-medium text-gray-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={daySchedule.enabled || false}
                    onChange={(e) => updateDaySchedule(day, { enabled: e.target.checked })}
                    className="checkbox-win8"
                  />
                  {label}
                </label>
                {daySchedule.enabled ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={daySchedule.openTime || '09:00'}
                      onChange={(e) => updateDaySchedule(day, { openTime: e.target.value })}
                      aria-label={`${label} – ${openTimeLabel}`}
                      title={openTimeLabel}
                      className={`${INPUT} tabular-nums`}
                    />
                    <span className="text-gray-400" aria-hidden="true">–</span>
                    <input
                      type="time"
                      value={daySchedule.closeTime || '17:00'}
                      onChange={(e) => updateDaySchedule(day, { closeTime: e.target.value })}
                      aria-label={`${label} – ${closeTimeLabel}`}
                      title={closeTimeLabel}
                      className={`${INPUT} tabular-nums`}
                    />
                  </div>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-semibold bg-gray-500 text-white">
                    {dict?.businessHours?.closed || 'Closed'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Special hours */}
      <section className="bg-white border border-gray-300">
        <div className="px-6 py-4 border-b border-gray-300 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-gray-900">{dict?.businessHours?.specialHours || 'Special Hours'}</h2>
            <p className="text-sm text-gray-500">
              {dict?.businessHours?.specialHoursDesc || 'Override the weekly schedule for holidays or special events'}
            </p>
          </div>
          <button
            type="button"
            onClick={addSpecialHour}
            className="inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            + {dict?.businessHours?.addSpecialHours || 'Add Special Hours'}
          </button>
        </div>
        <div className="p-6 space-y-3">
          {specialHours.map((special, index) => {
            const isOpen = special.enabled !== false;
            return (
              <div key={index} className="border border-gray-300 p-4 flex gap-3">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <div>
                    <label htmlFor={`special-date-${index}`} className="block text-xs font-medium text-gray-600 mb-1">
                      {dict?.businessHours?.date || 'Date'}
                    </label>
                    <input
                      id={`special-date-${index}`}
                      type="date"
                      value={special.date || ''}
                      onChange={(e) => updateSpecialHour(index, { date: e.target.value })}
                      className={`${INPUT} w-full`}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer py-2">
                    <input
                      type="checkbox"
                      checked={isOpen}
                      onChange={(e) => updateSpecialHour(index, { enabled: e.target.checked })}
                      className="checkbox-win8"
                    />
                    {dict?.businessHours?.open || 'Open'}
                  </label>
                  {isOpen ? (
                    <>
                      <div>
                        <label htmlFor={`special-open-${index}`} className="block text-xs font-medium text-gray-600 mb-1">
                          {openTimeLabel}
                        </label>
                        <input
                          id={`special-open-${index}`}
                          type="time"
                          value={special.openTime || '09:00'}
                          onChange={(e) => updateSpecialHour(index, { openTime: e.target.value })}
                          className={`${INPUT} w-full tabular-nums`}
                        />
                      </div>
                      <div>
                        <label htmlFor={`special-close-${index}`} className="block text-xs font-medium text-gray-600 mb-1">
                          {closeTimeLabel}
                        </label>
                        <input
                          id={`special-close-${index}`}
                          type="time"
                          value={special.closeTime || '17:00'}
                          onChange={(e) => updateSpecialHour(index, { closeTime: e.target.value })}
                          className={`${INPUT} w-full tabular-nums`}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="md:col-span-2 py-2">
                      <span className="px-2 py-0.5 text-xs font-semibold bg-gray-500 text-white">
                        {dict?.businessHours?.closed || 'Closed'}
                      </span>
                    </div>
                  )}
                  <div className="md:col-span-4">
                    <label htmlFor={`special-note-${index}`} className="block text-xs font-medium text-gray-600 mb-1">
                      {dict?.businessHours?.noteOptional || 'Note (Optional)'}
                    </label>
                    <input
                      id={`special-note-${index}`}
                      type="text"
                      value={special.note || ''}
                      onChange={(e) => updateSpecialHour(index, { note: e.target.value })}
                      className={`${INPUT} w-full`}
                      placeholder={dict?.businessHours?.holidayHoursPlaceholder || 'e.g., Holiday hours'}
                    />
                  </div>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => removeSpecialHour(index)}
                    title={dict?.businessHours?.removeSpecialHours || 'Remove special hours'}
                    aria-label={dict?.businessHours?.removeSpecialHours || 'Remove special hours'}
                    className="inline-flex items-center justify-center p-2.5 text-white bg-win8-danger hover:brightness-110 disabled:opacity-50 transition-[filter]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12.1a2 2 0 0 1-2 1.9H9.7a2 2 0 0 1-2-1.9L7 7h10Z" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
          {specialHours.length === 0 && (
            <p className="text-sm text-gray-400 italic">
              {dict?.businessHours?.noSpecialHours || 'No special hours configured. Add special hours for holidays or special events.'}
            </p>
          )}
        </div>
      </section>

      {/* Save bar */}
      <div className="bg-white border border-gray-300 p-4 flex items-center justify-end gap-3 flex-wrap">
        {saveError && <p className="mr-auto text-sm font-medium text-win8-danger">{saveError}</p>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
        >
          {saving ? (dict?.businessHours?.saving || 'Saving…') : (dict?.businessHours?.saveBusinessHours || 'Save Business Hours')}
        </button>
      </div>
    </div>
  );
}
