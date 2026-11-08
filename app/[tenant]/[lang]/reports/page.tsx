'use client';

import '@/app/marketing.css';
import { marketingFontClasses } from '@/components/marketing/fonts';
import Navbar from '@/components/Navbar';
import ProtectedRoute from '@/components/ProtectedRoute';
import ReportsWorkspace from '@/components/reports/ReportsWorkspace';

export default function ReportsPage() {
  return (
    <ProtectedRoute>
      <div className={`${marketingFontClasses} mk-root pos-register flex min-h-dvh flex-col`}>
        <Navbar />
        <div className="flex-1 bg-brand-navy-deep text-paper">
          <ReportsWorkspace />
        </div>
      </div>
    </ProtectedRoute>
  );
}
