'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import Navbar from '@/components/Navbar';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';

interface Product {
  _id: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  sku?: string;
  category?: string;
  categoryId?: {
    _id: string;
    name: string;
  } | string;
  productType: 'regular' | 'bundle' | 'service';
  hasVariations: boolean;
  variations?: any[];
  trackInventory: boolean;
  lowStockThreshold?: number;
  createdAt: string;
}

interface Category {
  _id: string;
  name: string;
}

export default function ProductsPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { settings } = useTenantSettings();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchProducts();
    fetchCategories();
  }, [lang, tenant]);

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setProducts(data.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setCategories(data.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      const res = await fetch(`/api/products/${productId}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Product deleted successfully' });
        fetchProducts();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to delete product' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete product' });
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {dict.admin?.products || 'Products'}
              </h1>
              <p className="text-gray-600">{dict.admin?.productsSubtitle || 'Manage products, variations, and bundles'}</p>
            </div>
            <button
              onClick={() => router.push(`/${tenant}/${lang}/admin`)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
            >
              {dict.common?.back || 'Back'}
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white border border-gray-300 p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex-1 max-w-md">
              <input
                type="text"
                placeholder={dict.common?.search || 'Search products...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <button
              onClick={() => {
                setEditingProduct(null);
                setShowProductModal(true);
              }}
              className="ml-4 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 font-medium border border-blue-700"
            >
              {dict.common?.add || 'Add'} {dict.admin?.product || 'Product'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.name || 'Name'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.category || 'Category'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.price || 'Price'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.stock || 'Stock'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.common?.type || 'Type'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.common?.actions || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredProducts.map((product) => (
                  <tr key={product._id}>
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-gray-900">{product.name}</div>
                      {product.description && (
                        <div className="text-xs text-gray-500 mt-1">{product.description.substring(0, 50)}...</div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{product.sku || '-'}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {typeof product.categoryId === 'object' && product.categoryId?.name ? product.categoryId.name : product.category || '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <Currency amount={product.price} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${product.stock < (product.lowStockThreshold || 10) ? 'text-red-600' : 'text-gray-900'}`}>
                        {product.trackInventory ? product.stock : '∞'}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-semibold border border-blue-300 bg-blue-100 text-blue-800">
                        {product.productType}
                        {product.hasVariations && ' (variations)'}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingProduct(product);
                            setShowProductModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          {dict.common?.edit || 'Edit'}
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(product._id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          {dict.common?.delete || 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredProducts.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                {searchTerm ? (dict.common?.noResults || 'No products found') : (dict.common?.noData || 'No products yet')}
              </div>
            )}
          </div>
        </div>

        {showProductModal && (
          <ProductModal
            product={editingProduct}
            categories={categories}
            onClose={() => {
              setShowProductModal(false);
              setEditingProduct(null);
            }}
            onSave={() => {
              fetchProducts();
              setShowProductModal(false);
              setEditingProduct(null);
            }}
            dict={dict}
          />
        )}
      </div>
    </div>
  );
}

function ProductModal({
  product,
  categories,
  onClose,
  onSave,
  dict,
}: {
  product: Product | null;
  categories: Category[];
  onClose: () => void;
  onSave: () => void;
  dict: any;
}) {
  const [formData, setFormData] = useState({
    name: product?.name || '',
    description: product?.description || '',
    price: product?.price || 0,
    stock: product?.stock || 0,
    sku: product?.sku || '',
    categoryId: typeof product?.categoryId === 'object' && product.categoryId?._id ? product.categoryId._id : product?.categoryId || '',
    productType: product?.productType || 'regular',
    trackInventory: product?.trackInventory !== undefined ? product.trackInventory : true,
    lowStockThreshold: product?.lowStockThreshold || 10,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const categoryListRef = useRef<HTMLDivElement>(null);

  // Initialize category search with current category name
  useEffect(() => {
    if (product?.categoryId) {
      const currentCategory = categories.find(
        cat => cat._id === (typeof product.categoryId === 'object' && product.categoryId?._id ? product.categoryId._id : product.categoryId)
      );
      if (currentCategory) {
        setCategorySearch(currentCategory.name);
      } else {
        setCategorySearch('');
      }
    } else {
      setCategorySearch('');
    }
  }, [product, categories]);

  // Filter categories based on search
  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    return categories.filter(cat =>
      cat.name.toLowerCase().includes(categorySearch.toLowerCase())
    );
  }, [categorySearch, categories]);

  // Handle category selection
  const handleCategorySelect = (category: Category) => {
    setFormData({ ...formData, categoryId: category._id });
    setCategorySearch(category.name);
    setShowCategorySuggestions(false);
  };

  // Handle clicks outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        categoryInputRef.current &&
        categoryListRef.current &&
        !categoryInputRef.current.contains(event.target as Node) &&
        !categoryListRef.current.contains(event.target as Node)
      ) {
        setShowCategorySuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const url = product ? `/api/products/${product._id}` : '/api/products';
      const method = product ? 'PUT' : 'POST';
      const body = {
        name: formData.name,
        description: formData.description || undefined,
        price: formData.price,
        stock: formData.stock,
        sku: formData.sku || undefined,
        categoryId: formData.categoryId || undefined,
        productType: formData.productType,
        trackInventory: formData.trackInventory,
        lowStockThreshold: formData.lowStockThreshold,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        onSave();
      } else {
        setError(data.error || 'Failed to save product');
      }
    } catch (error) {
      setError('Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {product ? (dict.admin?.editProduct || 'Edit Product') : (dict.admin?.addProduct || 'Add Product')}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.name || 'Name'} *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                <input
                  type="text"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.description || 'Description'}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.price || 'Price'} *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.stock || 'Stock'}
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  disabled={!formData.trackInventory}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.lowStockThreshold || 'Low Stock Threshold'}
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.lowStockThreshold}
                  onChange={(e) => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value) || 10 })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.category || 'Category'}
                </label>
                <div ref={categoryInputRef} className="relative">
                  <input
                    type="text"
                    value={categorySearch}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCategorySearch(value);
                      setShowCategorySuggestions(true);
                      // Clear categoryId if search doesn't match any category
                      const matchingCategory = categories.find(
                        cat => cat.name.toLowerCase() === value.toLowerCase()
                      );
                      if (matchingCategory) {
                        setFormData({ ...formData, categoryId: matchingCategory._id });
                      } else {
                        setFormData({ ...formData, categoryId: '' });
                      }
                    }}
                    onFocus={() => setShowCategorySuggestions(true)}
                    placeholder={dict.admin?.searchCategory || 'Type to search categories...'}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  {showCategorySuggestions && filteredCategories.length > 0 && (
                    <div
                      ref={categoryListRef}
                      className="absolute z-50 w-full mt-1 bg-white border border-gray-300 max-h-60 overflow-y-auto"
                    >
                      {filteredCategories.map((cat) => (
                        <button
                          key={cat._id}
                          type="button"
                          onClick={() => handleCategorySelect(cat)}
                          className={`w-full text-left px-4 py-2 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none transition-colors ${
                            formData.categoryId === cat._id ? 'bg-blue-100' : ''
                          }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {showCategorySuggestions && categorySearch && filteredCategories.length === 0 && (
                    <div
                      ref={categoryListRef}
                      className="absolute z-50 w-full mt-1 bg-white border border-gray-300 p-4 text-sm text-gray-500"
                    >
                      {dict.admin?.noCategoryFound || 'No category found'}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.common?.type || 'Type'}
                </label>
                <select
                  value={formData.productType}
                  onChange={(e) => setFormData({ ...formData, productType: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="regular">{dict.admin?.regular || 'Regular'}</option>
                  <option value="bundle">{dict.admin?.bundle || 'Bundle'}</option>
                  <option value="service">{dict.admin?.service || 'Service'}</option>
                </select>
              </div>
            </div>
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.trackInventory}
                  onChange={(e) => setFormData({ ...formData, trackInventory: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-700">
                  {dict.admin?.trackInventory || 'Track Inventory'}
                </span>
              </label>
            </div>
            {error && (
              <div className="bg-red-50 text-red-800 border border-red-300 p-3">
                {error}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white"
              >
                {dict.common?.cancel || 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 border border-blue-700"
              >
                {saving ? (dict.common?.loading || 'Saving...') : (dict.common?.save || 'Save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

