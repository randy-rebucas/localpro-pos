'use client';

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { showToast } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';

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
  variations?: Array<Record<string, unknown>>;
  trackInventory: boolean;
  lowStockThreshold?: number;
  createdAt: string;
  // Restaurant-specific fields
  modifiers?: Array<{
    name: string;
    options: Array<{ name: string; price: number }>;
    required: boolean;
  }>;
  allergens?: string[];
  nutritionInfo?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
  // Laundry-specific fields
  serviceType?: 'wash' | 'dry-clean' | 'press' | 'repair' | 'other';
  weightBased?: boolean;
  pickupDelivery?: boolean;
  estimatedDuration?: number;
  // Service-specific fields
  serviceDuration?: number;
  staffRequired?: number;
  equipmentRequired?: string[];
}

interface Category {
  _id: string;
  name: string;
}

export default function ProductsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Record<string, unknown> | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { settings } = useTenantSettings();
  const { confirm, Dialog } = useConfirm();
  const [businessTypeConfig, setBusinessTypeConfig] = useState<Record<string, unknown> | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/products', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setProducts(data.data);
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: data.error || dict?.common?.failedToFetchProducts || 'Failed to fetch products' });
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      setMessage({ type: 'error', text: dict?.common?.failedToFetchProducts || 'Failed to fetch products' });
    } finally {
      setLoading(false);
    }
  }, [dict]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setCategories(data.data);
      } else {
        console.error('Error fetching categories:', data.error);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }, []);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchProducts();
    fetchCategories();
  }, [lang, tenant, fetchProducts, fetchCategories]);

  useEffect(() => {
    if (settings) {
      const businessType = getBusinessType(settings);
      const config = getBusinessTypeConfig(businessType);
      setBusinessTypeConfig(config);
    }
  }, [settings]);

  const handleDeleteProduct = async (productId: string) => {
    if (!dict) return;
    const confirmed = await confirm(
      dict.common?.deleteProductConfirmTitle || 'Delete Product',
      dict.common?.deleteProductConfirm || 'Are you sure you want to delete this product?',
      { variant: 'danger' }
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/products/${productId}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        showToast.success(dict.common?.productDeletedSuccess || 'Product deleted successfully');
        fetchProducts();
      } else {
        showToast.error(data.error || dict.common?.failedToDeleteProduct || 'Failed to delete product');
      }
    } catch {
      showToast.error(dict.common?.failedToDeleteProduct || 'Failed to delete product');
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
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {Dialog}
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {dict?.admin?.backToAdmin || 'Back to Admin'}
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {dict.admin?.products || 'Products'}
              </h1>
              <p className="text-gray-600">{dict.admin?.productsSubtitle || 'Manage products, variations, and bundles'}</p>
            </div>
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
            businessTypeConfig={businessTypeConfig}
            settings={settings}
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
  businessTypeConfig,
  settings,
}: {
  product: Product | null;
  categories: Category[];
  onClose: () => void;
  onSave: () => void;
  dict: Record<string, unknown>;
  businessTypeConfig: Record<string, unknown>;
  settings: Record<string, unknown>;
}) {
  const [formData, setFormData] = useState({
    name: product?.name || '',
    description: product?.description || '',
    price: product?.price || 0,
    stock: product?.stock || 0,
    sku: product?.sku || '',
    categoryId: typeof product?.categoryId === 'object' && product.categoryId?._id ? product.categoryId._id : product?.categoryId || '',
    productType: product?.productType || (businessTypeConfig?.productTypes?.[0] || 'regular'),
    trackInventory: product?.trackInventory !== undefined ? product.trackInventory : (businessTypeConfig?.defaultFeatures?.enableInventory ?? true),
    lowStockThreshold: product?.lowStockThreshold || 10,
    // Restaurant-specific fields
    modifiers: product?.modifiers || [],
    allergens: product?.allergens || [],
    nutritionInfo: product?.nutritionInfo || { calories: undefined, protein: undefined, carbs: undefined, fat: undefined },
    // Laundry-specific fields
    serviceType: product?.serviceType || 'wash',
    weightBased: product?.weightBased || false,
    pickupDelivery: product?.pickupDelivery || false,
    estimatedDuration: product?.estimatedDuration || undefined,
    // Service-specific fields
    serviceDuration: product?.serviceDuration || undefined,
    staffRequired: product?.staffRequired || 1,
    equipmentRequired: product?.equipmentRequired || [],
  });

  // Update formData when product or businessTypeConfig changes
  useEffect(() => {
    setFormData({
      name: product?.name || '',
      description: product?.description || '',
      price: product?.price || 0,
      stock: product?.stock || 0,
      sku: product?.sku || '',
      categoryId: typeof product?.categoryId === 'object' && product.categoryId?._id ? product.categoryId._id : product?.categoryId || '',
      productType: product?.productType || (businessTypeConfig?.productTypes?.[0] || 'regular'),
      trackInventory: product?.trackInventory !== undefined ? product.trackInventory : (businessTypeConfig?.defaultFeatures?.enableInventory ?? true),
      lowStockThreshold: product?.lowStockThreshold || 10,
      // Restaurant-specific fields
      modifiers: product?.modifiers || [],
      allergens: product?.allergens || [],
      nutritionInfo: product?.nutritionInfo || { calories: undefined, protein: undefined, carbs: undefined, fat: undefined },
      // Laundry-specific fields
      serviceType: product?.serviceType || 'wash',
      weightBased: product?.weightBased || false,
      pickupDelivery: product?.pickupDelivery || false,
      estimatedDuration: product?.estimatedDuration || undefined,
      // Service-specific fields
      serviceDuration: product?.serviceDuration || undefined,
      staffRequired: product?.staffRequired || 1,
      equipmentRequired: product?.equipmentRequired || [],
    });
  }, [product, businessTypeConfig]);
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
      const body: Record<string, unknown> = {
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

      // Add restaurant-specific fields
      if (settings?.businessType?.toLowerCase() === 'restaurant') {
        if (formData.allergens && formData.allergens.length > 0) {
          body.allergens = formData.allergens;
        }
        if (formData.nutritionInfo && (formData.nutritionInfo.calories || formData.nutritionInfo.protein)) {
          body.nutritionInfo = formData.nutritionInfo;
        }
        if (formData.modifiers && formData.modifiers.length > 0) {
          body.modifiers = formData.modifiers;
        }
      }

      // Add laundry-specific fields
      if (settings?.businessType?.toLowerCase() === 'laundry') {
        body.serviceType = formData.serviceType;
        body.weightBased = formData.weightBased;
        body.pickupDelivery = formData.pickupDelivery;
        if (formData.estimatedDuration) {
          body.estimatedDuration = formData.estimatedDuration;
        }
      }

      // Add service-specific fields
      if (settings?.businessType?.toLowerCase() === 'service') {
        if (formData.serviceDuration) {
          body.serviceDuration = formData.serviceDuration;
        }
        body.staffRequired = formData.staffRequired;
        if (formData.equipmentRequired && formData.equipmentRequired.length > 0) {
          body.equipmentRequired = formData.equipmentRequired;
        }
      }

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
    } catch {
      setError('Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {product ? (dict.admin?.editProduct || 'Edit Product') : (dict.admin?.addProduct || 'Add Product')}
          </h2>
          {businessTypeConfig && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-sm text-blue-900">
                <strong>Business Type:</strong> {businessTypeConfig.name}
              </p>
              <p className="text-xs text-blue-700 mt-1">
                {businessTypeConfig.description}
              </p>
              {businessTypeConfig.requiredFields.length > 0 && (
                <p className="text-xs text-blue-700 mt-1">
                  <strong>Required fields:</strong> {businessTypeConfig.requiredFields.join(', ')}
                </p>
              )}
            </div>
          )}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SKU {businessTypeConfig?.requiredFields?.includes('sku') && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  required={businessTypeConfig?.requiredFields?.includes('sku')}
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
            <div className={`grid gap-4 ${businessTypeConfig?.defaultFeatures?.enableInventory !== false ? 'grid-cols-3' : 'grid-cols-1'}`}>
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
              {businessTypeConfig?.defaultFeatures?.enableInventory !== false && (
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
              )}
              {businessTypeConfig?.defaultFeatures?.enableInventory !== false && (
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
              )}
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
                  {dict.common?.type || 'Type'} {businessTypeConfig && `(${businessTypeConfig.name})`}
                </label>
                <select
                  value={formData.productType}
                  onChange={(e) => setFormData({ ...formData, productType: e.target.value as 'product' | 'service' | 'bundle' })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {businessTypeConfig?.productTypes?.map((type: string) => (
                    <option key={type} value={type}>
                      {type === 'regular' ? (dict.admin?.regular || 'Regular') : 
                       type === 'bundle' ? (dict.admin?.bundle || 'Bundle') : 
                       (dict.admin?.service || 'Service')}
                    </option>
                  )) || (
                    <>
                      <option value="regular">{dict.admin?.regular || 'Regular'}</option>
                      <option value="bundle">{dict.admin?.bundle || 'Bundle'}</option>
                      <option value="service">{dict.admin?.service || 'Service'}</option>
                    </>
                  )}
                </select>
                {businessTypeConfig && businessTypeConfig.productTypes.length === 1 && (
                  <p className="mt-1 text-xs text-gray-500">
                    Only {businessTypeConfig.productTypes[0]} products are allowed for {businessTypeConfig.name}
                  </p>
                )}
              </div>
            </div>
            {businessTypeConfig?.defaultFeatures?.enableInventory !== false && (
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
            )}

            {/* Restaurant-specific fields */}
            {settings?.businessType?.toLowerCase() === 'restaurant' && (
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Restaurant Information</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Allergens (comma-separated)</label>
                  <input
                    type="text"
                    value={Array.isArray(formData.allergens) ? formData.allergens.join(', ') : formData.allergens || ''}
                    onChange={(e) => {
                      const allergens = e.target.value.split(',').map(a => a.trim()).filter(a => a);
                      setFormData({ ...formData, allergens });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                    placeholder="e.g., gluten, dairy, nuts"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Calories</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.nutritionInfo?.calories || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        nutritionInfo: { ...formData.nutritionInfo, calories: parseInt(e.target.value) || undefined }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Protein (g)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={formData.nutritionInfo?.protein || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        nutritionInfo: { ...formData.nutritionInfo, protein: parseFloat(e.target.value) || undefined }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Laundry-specific fields */}
            {settings?.businessType?.toLowerCase() === 'laundry' && (
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Laundry Service Information</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Service Type</label>
                  <select
                    value={formData.serviceType}
                    onChange={(e) => setFormData({ ...formData, serviceType: e.target.value as string })}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="wash">Wash</option>
                    <option value="dry-clean">Dry Clean</option>
                    <option value="press">Press</option>
                    <option value="repair">Repair</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.weightBased}
                        onChange={(e) => setFormData({ ...formData, weightBased: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">Weight-based pricing</span>
                    </label>
                  </div>
                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.pickupDelivery}
                        onChange={(e) => setFormData({ ...formData, pickupDelivery: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">Pickup & Delivery</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Duration (minutes)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.estimatedDuration || ''}
                    onChange={(e) => setFormData({ ...formData, estimatedDuration: parseInt(e.target.value) || undefined })}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
              </div>
            )}

            {/* Service-specific fields */}
            {settings?.businessType?.toLowerCase() === 'service' && (
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Service Information</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Service Duration (minutes)</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.serviceDuration || ''}
                      onChange={(e) => setFormData({ ...formData, serviceDuration: parseInt(e.target.value) || undefined })}
                      className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Staff Required</label>
                    <input
                      type="number"
                      min="1"
                      value={formData.staffRequired || 1}
                      onChange={(e) => setFormData({ ...formData, staffRequired: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Equipment Required (comma-separated)</label>
                  <input
                    type="text"
                    value={Array.isArray(formData.equipmentRequired) ? formData.equipmentRequired.join(', ') : formData.equipmentRequired || ''}
                    onChange={(e) => {
                      const equipment = e.target.value.split(',').map(e => e.trim()).filter(e => e);
                      setFormData({ ...formData, equipmentRequired: equipment });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                    placeholder="e.g., scissors, clippers, styling chair"
                  />
                </div>
              </div>
            )}
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

