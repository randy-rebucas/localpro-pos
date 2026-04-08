'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import AdminNavBar from '@/components/AdminNavBar';
import { Users, BarChart3 } from 'lucide-react';

export default function ReportsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const base = `/${tenant}/${lang}/admin/reports`;

  const reports = [
    {
      href: `${base}/staff`,
      icon: Users,
      label: 'Staff Performance',
      description: 'View sales, transactions, and performance metrics per staff member',
    },
  ];

  return (
    <div className="bg-gray-50">
      <AdminNavBar />
      <div className="px-6 py-5">
        <h1 className="text-xl font-bold text-gray-900 mb-5">Reports</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map(({ href, icon: Icon, label, description }) => (
            <Link key={href} href={href}>
              <div className="bg-white border border-gray-200 hover:border-gray-300 p-5 cursor-pointer h-full transition-colors">
                <div className="flex items-center gap-3 mb-2">
                  <Icon className="w-5 h-5 text-blue-600" />
                  <h2 className="text-sm font-semibold text-gray-900">{label}</h2>
                </div>
                <p className="text-gray-500 text-sm">{description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
