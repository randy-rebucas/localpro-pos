'use client';

import { useCallback, useState } from 'react';
import type { StockTransferStatus } from '@/lib/stock-transfer-helpers';

export interface StockTransferItem {
  _id: string;
  productId: string;
  product?: { id: string; name: string; sku?: string };
  quantityRequested: number;
  quantitySent: number;
  quantityReceived: number;
}

export interface StockTransfer {
  _id: string;
  transferNumber: string;
  fromBranchId: string;
  fromBranch?: { id: string; name: string };
  toBranchId: string;
  toBranch?: { id: string; name: string };
  status: StockTransferStatus;
  notes?: string;
  sentAt?: string;
  receivedAt?: string;
  items: StockTransferItem[];
  createdAt: string;
}

export interface StockTransferItemInput {
  productId: string;
  quantityRequested: number;
}

export interface StockTransferFormData {
  fromBranchId: string;
  toBranchId: string;
  notes?: string;
  items: StockTransferItemInput[];
}

interface UseStockTransferListReturn {
  stockTransfers: StockTransfer[];
  loading: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
  fetchStockTransfers: () => Promise<void>;
  createStockTransfer: (form: StockTransferFormData) => Promise<true | string>;
  updateStockTransferStatus: (id: string, status: StockTransferStatus) => Promise<true | string>;
  deleteStockTransfer: (id: string) => Promise<boolean>;
  sendStockTransfer: (id: string) => Promise<true | string>;
  receiveItems: (id: string, items: { itemId: string; quantityReceived: number }[]) => Promise<true | string>;
  clearMessage: () => void;
  setMessage: (message: { type: 'success' | 'error'; text: string } | null) => void;
}

export function useStockTransferList(): UseStockTransferListReturn {
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchStockTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stock-transfers', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setStockTransfers(data.data || []);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to fetch stock transfers' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to fetch stock transfers' });
    } finally {
      setLoading(false);
    }
  }, []);

  const createStockTransfer = useCallback(async (form: StockTransferFormData) => {
    try {
      const res = await fetch('/api/stock-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Stock transfer created successfully' });
        return true;
      }
      const errorText = data.error || 'Failed to create stock transfer';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    } catch {
      const errorText = 'Failed to create stock transfer';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    }
  }, []);

  const updateStockTransferStatus = useCallback(async (id: string, status: StockTransferStatus) => {
    try {
      const res = await fetch(`/api/stock-transfers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Stock transfer updated successfully' });
        return true;
      }
      const errorText = data.error || 'Failed to update stock transfer';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    } catch {
      const errorText = 'Failed to update stock transfer';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    }
  }, []);

  const deleteStockTransfer = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/stock-transfers/${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Stock transfer deleted successfully' });
        return true;
      }
      setMessage({ type: 'error', text: data.error || 'Failed to delete stock transfer' });
      return false;
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete stock transfer' });
      return false;
    }
  }, []);

  const sendStockTransfer = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/stock-transfers/${id}/send`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Stock transfer marked as sent' });
        return true;
      }
      const errorText = data.error || 'Failed to send stock transfer';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    } catch {
      const errorText = 'Failed to send stock transfer';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    }
  }, []);

  const receiveItems = useCallback(async (id: string, items: { itemId: string; quantityReceived: number }[]) => {
    try {
      const res = await fetch(`/api/stock-transfers/${id}/receive`, {
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
    stockTransfers,
    loading,
    message,
    fetchStockTransfers,
    createStockTransfer,
    updateStockTransferStatus,
    deleteStockTransfer,
    sendStockTransfer,
    receiveItems,
    clearMessage,
    setMessage,
  };
}
