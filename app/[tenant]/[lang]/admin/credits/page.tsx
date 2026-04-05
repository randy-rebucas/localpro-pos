'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { showToast } from '@/lib/toast';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { GridPageTemplate } from '@/components/admin/GridPageTemplate';
import { CreditModal } from '@/components/admin/Credits/CreditModal';
import { CreditDetails } from '@/components/admin/Credits/CreditDetails';
import { useCreditsManager } from '@/hooks/useCreditsManager';
import { formatCustomerName, getCustomerContact } from '@/lib/credits-helpers';

export default function CreditsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { settings } = useTenantSettings();
  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#3b82f6';

  const [dict, setDict] = useState<Record<string, any>>(null!); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'adjust' | 'refund'>('add');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const manager = useCreditsManager(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    if (dict) manager.fetchCustomers('');
  }, [dict, manager]);

  useEffect(() => {
    return () => manager.cleanup();
  }, [manager]);

  const handleAddCredit = async () => {
    if (!manager.selectedCustomer || !amount) {
      showToast.error(dict?.common?.required || 'Please fill all required fields');
      return;
    }

    const creditAmount = parseFloat(amount);
    if (isNaN(creditAmount) || creditAmount <= 0) {
      showToast.error('Please enter a valid amount');
      return;
    }

    const success = await manager.addCredit(
      manager.selectedCustomer._id,
      modalMode === 'refund' ? 'refund' : modalMode === 'adjust' ? 'adjustment' : 'top_up',
      creditAmount,
      reason || `${modalMode} via admin portal`
    );

    if (success) {
      setShowModal(false);
      setAmount('');
      setReason('');
    }
  };

  const openModal = (mode: 'add' | 'adjust' | 'refund') => {
    if (!manager.selectedCustomer) {
      showToast.error('Please select a customer first');
      return;
    }
    setModalMode(mode);
    setAmount('');
    setReason('');
    setShowModal(true);
  };

  if (!dict) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Sidebar: Customer list
  const sidebarContent = (
    <div className="bg-white border border-gray-300 p-4 flex flex-col max-h-96">
      <input
        type="text"
        placeholder="Search customers..."
        value={manager.search}
        onChange={(e) => manager.handleSearchChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
        aria-label="Search customers by name or email"
      />
      <div className="overflow-y-auto flex-1">
        {manager.loading ? (
          <div className="divide-y">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-4 space-y-2">
                <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2"></div>
                <div className="h-3 bg-gray-200 rounded animate-pulse w-2/3"></div>
              </div>
            ))}
          </div>
        ) : manager.customers.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <svg
              className="w-12 h-12 mx-auto text-gray-300 mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 0a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <p className="text-sm">No customers found</p>
          </div>
        ) : (
          <div className="divide-y">
            {manager.customers.map((customer) => (
              <button
                key={customer._id}
                onClick={() => manager.selectCustomer(customer)}
                className={`w-full text-left p-4 transition-all hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset ${
                  manager.selectedCustomer?._id === customer._id ? 'bg-blue-50 border-r-4' : ''
                }`}
                style={
                  manager.selectedCustomer?._id === customer._id
                    ? { borderRightColor: primaryColor }
                    : undefined
                }
                aria-label={formatCustomerName(customer.firstName, customer.lastName)}
                aria-current={
                  manager.selectedCustomer?._id === customer._id ? 'true' : 'false'
                }
              >
                <div className="font-semibold text-gray-900">
                  {formatCustomerName(customer.firstName, customer.lastName)}
                </div>
                <div className="text-sm text-gray-500 truncate">
                  {getCustomerContact(customer.email, customer.phone)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <GridPageTemplate
        title="Customer Credits"
        subtitle="Manage customer prepaid credit balances and transaction history"
        loading={!dict}
        sidebar={sidebarContent}
        sidebarPosition="left"
      >
        <CreditDetails
          selectedCustomer={manager.selectedCustomer}
          creditHistory={manager.creditHistory}
          loading={manager.loading}
          primaryColor={primaryColor}
          onAddCredit={() => openModal('add')}
          onAdjustCredit={() => openModal('adjust')}
          onRefundCredit={() => openModal('refund')}
        />
      </GridPageTemplate>

      <CreditModal
        isOpen={showModal}
        mode={modalMode}
        amount={amount}
        reason={reason}
        submitting={manager.submitting}
        primaryColor={primaryColor}
        onAmountChange={setAmount}
        onReasonChange={setReason}
        onSubmit={handleAddCredit}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}
