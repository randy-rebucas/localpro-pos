'use client';

import '@/app/marketing.css';
import { marketingFontClasses } from '@/components/marketing/fonts';
import Navbar from '@/components/Navbar';
import PageTitle from '@/components/PageTitle';
import TransactionsWorkspace from '@/components/transactions/TransactionsWorkspace';

export default function TransactionsPage() {
  return (
    <div className={`${marketingFontClasses} mk-root pos-register flex min-h-dvh flex-col`}>
      <PageTitle />
      <Navbar />
      <div className="flex-1 bg-brand-navy-deep text-paper">
        <TransactionsWorkspace />
      </div>
    </div>
  );
}
