'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import AdminNavBar from '@/components/AdminNavBar';
import { Clock, DollarSign } from 'lucide-react';

export default function WorkforcePage() {
  const params = useParams();

  return (
    <div className="bg-gray-50">
      <AdminNavBar />
      <div className="px-6 py-5">
        <h1 className="text-xl font-bold text-gray-900 mb-5">Workforce Management</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Schedule Card */}
          <Link href={`/${params.tenant}/${params.lang}/admin/workforce/schedule`}>
            <div className="bg-white border border-gray-200 hover:border-gray-300 p-5 cursor-pointer h-full transition-colors">
              <div className="flex items-center gap-3 mb-2">
                <Clock className="w-5 h-5 text-blue-600" />
                <h2 className="text-sm font-semibold text-gray-900">Staff Schedule</h2>
              </div>
              <p className="text-gray-500 text-sm">Manage staff shifts and work schedules</p>
            </div>
          </Link>

          {/* Commissions Card */}
          <Link href={`/${params.tenant}/${params.lang}/admin/workforce/commissions`}>
            <div className="bg-white border border-gray-200 hover:border-gray-300 p-5 cursor-pointer h-full transition-colors">
              <div className="flex items-center gap-3 mb-2">
                <DollarSign className="w-5 h-5 text-green-600" />
                <h2 className="text-sm font-semibold text-gray-900">Commissions</h2>
              </div>
              <p className="text-gray-500 text-sm">Track and manage staff commissions and earnings</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
