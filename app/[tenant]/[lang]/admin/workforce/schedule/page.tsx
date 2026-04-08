'use client';

import AdminNavBar from '@/components/AdminNavBar';
import ShiftCalendar from '@/components/workforce/ShiftCalendar';

export default function SchedulePage() {
  return (
    <div className="bg-gray-50">
      <AdminNavBar />
      <div className="px-6 py-5">
        <h1 className="text-xl font-bold text-gray-900 mb-5">Staff Schedule</h1>
        <div className="bg-white border border-gray-200 p-4">
          <ShiftCalendar />
        </div>
      </div>
    </div>
  );
}
