'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';

interface Category {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
}

export default function CategoriesPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchCategories();
  }, [lang, tenant]);

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setCategories(data.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
      const res = await fetch(`/api/categories/${categoryId}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Category deleted successfully' });
        fetchCategories();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to delete category' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete category' });
    }
  };

  const handleToggleCategoryStatus = async (category: Category) => {
    try {
      const res = await fetch(`/api/categories/${category._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !category.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Category ${!category.isActive ? 'activated' : 'deactivated'} successfully` });
        fetchCategories();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update category' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update category' });
    }
  };

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
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
                {dict.admin?.categories || 'Categories'}
              </h1>
              <p className="text-gray-600">{dict.admin?.categoriesSubtitle || 'Manage product categories'}</p>
            </div>
            <button
              onClick={() => router.push(`/${tenant}/${lang}/admin`)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {dict.common?.back || 'Back'}
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">{dict.admin?.categories || 'Categories'}</h2>
            <button
              onClick={() => {
                setEditingCategory(null);
                setShowCategoryModal(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              {dict.common?.add || 'Add'} {dict.admin?.category || 'Category'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.name || 'Name'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.description || 'Description'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.status || 'Status'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.common?.actions || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {categories.map((category) => (
                  <tr key={category._id}>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{category.name}</td>
                    <td className="px-4 py-4 text-sm text-gray-500">{category.description || '-'}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${category.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {category.isActive ? (dict.admin?.active || 'Active') : (dict.admin?.inactive || 'Inactive')}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingCategory(category);
                            setShowCategoryModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          {dict.common?.edit || 'Edit'}
                        </button>
                        <button
                          onClick={() => handleToggleCategoryStatus(category)}
                          className={category.isActive ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'}
                        >
                          {category.isActive ? (dict.admin?.deactivate || 'Deactivate') : (dict.admin?.activate || 'Activate')}
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(category._id)}
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
            {categories.length === 0 && (
              <div className="text-center py-8 text-gray-500">{dict.common?.noResults || 'No categories found'}</div>
            )}
          </div>
        </div>

        {showCategoryModal && (
          <CategoryModal
            category={editingCategory}
            onClose={() => {
              setShowCategoryModal(false);
              setEditingCategory(null);
            }}
            onSave={() => {
              fetchCategories();
              setShowCategoryModal(false);
              setEditingCategory(null);
            }}
            dict={dict}
          />
        )}
      </div>
    </div>
  );
}

function CategoryModal({
  category,
  onClose,
  onSave,
  dict,
}: {
  category: Category | null;
  onClose: () => void;
  onSave: () => void;
  dict: any;
}) {
  const [formData, setFormData] = useState({
    name: category?.name || '',
    description: category?.description || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const url = category ? `/api/categories/${category._id}` : '/api/categories';
      const method = category ? 'PUT' : 'POST';
      const body = {
        name: formData.name,
        description: formData.description || undefined,
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
        setError(data.error || 'Failed to save category');
      }
    } catch (error) {
      setError('Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {category ? (dict.admin?.editCategory || 'Edit Category') : (dict.admin?.addCategory || 'Add Category')}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.name || 'Name'} *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.description || 'Description'} (optional)
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {error && (
              <div className="bg-red-50 text-red-800 border border-red-200 rounded-lg p-3">
                {error}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                {dict.common?.cancel || 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
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

