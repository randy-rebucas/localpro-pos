'use client';

import { useCallback, useState } from 'react';
import type { PurchaseOrderStatus } from '@/lib/purchase-order-helpers';

export interface PurchaseOrderItem {
  _id: string;
  productId: string;
  product?: { id: string; name: string; sku?: string };
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  subtotal: number;
}

export interface PurchaseOrder {
  _id: string;
  orderNumber: string;
  supplierId: string;
  supplier?: { id: string; name: string };
  branchId?: string;
  branch?: { id: string; name: string };
  status: PurchaseOrderStatus;
  notes?: string;
  expectedDate?: string;
  receivedAt?: string;
  totalAmount: number;
  items: PurchaseOrderItem[];
  createdAt: string;
}

export interface PurchaseOrderItemInput {
  productId: string;
  quantityOrdered: number;
  unitCost: number;
}

export interface PurchaseOrderFormData {
  supplierId: string;
  branchId?: string;
  notes?: string;
  expectedDate?: string;
  items: PurchaseOrderItemInput[];
}

interface UsePurchaseOrderListReturn {
  purchaseOrders: PurchaseOrder[];
  loading: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
  fetchPurchaseOrders: () => Promise<void>;
  createPurchaseOrder: (form: PurchaseOrderFormData) => Promise<true | string>;
  updatePurchaseOrderStatus: (id: string, status: PurchaseOrderStatus) => Promise<true | string>;
  deletePurchaseOrder: (id: string) => Promise<boolean>;
  receiveItems: (id: string, items: { itemId: string; quantityReceived: number }[]) => Promise<true | string>;
  clearMessage: () => void;
  setMessage: (message: { type: 'success' | 'error'; text: string } | null) => void;
}

export function usePurchaseOrderList(): UsePurchaseOrderListReturn {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchPurchaseOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/purchase-orders', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setPurchaseOrders(data.data || []);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to fetch purchase orders' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to fetch purchase orders' });
    } finally {
      setLoading(false);
    }
  }, []);

  const createPurchaseOrder = useCallback(async (form: PurchaseOrderFormData) => {
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Purchase order created successfully' });
        return true;
      }
      const errorText = data.error || 'Failed to create purchase order';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    } catch {
      const errorText = 'Failed to create purchase order';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    }
  }, []);

  const updatePurchaseOrderStatus = useCallback(async (id: string, status: PurchaseOrderStatus) => {
    try {
      const res = await fetch(`/api/purchase-orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Purchase order updated successfully' });
        return true;
      }
      const errorText = data.error || 'Failed to update purchase order';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    } catch {
      const errorText = 'Failed to update purchase order';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    }
  }, []);

  const deletePurchaseOrder = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/purchase-orders/${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Purchase order deleted successfully' });
        return true;
      }
      setMessage({ type: 'error', text: data.error || 'Failed to delete purchase order' });
      return false;
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete purchase order' });
      return false;
    }
  }, []);

  const receiveItems = useCallback(async (id: string, items: { itemId: string; quantityReceived: number }[]) => {
    try {
      const res = await fetch(`/api/purchase-orders/${id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Stock received successfully' });
        return true;
      }
      const errorText = data.error || 'Failed to receive stock';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    } catch {
      const errorText = 'Failed to receive stock';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    }
  }, []);

  const clearMessage = useCallback(() => setMessage(null), []);

  return {
    purchaseOrders,
    loading,
    message,
    fetchPurchaseOrders,
    createPurchaseOrder,
    updatePurchaseOrderStatus,
    deletePurchaseOrder,
    receiveItems,
    clearMessage,
    setMessage,
  };
}
