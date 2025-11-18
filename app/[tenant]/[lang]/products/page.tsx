'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import ProductModal from '@/components/ProductModal';
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
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
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

  if (!dict) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 animate-fade-in">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">{dict.products.title}</h1>
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:w-auto bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 font-semibold transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
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
          <div className="text-center py-12">{dict.common.loading}</div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-gray-500">{dict.common.noResults}</div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
              {products.map((product) => (
                <div key={product._id} className="bg-white rounded-xl shadow-md p-5 card-hover animate-fade-in">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">{product.name}</h3>
                      {product.description && (
                        <p className="text-sm text-gray-500 mt-1">{product.description}</p>
                      )}
                    </div>
                    <span
                      className={`text-sm font-medium px-2 py-1 rounded ${
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
                  <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                    <div>
                      <span className="text-gray-500">{dict.products.price}:</span>
                      <span className="ml-2 font-semibold text-gray-900">
                        ${product.price.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">{dict.products.sku}:</span>
                      <span className="ml-2 text-gray-900">{product.sku || '-'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-500">{dict.products.category}:</span>
                      <span className="ml-2 text-gray-900">{product.category || '-'}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => handleEdit(product)}
                      className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition-all duration-200 shadow-sm hover:shadow"
                    >
                      {dict.common.edit}
                    </button>
                    <button
                      onClick={() => handleDelete(product._id)}
                      className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 font-medium transition-all duration-200 shadow-sm hover:shadow"
                    >
                      {dict.common.delete}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {dict.products.name}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {dict.products.sku}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {dict.products.price}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {dict.products.stock}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {dict.products.category}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {dict.common.actions}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {products.map((product) => (
                    <tr key={product._id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{product.name}</div>
                        {product.description && (
                          <div className="text-sm text-gray-500">{product.description}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {product.sku || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${product.price.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`text-sm font-medium ${
                            product.stock > 10
                              ? 'text-green-600'
                              : product.stock > 0
                              ? 'text-yellow-600'
                              : 'text-red-600'
                          }`}
                        >
                          {product.stock}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {product.category || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleEdit(product)}
                          className="text-blue-600 hover:text-blue-900 mr-4"
                        >
                          {dict.common.edit}
                        </button>
                        <button
                          onClick={() => handleDelete(product._id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          {dict.common.delete}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {isModalOpen && (
          <ProductModal
            product={editingProduct}
            onClose={handleCloseModal}
            lang={lang}
          />
        )}
      </div>
    </div>
  );
}

