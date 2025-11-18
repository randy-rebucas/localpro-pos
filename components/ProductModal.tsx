'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

interface Product {
  _id?: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  sku?: string;
  category?: string;
}

interface ProductModalProps {
  product: Product | null;
  onClose: () => void;
  lang?: 'en' | 'es';
}

export default function ProductModal({ product, onClose, lang = 'en' }: ProductModalProps) {
  const params = useParams();
  const tenant = (params?.tenant as string) || 'default';
  const [dict, setDict] = useState<any>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    stock: '',
    sku: '',
    category: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name || '',
        description: product.description || '',
        price: product.price?.toString() || '',
        stock: product.stock?.toString() || '',
        sku: product.sku || '',
        category: product.category || '',
      });
    }
  }, [product]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = product?._id 
        ? `/api/products/${product._id}?tenant=${tenant}` 
        : `/api/products?tenant=${tenant}`;
      const method = product?._id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          price: parseFloat(formData.price),
          stock: parseInt(formData.stock),
          sku: formData.sku || undefined,
          category: formData.category || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        onClose();
      } else {
        alert(data.error || (dict?.products.saveError || 'Failed to save product'));
      }
    } catch (error) {
      console.error('Error saving product:', error);
      alert(dict?.products.saveError || 'Failed to save product');
    } finally {
      setLoading(false);
    }
  };

  if (!dict) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl sm:text-2xl font-bold mb-4">
          {product ? dict.products.editProduct : dict.products.addProduct}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {dict.products.name} *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {dict.products.description}
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.products.price} *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.products.stock} *
              </label>
              <input
                type="number"
                required
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {dict.products.sku}
            </label>
            <input
              type="text"
              value={formData.sku}
              onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {dict.products.category}
            </label>
            <input
              type="text"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 active:bg-gray-100 font-medium"
            >
              {dict.common.cancel}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? dict.common.loading : dict.common.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

