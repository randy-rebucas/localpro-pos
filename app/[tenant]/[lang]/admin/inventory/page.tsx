'use client';

import InventoryWorkspace from '@/components/inventory/InventoryWorkspace';

/** The admin console supplies the fonts and sidebar; this page brings the dark till surface. */
export default function AdminInventoryPage() {
  return (
    <div className="mk-root pos-register">
      <div className="min-h-[calc(100dvh-3.5rem)] bg-brand-navy-deep text-paper lg:min-h-dvh">
        <InventoryWorkspace productsPath="admin/products" requireManage />
      </div>
    </div>
  );
}
