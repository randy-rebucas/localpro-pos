'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface AttendanceSession {
  _id: string;
  clockIn: string;
  clockOut?: string;
  currentHours?: number;
  notes?: string;
}

export default function AttendanceClock() {
  const { user, isAuthenticated } = useAuth();
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [currentHours, setCurrentHours] = useState(0);

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
        setError(data.error || 'Failed to clock in');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to clock in');
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
        setError(data.error || 'Failed to clock out');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to clock out');
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
    <div className="bg-white rounded-lg shadow-md p-6 border-2 border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Attendance</h2>
        {isClockedIn && (
          <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-semibold rounded-full">
            Clocked In
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border-2 border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {isClockedIn && clockInTime && (
        <div className="mb-4 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Clocked in at:</span>
            <span className="text-sm font-semibold text-gray-900">
              {clockInTime.toLocaleTimeString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Hours worked:</span>
            <span className="text-lg font-bold text-blue-600">
              {currentHours.toFixed(2)} hrs
            </span>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
            Notes (optional)
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any notes about your shift..."
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            rows={2}
            disabled={loading}
          />
        </div>

        {!isClockedIn ? (
          <button
            onClick={handleClockIn}
            disabled={loading}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 active:bg-green-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Clocking in...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Clock In</span>
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleClockOut}
            disabled={loading}
            className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 active:bg-red-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Clocking out...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
                <span>Clock Out</span>
              </>
            )}
          </button>
        )}
      </div>

      {user && (
        <p className="mt-4 text-xs text-gray-500 text-center">
          Logged in as: {user.name} ({user.role})
        </p>
      )}
    </div>
  );
}

