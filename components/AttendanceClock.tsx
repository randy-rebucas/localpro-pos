'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

interface AttendanceSession {
  _id: string;
  clockIn: string;
  clockOut?: string;
  currentHours?: number;
  notes?: string;
}

export default function AttendanceClock() {
  const params = useParams();
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const [dict, setDict] = useState<any>(null);
  const { user, isAuthenticated } = useAuth();
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [currentHours, setCurrentHours] = useState(0);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // Fetch current session
  const fetchCurrentSession = async () => {
    if (!isAuthenticated) return;

    try {
      const res = await fetch('/api/attendance/current', {
        credentials: 'include',
      });
      const data = await res.json();
      
      if (data.success) {
        setSession(data.data);
        if (data.data) {
          setCurrentHours(data.data.currentHours || 0);
        }
      }
    } catch (err) {
      console.error('Error fetching attendance:', err);
    }
  };

  // Update current hours every minute
  useEffect(() => {
    if (!session || session.clockOut) return;

    const interval = setInterval(() => {
      if (session.clockIn) {
        const now = new Date();
        const clockIn = new Date(session.clockIn);
        const hours = (now.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
        setCurrentHours(Math.round(hours * 100) / 100);
      }
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [session]);

  useEffect(() => {
    fetchCurrentSession();
  }, [isAuthenticated]);

  const handleClockIn = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'clock-in',
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      
      if (data.success) {
        setSession(data.data);
        setNotes('');
        await fetchCurrentSession();
      } else {
        setError(data.error || dict?.common?.failedToClockIn || 'Failed to clock in');
      }
    } catch (err: any) {
      setError(err.message || dict?.common?.failedToClockIn || 'Failed to clock in');
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'clock-out',
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      
      if (data.success) {
        setSession(data.data);
        setNotes('');
        await fetchCurrentSession();
      } else {
        setError(data.error || dict?.common?.failedToClockOut || 'Failed to clock out');
      }
    } catch (err: any) {
      setError(err.message || dict?.common?.failedToClockOut || 'Failed to clock out');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  const isClockedIn = session && !session.clockOut;
  const clockInTime = session?.clockIn ? new Date(session.clockIn) : null;

  return (
    <div className="bg-white border-2 border-gray-300 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">{dict?.components?.attendance?.title || 'Attendance'}</h2>
        {isClockedIn && (
          <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-semibold border border-green-300">
            {dict?.components?.attendance?.clockedIn || 'Clocked In'}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border-2 border-red-300 text-red-700 text-sm">
          {error}
        </div>
      )}

      {isClockedIn && clockInTime && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-300">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">{dict?.components?.attendance?.clockedInAt || 'Clocked in at:'}</span>
            <span className="text-sm font-semibold text-gray-900">
              {clockInTime.toLocaleTimeString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">{dict?.components?.attendance?.hoursWorked || 'Hours worked:'}</span>
            <span className="text-lg font-bold text-blue-600">
              {currentHours.toFixed(2)} hrs
            </span>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
            {dict?.components?.attendance?.notesOptional || 'Notes (optional)'}
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={dict?.common?.addShiftNotes || 'Add any notes about your shift...'}
            className="w-full px-3 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none bg-white"
            rows={2}
            disabled={loading}
          />
        </div>

        {!isClockedIn ? (
          <button
            onClick={handleClockIn}
            disabled={loading}
            className="w-full bg-green-600 text-white py-3 font-semibold hover:bg-green-700 active:bg-green-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 border border-green-700"
          >
            {loading ? (
              <>
                <div className="animate-spin h-5 w-5 border-b-2 border-white"></div>
                <span>{dict?.components?.attendance?.clockingIn || 'Clocking in...'}</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>{dict?.components?.attendance?.clockIn || 'Clock In'}</span>
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleClockOut}
            disabled={loading}
            className="w-full bg-red-600 text-white py-3 font-semibold hover:bg-red-700 active:bg-red-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 border border-red-700"
          >
            {loading ? (
              <>
                <div className="animate-spin h-5 w-5 border-b-2 border-white"></div>
                <span>{dict?.components?.attendance?.clockingOut || 'Clocking out...'}</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
                <span>{dict?.components?.attendance?.clockOut || 'Clock Out'}</span>
              </>
            )}
          </button>
        )}
      </div>

      {user && (
        <p className="mt-4 text-xs text-gray-500 text-center">
          {(dict?.components?.attendance?.loggedInAs || 'Logged in as: {name} ({role})').replace('{name}', user.name).replace('{role}', user.role)}
        </p>
      )}
    </div>
  );
}

