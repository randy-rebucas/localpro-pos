import { useCallback, useRef, useState } from 'react';
import { showToast } from '@/lib/toast';

export interface Customer {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  creditBalance?: number;
}

export interface CreditTransaction {
  _id: string;
  customerId: string;
  type: 'top_up' | 'usage' | 'refund' | 'adjustment';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason?: string;
  transactionId?: string;
  createdBy?: string;
  createdAt: string;
}

export function useCreditsManager(tenant: string) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [creditHistory, setCreditHistory] = useState<CreditTransaction[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchCustomers = useCallback(
    async (searchValue: string) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      abortControllerRef.current = controller;
      setLoading(true);

      try {
        const res = await fetch(
          `/api/customers?tenant=${tenant}&search=${encodeURIComponent(searchValue)}`,
          {
            credentials: 'include',
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          setCustomers(data.data || []);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Failed to fetch customers:', err);
          showToast.error('Failed to load customers');
        }
      } finally {
        setLoading(false);
      }
    },
    [tenant]
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(() => {
        fetchCustomers(value);
      }, 300);
    },
    [fetchCustomers]
  );

  const fetchCustomerCredits = useCallback(
    async (customerId: string) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      abortControllerRef.current = controller;

      try {
        const res = await fetch(
          `/api/customers/${customerId}/credits?tenant=${tenant}`,
          {
            credentials: 'include',
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          setCreditHistory(data.data?.creditHistory || []);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Failed to fetch credit history:', err);
          showToast.error('Failed to load credit history');
        }
      }
    },
    [tenant]
  );

  const selectCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer);
    await fetchCustomerCredits(customer._id);
  };

  const addCredit = useCallback(
    async (
      customerId: string,
      type: 'top_up' | 'refund' | 'adjustment',
      amount: number,
      reason: string
    ) => {
      try {
        setSubmitting(true);
        const payload = { type, amount, reason };

        const res = await fetch(
          `/api/customers/${customerId}/credits?tenant=${tenant}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
          }
        );

        const data = await res.json();

        if (res.ok && data.success) {
          const modeLabel =
            type === 'top_up' ? 'Credits added' : type === 'refund' ? 'Refund processed' : 'Balance adjusted';
          showToast.success(modeLabel);

          // Update customers list and selected customer
          const updatedCustomers = customers.map((c) =>
            c._id === customerId ? { ...c, creditBalance: data.data?.newBalance } : c
          );
          setCustomers(updatedCustomers);

          if (selectedCustomer?._id === customerId) {
            setSelectedCustomer({
              ...selectedCustomer,
              creditBalance: data.data?.newBalance,
            });
            await fetchCustomerCredits(customerId);
          }

          return true;
        } else {
          showToast.error(data.error || 'Failed to process credit operation');
          return false;
        }
      } catch (err) {
        console.error('Error:', err);
        showToast.error('Failed to process credit operation');
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [tenant, customers, selectedCustomer, fetchCustomerCredits]
  );

  const cleanup = useCallback(() => {
    clearTimeout(searchTimeoutRef.current ?? undefined);
    abortControllerRef.current?.abort();
  }, []);

  return {
    customers,
    loading,
    search,
    selectedCustomer,
    creditHistory,
    submitting,
    fetchCustomers,
    handleSearchChange,
    selectCustomer,
    addCredit,
    cleanup,
  };
}
