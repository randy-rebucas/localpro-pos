'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { getDictionaryClient } from '../../dictionaries-client';
import { useCategoriesList, type Category } from '@/hooks/useCategoriesList';
import { useCategoryForm } from '@/hooks/useCategoryForm';
import {
  getStatusBadgeClasses,
  getStatusLabel,
  getActionButtonColor,
  getActionButtonLabel,
  getDeleteConfirmMessage,
  getDeleteSuccessMessage,
  getStatusChangeMessage,
} from '@/lib/categories-helpers';

export default function CategoriesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const { categories, loading, fetchCategories, deleteCategory, toggleCategoryStatus } = useCategoriesList();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchCategories((error) => toast.error(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteCategory = async (categoryId: string) => {
    if (!dict) return;
    if (!window.confirm(getDeleteConfirmMessage(dict))) return;

    await deleteCategory(
      categoryId,
      () => {
        toast.success(getDeleteSuccessMessage(dict));
      },
      (error) => toast.error(error)
    );
  };

  const handleToggleCategoryStatus = async (category: Category) => {
    if (!dict) return;

    const newStatus = !category.isActive;
    await toggleCategoryStatus(
      category._id,
      newStatus,
      () => {
        toast.success(getStatusChangeMessage(!category.isActive, dict));
      },
      (error) => toast.error(error)
    );
  };

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="inline-flex items-center text-brand hover:text-brand-hover font-medium mb-4 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {dict?.admin?.backToAdmin || 'Back to Admin'}
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {dict.admin?.categories || 'Categories'}
              </h1>
              <p className="text-gray-600">{dict.admin?.categoriesSubtitle || 'Manage product categories'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-300 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">{dict.admin?.categories || 'Categories'}</h2>
            <button
              onClick={() => {
                setEditingCategory(null);
                setShowCategoryModal(true);
              }}
              className="px-4 py-2 bg-brand text-white hover:bg-brand-hover font-medium border border-brand-hover"
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
                      <span className={`px-2 py-1 text-xs font-semibold border ${getStatusBadgeClasses(category.isActive)}`}>
                        {getStatusLabel(category.isActive, dict)}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingCategory(category);
                            setShowCategoryModal(true);
                          }}
                          className="text-brand hover:text-brand-navy-deep"
                        >
                          {dict.common?.edit || 'Edit'}
                        </button>
                        <button
                          onClick={() => handleToggleCategoryStatus(category)}
                          className={`${getActionButtonColor(category.isActive)}`}
                        >
                          {getActionButtonLabel(category.isActive, dict)}
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
              fetchCategories((error) => toast.error(error));
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
  dict: Record<string, Record<string, string>> | null;
}) {
  const { formData, setFormData, error, submitting, handleSubmit: submitForm } = useCategoryForm(category);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await submitForm(
      () => {
        onSave();
      },
      (error) => {
        toast.error(error);
      }
    );
  };

  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-md w-full">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {category
              ? (dict?.admin?.editCategory || 'Edit Category')
              : (dict?.admin?.addCategory || 'Add Category')}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict?.admin?.name || 'Name'} *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict?.admin?.description || 'Description'} ({dict?.common?.optional || 'optional'})
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
              />
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
                {(dict?.common?.cancel) || 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-brand text-white hover:bg-brand-hover disabled:opacity-50 border border-brand-hover"
              >
                {submitting ? (dict?.common?.saving || 'Saving...') : (dict?.common?.save || 'Save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

