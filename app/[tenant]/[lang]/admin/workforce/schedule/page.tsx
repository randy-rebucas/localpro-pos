'use client';

import Navbar from '@/components/Navbar';
import ShiftCalendar from '@/components/workforce/ShiftCalendar';

export default function SchedulePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Staff Schedule</h1>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <ShiftCalendar />
        </div>
      </main>
    </div>
  );
}
