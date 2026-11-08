'use client';

import '@/app/marketing.css';
import { marketingFontClasses } from '@/components/marketing/fonts';
import Navbar from '@/components/Navbar';
import PageTitle from '@/components/PageTitle';
import InventoryWorkspace from '@/components/inventory/InventoryWorkspace';

export default function InventoryPage() {
  return (
    <div className={`${marketingFontClasses} mk-root pos-register flex min-h-dvh flex-col`}>
      <PageTitle />
      <Navbar />
      <div className="flex-1 bg-brand-navy-deep text-paper">
        <InventoryWorkspace productsPath="products" />
      </div>
    </div>
  );
}
