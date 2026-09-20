'use client';

import { useCallback, useState } from 'react';

export interface Supplier {
  _id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

export interface SupplierFormData {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  isActive?: boolean;
}

interface UseSupplierListReturn {
  suppliers: Supplier[];
  loading: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
  fetchSuppliers: () => Promise<void>;
  createSupplier: (form: SupplierFormData) => Promise<true | string>;
  updateSupplier: (id: string, form: Partial<SupplierFormData>) => Promise<true | string>;
  deleteSupplier: (id: string) => Promise<boolean>;
  clearMessage: () => void;
  setMessage: (message: { type: 'success' | 'error'; text: string } | null) => void;
}

export function useSupplierList(): UseSupplierListReturn {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/suppliers', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setSuppliers(data.data || []);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to fetch suppliers' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to fetch suppliers' });
    } finally {
      setLoading(false);
    }
  }, []);

  const createSupplier = useCallback(async (form: SupplierFormData) => {
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Supplier created successfully' });
        return true;
      }
      const errorText = data.error || 'Failed to save supplier';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    } catch {
      const errorText = 'Failed to save supplier';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    }
  }, []);

  const updateSupplier = useCallback(async (id: string, form: Partial<SupplierFormData>) => {
    try {
      const res = await fetch(`/api/suppliers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Supplier updated successfully' });
        return true;
      }
      const errorText = data.error || 'Failed to update supplier';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    } catch {
      const errorText = 'Failed to update supplier';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    }
  }, []);

  const deleteSupplier = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/suppliers/${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Supplier deleted successfully' });
        return true;
      }
      setMessage({ type: 'error', text: data.error || 'Failed to delete supplier' });
      return false;
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete supplier' });
      return false;
    }
  }, []);

  const clearMessage = useCallback(() => setMessage(null), []);

  return {
    suppliers,
    loading,
    message,
    fetchSuppliers,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    clearMessage,
    setMessage,
  };
}
