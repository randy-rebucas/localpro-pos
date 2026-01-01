'use client';

import { useState, useEffect } from 'react';
import { ITenantSettings } from '@/models/Tenant';

interface BusinessHoursManagerProps {
  settings: ITenantSettings;
  tenant: string;
  onUpdate: (updates: Partial<ITenantSettings>) => void;
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function BusinessHoursManager({ settings, tenant, onUpdate }: BusinessHoursManagerProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [schedule, setSchedule] = useState<Record<string, any>>({});
  const [specialHours, setSpecialHours] = useState<Array<any>>([]);
  const [timezone, setTimezone] = useState('');

  useEffect(() => {
    fetchBusinessHours();
  }, []);

  const fetchBusinessHours = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/tenants/${tenant}/business-hours`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        const hours = data.data || {};
        setSchedule(hours.schedule || {});
        setSpecialHours(hours.specialHours || []);
        setTimezone(hours.timezone || settings.timezone || 'UTC');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to load business hours' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);
      const res = await fetch(`/api/tenants/${tenant}/business-hours`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ schedule, specialHours, timezone }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Business hours saved successfully' });
        onUpdate({ businessHours: data.data });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save business hours' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to save business hours' });
    } finally {
      setSaving(false);
    }
  };

  const updateDaySchedule = (day: string, updates: any) => {
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

  const updateSpecialHour = (index: number, updates: any) => {
    const updated = [...specialHours];
    updated[index] = { ...updated[index], ...updates };
    setSpecialHours(updated);
  };

  const removeSpecialHour = (index: number) => {
    setSpecialHours(specialHours.filter((_, i) => i !== index));
  };

  if (loading) {
    return <div className="text-center py-8">Loading business hours...</div>;
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`p-3 rounded ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Timezone</label>
        <input
          type="text"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="America/New_York"
        />
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Weekly Schedule</h3>
        <div className="space-y-3">
          {DAYS.map((day) => {
            const daySchedule = schedule[day] || { enabled: false, openTime: '09:00', closeTime: '17:00', breaks: [] };
            return (
              <div key={day} className="p-4 border-2 border-gray-300 rounded">
                <div className="flex items-center justify-between mb-3">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={daySchedule.enabled || false}
                      onChange={(e) => updateDaySchedule(day, { enabled: e.target.checked })}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700 capitalize">{day}</span>
                  </label>
                </div>
                {daySchedule.enabled && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Open Time</label>
                      <input
                        type="time"
                        value={daySchedule.openTime || '09:00'}
                        onChange={(e) => updateDaySchedule(day, { openTime: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Close Time</label>
                      <input
                        type="time"
                        value={daySchedule.closeTime || '17:00'}
                        onChange={(e) => updateDaySchedule(day, { closeTime: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Special Hours</h3>
          <button
            onClick={addSpecialHour}
            className="px-3 py-1 text-sm bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            Add Special Hours
          </button>
        </div>
        <div className="space-y-3">
          {specialHours.map((special, index) => (
            <div key={index} className="p-4 border-2 border-gray-300 rounded">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Date</label>
                  <input
                    type="date"
                    value={special.date || ''}
                    onChange={(e) => updateSpecialHour(index, { date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  />
                </div>
                <div className="flex items-center pt-6">
                  <input
                    type="checkbox"
                    checked={special.enabled !== false}
                    onChange={(e) => updateSpecialHour(index, { enabled: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label className="ml-2 text-xs text-gray-700">Open</label>
                </div>
                {special.enabled && (
                  <>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Open Time</label>
                      <input
                        type="time"
                        value={special.openTime || '09:00'}
                        onChange={(e) => updateSpecialHour(index, { openTime: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Close Time</label>
                      <input
                        type="time"
                        value={special.closeTime || '17:00'}
                        onChange={(e) => updateSpecialHour(index, { closeTime: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded"
                      />
                    </div>
                  </>
                )}
                <div className="md:col-span-4">
                  <label className="block text-xs text-gray-600 mb-1">Note (Optional)</label>
                  <input
                    type="text"
                    value={special.note || ''}
                    onChange={(e) => updateSpecialHour(index, { note: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    placeholder="e.g., Holiday hours"
                  />
                </div>
              </div>
              <button
                onClick={() => removeSpecialHour(index)}
                className="mt-2 px-3 py-1 text-xs text-red-600 hover:text-red-700 font-medium"
              >
                Remove
              </button>
            </div>
          ))}
          {specialHours.length === 0 && (
            <div className="text-center py-4 text-gray-500 text-sm">
              No special hours configured. Add special hours for holidays or special events.
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:bg-gray-400"
        >
          {saving ? 'Saving...' : 'Save Business Hours'}
        </button>
      </div>
    </div>
  );
}
