'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

interface Product {
  _id: string;
  name: string;
  stock: number;
  sku?: string;
}

interface StockRefillModalProps {
  product: Product | null;
  onClose: () => void;
  onSuccess: () => void;
  lang?: 'en' | 'es';
}

export default function StockRefillModal({ product, onClose, onSuccess, lang = 'en' }: StockRefillModalProps) {
  const params = useParams();
  const tenant = (params?.tenant as string) || 'default';
  const [dict, setDict] = useState<any>(null);
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    if (product) {
      setQuantity('');
      setNotes('');
      setError('');
    }
  }, [product]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const qty = parseInt(quantity);
    if (!qty || qty <= 0) {
      setError(dict?.products.refill?.invalidQuantity || 'Please enter a valid quantity');
      return;
    }

    if (!product) {
      setError(dict?.products.refill?.productNotFound || 'Product not found');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/products/${product._id}/refill?tenant=${tenant}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: qty,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
      } else {
        setError(data.error || (dict?.products.refill?.error || 'Failed to refill stock'));
      }
    } catch (error) {
      console.error('Error refilling stock:', error);
      setError(dict?.products.refill?.error || 'Failed to refill stock');
    } finally {
      setLoading(false);
    }
  };

  if (!dict || !product) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md">
        <h2 className="text-xl sm:text-2xl font-bold mb-4">
          {dict.products.refill?.title || 'Refill Stock'}
        </h2>
        
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-600 mb-1">
            {dict?.products?.name || 'Product'}
          </div>
          <div className="font-semibold text-gray-900">{product.name}</div>
          {product.sku && (
            <div className="text-xs text-gray-500 mt-1">SKU: {product.sku}</div>
          )}
          <div className="text-sm text-gray-600 mt-2">
            {dict?.products?.currentStock || dict?.products?.stock || 'Current Stock'}: <span className="font-semibold">{product.stock}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {dict.products.refill?.quantity || 'Quantity to Add'} *
            </label>
            <input
              type="number"
              min="1"
              step="1"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="0"
              autoFocus
            />
            {quantity && parseInt(quantity) > 0 && (
              <div className="mt-2 text-sm text-gray-600">
                {dict.products.refill?.newStock || 'New Stock'}: <span className="font-semibold text-blue-600">
                  {product.stock + parseInt(quantity)}
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {dict.products.refill?.notes || 'Notes'} (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder={dict.products.refill?.notesPlaceholder || 'Add any notes about this refill...'}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="w-full sm:w-auto px-4 py-2.5 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 active:bg-gray-100 font-medium disabled:opacity-50"
            >
              {dict.common.cancel}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? (dict.common.loading || 'Loading...') : (dict.products.refill?.submit || 'Refill Stock')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

