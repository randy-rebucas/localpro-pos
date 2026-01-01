'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import Currency from '@/components/Currency';
import PageTitle from '@/components/PageTitle';
import ProductModal from '@/components/ProductModal';
import StockRefillModal from '@/components/StockRefillModal';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';

interface Product {
  _id: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  sku?: string;
  category?: string;
  pinned?: boolean;
  trackInventory?: boolean;
  allowOutOfStockSales?: boolean;
}

export default function ProductsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRefillModalOpen, setIsRefillModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [refillingProduct, setRefillingProduct] = useState<Product | null>(null);
  const [dict, setDict] = useState<any>(null);
  const [displayMode, setDisplayMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // Load display mode from localStorage
  useEffect(() => {
    const savedDisplayMode = localStorage.getItem(`displayMode_${tenant}`);
    if (savedDisplayMode === 'list' || savedDisplayMode === 'grid') {
      setDisplayMode(savedDisplayMode);
    }
  }, [tenant]);

  // Save display mode to localStorage
  useEffect(() => {
    localStorage.setItem(`displayMode_${tenant}`, displayMode);
  }, [displayMode, tenant]);

  useEffect(() => {
    fetchProducts();
  }, [search, tenant]);

  // Sort products: pinned first, then by creation date
  const sortedProducts = [...products].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/products?search=${encodeURIComponent(search)}&tenant=${tenant}`);
      const data = await res.json();
      if (data.success) {
        setProducts(data.data);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!dict) return;
    if (!confirm(dict.products.deleteConfirm)) return;

    try {
      const res = await fetch(`/api/products/${id}?tenant=${tenant}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchProducts();
      } else {
        alert(data.error || dict.products.deleteError);
      }
    } catch (error) {
      console.error('Error deleting product:', error);
      alert(dict.products.deleteError);
    }
  };

  const handleEdit = async (product: Product) => {
    try {
      // Fetch the full product to ensure all fields are included
      const res = await fetch(`/api/products/${product._id}?tenant=${tenant}`);
      const data = await res.json();
      if (data.success) {
        setEditingProduct(data.data);
        setIsModalOpen(true);
      } else {
        // Fallback to the product from list if fetch fails
        setEditingProduct(product);
        setIsModalOpen(true);
      }
    } catch (error) {
      console.error('Error fetching product:', error);
      // Fallback to the product from list if fetch fails
      setEditingProduct(product);
      setIsModalOpen(true);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    fetchProducts();
  };

  const handleRefill = (product: Product) => {
    setRefillingProduct(product);
    setIsRefillModalOpen(true);
  };

  const handleCloseRefillModal = () => {
    setIsRefillModalOpen(false);
    setRefillingProduct(null);
  };

  const handleRefillSuccess = () => {
    fetchProducts();
  };

  if (!dict) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageTitle />
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">{dict.products.title}</h1>
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:w-auto bg-blue-600 text-white px-5 py-2.5 hover:bg-blue-700 font-semibold transition-all duration-200 border border-blue-700 flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {dict.products.addProduct}
          </button>
        </div>

        <div className="mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder={dict.products.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-3 pl-11 text-base border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all"
            />
            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          {/* Display Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setDisplayMode('grid')}
              className={`px-4 py-3 bg-white border-2 transition-all duration-200 flex items-center justify-center gap-2 text-sm font-medium ${
                displayMode === 'grid'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-blue-500'
              }`}
              title="Grid View"
              aria-label="Grid View"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span className="hidden sm:inline">Grid</span>
            </button>
            <button
              onClick={() => setDisplayMode('list')}
              className={`px-4 py-3 bg-white border-2 transition-all duration-200 flex items-center justify-center gap-2 text-sm font-medium ${
                displayMode === 'list'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-blue-500'
              }`}
              title="List View"
              aria-label="List View"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span className="hidden sm:inline">List</span>
            </button>
          </div>
        </div>

        {loading ? (
          displayMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-white border border-gray-300 rounded-lg p-4 sm:p-5 animate-pulse">
                  <div className="h-6 bg-gray-200 w-3/4 mb-3"></div>
                  <div className="h-4 bg-gray-200 w-full mb-2"></div>
                  <div className="h-4 bg-gray-200 w-2/3 mb-4"></div>
                  <div className="border-t border-gray-200 pt-4 mt-auto">
                    <div className="flex justify-between mb-4">
                      <div className="h-5 bg-gray-200 w-20"></div>
                      <div className="h-6 bg-gray-200 w-16"></div>
                    </div>
                    <div className="flex gap-2">
                      <div className="h-10 bg-gray-200 flex-1"></div>
                      <div className="h-10 bg-gray-200 flex-1"></div>
                      <div className="h-10 bg-gray-200 flex-1"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-gray-300 divide-y divide-gray-300">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="p-4 sm:p-6 animate-pulse">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex-1">
                      <div className="h-6 bg-gray-200 w-1/3 mb-2"></div>
                      <div className="h-4 bg-gray-200 w-1/2 mb-2"></div>
                      <div className="flex gap-4">
                        <div className="h-4 bg-gray-200 w-20"></div>
                        <div className="h-4 bg-gray-200 w-24"></div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="h-5 bg-gray-200 w-20"></div>
                      <div className="h-6 bg-gray-200 w-16"></div>
                      <div className="flex gap-2">
                        <div className="h-9 bg-gray-200 w-9"></div>
                        <div className="h-9 bg-gray-200 w-9"></div>
                        <div className="h-9 bg-gray-200 w-9"></div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : products.length === 0 ? (
          <div className="text-center py-16 bg-white border border-gray-300">
            <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-gray-500 text-lg">{dict.common.noResults}</p>
          </div>
        ) : displayMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {sortedProducts.map((product) => (
              <div
                key={product._id}
                className="group relative bg-white border border-gray-300 rounded-lg p-4 sm:p-5 hover:shadow-lg hover:border-blue-300 transition-all duration-200 flex flex-col"
              >
                {/* Header Section */}
                <div className="flex-1 mb-4">
                  {/* Name and Pinned Indicator */}
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 text-lg sm:text-xl pr-2 flex-1">
                      {product.name}
                      {product.pinned && (
                        <svg className="inline-block w-4 h-4 ml-2 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16a1 1 0 11-2 0V6.477L5.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 013 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" />
                        </svg>
                      )}
                    </h3>
                  </div>

                  {/* Description */}
                  {product.description && (
                    <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                      {product.description}
                    </p>
                  )}

                  {/* Metadata Row */}
                  <div className="flex flex-wrap gap-3 mb-3 text-xs sm:text-sm text-gray-600">
                    {product.sku && (
                      <div className="flex items-center gap-1">
                        <span className="font-medium">{dict.products.sku}:</span>
                        <span>{product.sku}</span>
                      </div>
                    )}
                    {product.category && (
                      <div className="flex items-center gap-1">
                        <span className="font-medium">{dict.products.category}:</span>
                        <span className="px-2 py-0.5 bg-gray-100 rounded border border-gray-300">
                          {product.category}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Section */}
                <div className="border-t border-gray-200 pt-4 mt-auto">
                  <div className="flex items-center justify-between mb-4">
                    {/* Price */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1">{dict.products.price}</div>
                      <div className="font-bold text-blue-600 text-xl sm:text-2xl">
                        <Currency amount={product.price} />
                      </div>
                    </div>

                    {/* Stock */}
                    <div className="text-right">
                      <div className="text-xs text-gray-500 mb-1">{dict.products.stock}</div>
                      <span
                        className={`inline-block text-xs font-semibold px-3 py-1.5 rounded border ${
                          product.stock > 10
                            ? 'bg-green-100 text-green-800 border-green-300'
                            : product.stock > 0
                            ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                            : 'bg-red-100 text-red-800 border-red-300'
                        }`}
                      >
                        {product.stock} {dict.products.inStock}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 actions-touch-visible transition-opacity duration-200">
                      <button
                        onClick={() => handleRefill(product)}
                        className="flex-1 px-4 py-2.5 bg-green-600 text-white hover:bg-green-700 active:bg-green-800 transition-all duration-200 border border-green-700 flex items-center justify-center gap-2 touch-manipulation min-h-[44px] text-sm font-medium"
                        title={dict.products.refill?.title || 'Refill Stock'}
                        aria-label={dict.products.refill?.title || 'Refill Stock'}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="hidden sm:inline">{dict.products.refill?.title || 'Refill'}</span>
                      </button>
                      <button
                        onClick={() => handleEdit(product)}
                        className="flex-1 px-4 py-2.5 bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 transition-all duration-200 border border-blue-700 flex items-center justify-center gap-2 touch-manipulation min-h-[44px] text-sm font-medium"
                        title={dict.common.edit}
                        aria-label={dict.common.edit}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span className="hidden sm:inline">{dict.common.edit}</span>
                      </button>
                      <button
                        onClick={() => handleDelete(product._id)}
                        className="flex-1 px-4 py-2.5 bg-red-600 text-white hover:bg-red-700 active:bg-red-800 transition-all duration-200 border border-red-700 flex items-center justify-center gap-2 touch-manipulation min-h-[44px] text-sm font-medium"
                        title={dict.common.delete}
                        aria-label={dict.common.delete}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span className="hidden sm:inline">{dict.common.delete}</span>
                      </button>
                    </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-gray-300 divide-y divide-gray-300">
            {sortedProducts.map((product) => (
              <div
                key={product._id}
                className="group relative px-4 sm:px-6 py-4 sm:py-5 hover:bg-gray-50 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  {/* Left Section */}
                  <div className="flex-1 min-w-0">
                    {/* Name and Pinned */}
                    <div className="flex items-start gap-2 mb-2">
                      <h3 className="font-semibold text-gray-900 text-base sm:text-lg flex-1">
                        {product.name}
                        {product.pinned && (
                          <svg className="inline-block w-4 h-4 ml-2 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16a1 1 0 11-2 0V6.477L5.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 013 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" />
                          </svg>
                        )}
                      </h3>
                    </div>

                    {/* Description */}
                    {product.description && (
                      <p className="text-sm text-gray-500 mb-2 line-clamp-1">
                        {product.description}
                      </p>
                    )}

                    {/* Metadata */}
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs sm:text-sm text-gray-600">
                      {product.sku && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{dict.products.sku}:</span>
                          <span>{product.sku}</span>
                        </div>
                      )}
                      {product.category && (
                        <div className="flex items-center gap-1">
                          <span className="flex items-center gap-1">
                            <span className="font-medium">{dict.products.category}:</span>
                            <span className="px-2 py-0.5 bg-gray-100 rounded border border-gray-300">
                              {product.category}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Section */}
                  <div className="flex items-center gap-4 sm:gap-6">
                    {/* Price */}
                    <div className="text-right">
                      <div className="text-xs text-gray-500 mb-1 hidden sm:block">{dict.products.price}</div>
                      <div className="font-bold text-blue-600 text-lg sm:text-xl">
                        <Currency amount={product.price} />
                      </div>
                    </div>

                    {/* Stock */}
                    <div className="text-right">
                      <div className="text-xs text-gray-500 mb-1 hidden sm:block">{dict.products.stock}</div>
                      <span
                        className={`inline-block text-xs font-semibold px-3 py-1.5 rounded border ${
                          product.stock > 10
                            ? 'bg-green-100 text-green-800 border-green-300'
                            : product.stock > 0
                            ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                            : 'bg-red-100 text-red-800 border-red-300'
                        }`}
                      >
                        {product.stock} {dict.products.inStock}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 actions-touch-visible transition-opacity duration-200">
                        <button
                          onClick={() => handleRefill(product)}
                          className="px-3 py-2 bg-green-600 text-white hover:bg-green-700 active:bg-green-800 transition-all duration-200 border border-green-700 flex items-center justify-center touch-manipulation min-h-[44px] sm:min-h-0"
                          title={dict.products.refill?.title || 'Refill Stock'}
                          aria-label={dict.products.refill?.title || 'Refill Stock'}
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleEdit(product)}
                          className="px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 transition-all duration-200 border border-blue-700 flex items-center justify-center touch-manipulation min-h-[44px] sm:min-h-0"
                          title={dict.common.edit}
                          aria-label={dict.common.edit}
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(product._id)}
                          className="px-3 py-2 bg-red-600 text-white hover:bg-red-700 active:bg-red-800 transition-all duration-200 border border-red-700 flex items-center justify-center touch-manipulation min-h-[44px] sm:min-h-0"
                          title={dict.common.delete}
                          aria-label={dict.common.delete}
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {isModalOpen && (
          <ProductModal
            product={editingProduct}
            onClose={handleCloseModal}
            lang={lang}
          />
        )}

        {isRefillModalOpen && (
          <StockRefillModal
            product={refillingProduct}
            onClose={handleCloseRefillModal}
            onSuccess={handleRefillSuccess}
            lang={lang}
          />
        )}
      </div>
    </div>
  );
}

