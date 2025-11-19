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

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchProducts();
  }, [search, tenant]);

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

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setIsModalOpen(true);
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

        <div className="mb-6">
          <div className="relative max-w-md">
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
              <div className="col-span-3">{dict.products.name}</div>
              <div className="col-span-2">{dict.products.sku}</div>
              <div className="col-span-2">{dict.products.category}</div>
              <div className="col-span-2 text-right">{dict.products.price}</div>
              <div className="col-span-2 text-right">{dict.products.stock}</div>
              <div className="col-span-1 text-right">{dict.common.actions}</div>
            </div>
            {/* Product List */}
            <div className="divide-y divide-gray-200">
              {products.map((product) => (
                <div
                  key={product._id}
                  className="group relative px-4 sm:px-6 py-4 hover:bg-gray-50 transition-colors overflow-hidden"
                >
                  {/* Actions - Positioned on top */}
                  <div className="absolute top-0 right-0 bottom-0 w-48 md:w-auto flex items-center justify-end pr-4 md:pr-6 z-10 overflow-hidden">
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-md shadow-lg border-l border-gray-200/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
                    <div className="relative z-10 flex gap-1.5 px-3 py-1.5 transform translate-x-full group-hover:translate-x-0 transition-transform duration-300 ease-out">
                      <button
                        onClick={() => handleRefill(product)}
                        className="px-2 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-center"
                        title={dict.products.refill?.title || 'Refill Stock'}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleEdit(product)}
                        className="px-2 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-center"
                        title={dict.common.edit}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(product._id)}
                        className="px-2 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-center"
                        title={dict.common.delete}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col md:grid md:grid-cols-12 gap-4 items-center">
                    {/* Name - Mobile & Desktop */}
                    <div className="col-span-3 w-full md:w-auto">
                      <div className="font-semibold text-gray-900 text-base mb-1">
                        {product.name}
                      </div>
                      {product.description && (
                        <div className="text-sm text-gray-500 mt-1 line-clamp-1">
                          {product.description}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 md:hidden mt-1">
                        {dict.products.sku}: {product.sku || '-'} | {dict.products.category}: {product.category || '-'}
                      </div>
                    </div>
                    {/* SKU - Desktop Only */}
                    <div className="hidden md:block col-span-2 text-sm text-gray-600">
                      {product.sku || '-'}
                    </div>
                    {/* Category - Desktop Only */}
                    <div className="hidden md:block col-span-2 text-sm text-gray-600">
                      {product.category || '-'}
                    </div>
                    {/* Price */}
                    <div className="col-span-2 w-full md:w-auto text-left md:text-right">
                      <div className="text-sm text-gray-500 md:hidden mb-1">{dict.products.price}</div>
                      <div className="font-bold text-blue-600 text-lg">
                        <Currency amount={product.price} />
                      </div>
                    </div>
                    {/* Stock */}
                    <div className="col-span-2 w-full md:w-auto text-left md:text-right">
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
                    {/* Actions column - Empty space for absolute positioned actions */}
                    <div className="col-span-1 hidden md:block"></div>
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

