'use client';

import ReportsWorkspace from '@/components/reports/ReportsWorkspace';

/** The admin console supplies the fonts and sidebar; this page brings the dark till surface. */
export default function AdminReportsPage() {
  return (
    <div className="mk-root pos-register">
      <div className="min-h-[calc(100dvh-3.5rem)] bg-brand-navy-deep text-paper lg:min-h-dvh">
        <ReportsWorkspace />
      </div>
    </div>
  );
}
