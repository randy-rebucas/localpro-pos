'use client';

import TransactionsWorkspace from '@/components/transactions/TransactionsWorkspace';

/** The admin console supplies the fonts and sidebar; this page brings the dark till surface. */
export default function AdminTransactionsPage() {
  return (
    <div className="mk-root pos-register">
      <div className="min-h-[calc(100dvh-3.5rem)] bg-brand-navy-deep text-paper lg:min-h-dvh">
        <TransactionsWorkspace requireView />
      </div>
    </div>
  );
}
