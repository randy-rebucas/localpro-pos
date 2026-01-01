'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import Currency from '@/components/Currency';
import PageTitle from '@/components/PageTitle';
import ProductModal from '@/components/ProductModal';
import StockRefillModal from '@/components/StockRefillModal';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';
import { useDeviceType } from '@/hooks/useDeviceType';

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
  const deviceType = useDeviceType();
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    name: true,
    sku: true,
    category: true,
    price: true,
    stock: true,
    actions: true,
  });

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // Load column visibility preferences from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`columnVisibility_${tenant}`);
    if (saved) {
      try {
        setVisibleColumns(JSON.parse(saved));
      } catch (error) {
        console.error('Error loading column preferences:', error);
      }
    }
  }, [tenant]);

  // Save column visibility preferences to localStorage
  useEffect(() => {
    localStorage.setItem(`columnVisibility_${tenant}`, JSON.stringify(visibleColumns));
  }, [visibleColumns, tenant]);

  const toggleColumn = (column: keyof typeof visibleColumns) => {
    setVisibleColumns(prev => ({
      ...prev,
      [column]: !prev[column],
    }));
  };

  // Get column span class helper
  const getColSpanClass = (span: number) => {
    const spanMap: Record<number, string> = {
      1: 'col-span-1',
      2: 'col-span-2',
      3: 'col-span-3',
      4: 'col-span-4',
      5: 'col-span-5',
      6: 'col-span-6',
    };
    return spanMap[span] || 'col-span-2';
  };

  // Calculate column spans based on visible columns
  const getColumnSpans = () => {
    const spans: Record<string, number> = {
      name: 3,
      sku: 2,
      category: 2,
      price: 2,
      stock: 1,
      actions: 2,
    };
    
    // Return original spans for visible columns
    const visibleSpans: Record<string, number> = {};
    Object.entries(spans).forEach(([key, originalSpan]) => {
      if (visibleColumns[key as keyof typeof visibleColumns]) {
        visibleSpans[key] = originalSpan;
      }
    });
    
    return visibleSpans;
  };

  const columnSpans = getColumnSpans();

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
            className="w-full sm:w-auto bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 font-semibold transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
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
              className="w-full px-4 py-3 pl-11 text-base border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-all"
            />
            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          {/* Column Toggle Menu - Device Responsive */}
          <div className="relative">
            <button
              onClick={() => setShowColumnMenu(!showColumnMenu)}
              className={`w-full sm:w-auto px-4 py-3 bg-white border-2 border-gray-200 rounded-xl hover:bg-gray-50 hover:border-blue-300 transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-center gap-2 text-sm font-medium text-gray-700 ${
                showColumnMenu ? 'border-blue-500 bg-blue-50' : ''
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span className="hidden sm:inline">{dict?.common?.columns || 'Columns'}</span>
              <svg className={`w-4 h-4 transition-transform duration-200 ${showColumnMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showColumnMenu && (
              <>
                <div 
                  className="fixed inset-0 z-10 bg-gray-900/20 backdrop-blur-sm" 
                  onClick={() => setShowColumnMenu(false)}
                ></div>
                <div className={`absolute ${
                  deviceType.isMobile ? 'left-0 right-0' : 'right-0'
                } mt-2 w-64 sm:w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-20 py-2 max-h-96 overflow-y-auto`}>
                  <div className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 bg-gray-50 sticky top-0">
                    {dict?.common?.toggleColumns || 'Toggle Columns'}
                  </div>
                  <div className="py-1">
                    {Object.entries(visibleColumns).map(([key, visible]) => (
                      <label
                        key={key}
                        className="flex items-center px-4 py-3 hover:bg-blue-50 cursor-pointer transition-colors group"
                      >
                        <div className="relative flex items-center">
                          <input
                            type="checkbox"
                            checked={visible}
                            onChange={() => toggleColumn(key as keyof typeof visibleColumns)}
                            className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer transition-all"
                          />
                          <span className="ml-3 text-sm font-medium text-gray-700 group-hover:text-blue-700 transition-colors">
                            {key === 'name' ? dict.products.name :
                             key === 'sku' ? dict.products.sku :
                             key === 'category' ? dict.products.category :
                             key === 'price' ? dict.products.price :
                             key === 'stock' ? dict.products.stock :
                             key === 'actions' ? dict.common.actions : key}
                          </span>
                        </div>
                        {visible && (
                          <svg className="ml-auto w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="divide-y divide-gray-200">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="p-4 sm:p-6 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="h-5 bg-gray-200 rounded-lg w-1/3 mb-2"></div>
                      <div className="h-4 bg-gray-200 rounded-lg w-1/4"></div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="h-4 bg-gray-200 rounded-lg w-20"></div>
                      <div className="h-4 bg-gray-200 rounded-lg w-16"></div>
                      <div className="h-9 bg-gray-200 rounded-lg w-24"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl shadow-md">
            <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-gray-500 text-lg">{dict.common.noResults}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            {/* Desktop Table Header */}
            <div className="hidden md:grid md:grid-cols-12 gap-4 px-6 py-4 bg-gray-50 border-b border-gray-200 text-sm font-semibold text-gray-700">
              {visibleColumns.name && (
                <div className={getColSpanClass(columnSpans.name)}>{dict.products.name}</div>
              )}
              {visibleColumns.sku && (
                <div className={getColSpanClass(columnSpans.sku)}>{dict.products.sku}</div>
              )}
              {visibleColumns.category && (
                <div className={getColSpanClass(columnSpans.category)}>{dict.products.category}</div>
              )}
              {visibleColumns.price && (
                <div className={`${getColSpanClass(columnSpans.price)} text-right`}>{dict.products.price}</div>
              )}
              {visibleColumns.stock && (
                <div className={`${getColSpanClass(columnSpans.stock)} text-right`}>{dict.products.stock}</div>
              )}
              {visibleColumns.actions && (
                <div className={`${getColSpanClass(columnSpans.actions)} text-right`}>{dict.common.actions}</div>
              )}
            </div>
            {/* Product List */}
            <div className="divide-y divide-gray-200">
              {sortedProducts.map((product) => (
                <div
                  key={product._id}
                  className="px-4 sm:px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex flex-col md:grid md:grid-cols-12 gap-4 items-center">
                    {/* Name - Mobile & Desktop */}
                    {visibleColumns.name && (
                      <div className={`${getColSpanClass(columnSpans.name)} w-full md:w-auto`}>
                        <div className="font-semibold text-gray-900 text-base mb-1">
                          {product.name}
                        </div>
                        {product.description && (
                          <div className="text-sm text-gray-500 mt-1 line-clamp-1">
                            {product.description}
                          </div>
                        )}
                        {(visibleColumns.sku || visibleColumns.category) && (
                          <div className="text-xs text-gray-500 md:hidden mt-1 flex flex-wrap gap-x-2 gap-y-1">
                            {visibleColumns.sku && (
                              <span>{dict.products.sku}: {product.sku || '-'}</span>
                            )}
                            {visibleColumns.category && (
                              <span>{dict.products.category}: {product.category || '-'}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {/* SKU - Desktop Only */}
                    {visibleColumns.sku && (
                      <div className={`hidden md:block ${getColSpanClass(columnSpans.sku)} text-sm text-gray-600`}>
                        {product.sku || '-'}
                      </div>
                    )}
                    {/* Category - Desktop Only */}
                    {visibleColumns.category && (
                      <div className={`hidden md:block ${getColSpanClass(columnSpans.category)} text-sm text-gray-600`}>
                        {product.category || '-'}
                      </div>
                    )}
                    {/* Price */}
                    {visibleColumns.price && (
                      <div className={`${getColSpanClass(columnSpans.price)} w-full md:w-auto text-left md:text-right`}>
                        <div className="text-sm text-gray-500 md:hidden mb-1">{dict.products.price}</div>
                        <div className="font-bold text-blue-600 text-lg">
                          <Currency amount={product.price} />
                        </div>
                      </div>
                    )}
                    {/* Stock */}
                    {visibleColumns.stock && (
                      <div className={`${getColSpanClass(columnSpans.stock)} w-full md:w-auto text-left md:text-right`}>
                        <div className="text-sm text-gray-500 md:hidden mb-1">{dict.products.stock}</div>
                        <span
                          className={`inline-block text-xs font-semibold px-3 py-1.5 rounded-full ${
                            product.stock > 10
                              ? 'bg-green-100 text-green-800'
                              : product.stock > 0
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {product.stock} {dict.products.inStock}
                        </span>
                      </div>
                    )}
                    {/* Actions column */}
                    {visibleColumns.actions && (
                      <div className={`${getColSpanClass(columnSpans.actions)} w-full md:w-auto`}>
                        <div className="text-sm text-gray-500 md:hidden mb-2">{dict.common.actions}</div>
                        <div className="flex gap-2 md:justify-end items-center">
                          <button
                            onClick={() => handleRefill(product)}
                            className="p-2.5 bg-green-50 hover:bg-green-100 active:bg-green-200 text-green-700 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md border border-green-200 hover:border-green-300 flex items-center justify-center group"
                            title={dict.products.refill?.title || 'Refill Stock'}
                          >
                            <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleEdit(product)}
                            className="p-2.5 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-700 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md border border-blue-200 hover:border-blue-300 flex items-center justify-center group"
                            title={dict.common.edit}
                          >
                            <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(product._id)}
                            className="p-2.5 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-700 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md border border-red-200 hover:border-red-300 flex items-center justify-center group"
                            title={dict.common.delete}
                          >
                            <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
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

