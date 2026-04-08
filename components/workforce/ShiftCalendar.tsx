'use client';

import { useState, useEffect } from 'react';

interface ShiftData {
  _id: string;
  staffId: { _id: string; name: string; role: string };
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  notes?: string;
}

interface ShiftCalendarProps {
  tenantId?: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  swap_requested: 'bg-yellow-100 text-yellow-800',
  absent: 'bg-red-100 text-red-800',
  completed: 'bg-gray-100 text-gray-600',
};

function getWeekStart(date: Date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default function ShiftCalendar({ tenantId }: ShiftCalendarProps) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ staffId: '', date: '', startTime: '08:00', endTime: '17:00', notes: '' });
  const [staff, setStaff] = useState<{ _id: string; name: string; role: string }[]>([]);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  useEffect(() => {
    loadShifts();
    loadStaff();
  }, [weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadShifts() {
    setLoading(true);
    try {
      const res = await fetch(`/api/shifts?weekStart=${weekStart.toISOString()}`);
      const data = await res.json();
      if (data.success) setShifts(data.data);
    } catch {
      setError('Failed to load shifts');
    } finally {
      setLoading(false);
    }
  }

  async function loadStaff() {
    try {
      const res = await fetch('/api/users?role=cashier,manager,admin&isActive=true&limit=100');
      const data = await res.json();
      if (data.success) setStaff(data.data);
    } catch {}
  }

  async function createShift(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        setForm({ staffId: '', date: '', startTime: '08:00', endTime: '17:00', notes: '' });
        loadShifts();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to create shift');
    }
  }

  function shiftsForDay(day: Date) {
    const dayStr = day.toISOString().slice(0, 10);
    return shifts.filter(s => s.date.slice(0, 10) === dayStr);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(d => addDays(d, -7))}
            className="p-1.5 border border-gray-200 rounded hover:bg-gray-50"
          >
            ‹
          </button>
          <span className="text-sm font-medium text-gray-700">
            Week of {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <button
            onClick={() => setWeekStart(d => addDays(d, 7))}
            className="p-1.5 border border-gray-200 rounded hover:bg-gray-50"
          >
            ›
          </button>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
        >
          + Add Shift
        </button>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>
      )}

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {DAYS.map((day, i) => (
          <div key={day} className="text-center">
            <div className="text-xs text-gray-500 font-medium mb-1">{day}</div>
            <div className="text-xs text-gray-400 mb-2">{weekDays[i]?.getDate()}</div>
            <div className="min-h-[80px] space-y-1">
              {loading ? (
                <div className="h-4 bg-gray-100 rounded animate-pulse" />
              ) : (
                shiftsForDay(weekDays[i]).map(s => (
                  <div
                    key={s._id}
                    className={`text-xs rounded px-1 py-0.5 ${STATUS_COLORS[s.status] || 'bg-gray-100'}`}
                    title={`${s.staffId?.name} · ${s.startTime}–${s.endTime}`}
                  >
                    <div className="font-medium truncate">{s.staffId?.name?.split(' ')[0]}</div>
                    <div className="text-gray-500">{s.startTime}–{s.endTime}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add shift modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Add Shift</h3>
            <form onSubmit={createShift} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Staff</label>
                <select
                  value={form.staffId}
                  onChange={e => setForm(f => ({ ...f, staffId: e.target.value }))}
                  required
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                >
                  <option value="">Select staff...</option>
                  {staff.map(s => (
                    <option key={s._id} value={s._id}>{s.name} ({s.role})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
                  <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} required className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
                  <input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} required className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700">Save Shift</button>
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
