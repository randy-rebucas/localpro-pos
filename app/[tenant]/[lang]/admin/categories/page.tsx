'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { useCategoriesList, type Category } from '@/hooks/useCategoriesList';
import { useCategoryForm } from '@/hooks/useCategoryForm';
import { usePermissions } from '@/hooks/usePermissions';
import { showToast } from '@/lib/toast';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import {
  getStatusBadgeClasses,
  getStatusLabel,
  getActionButtonColor,
  getActionButtonLabel,
  getStatusChangeMessage,
} from '@/lib/categories-helpers';

const SPINNER_SM = (
  <span className="win8-spinner win8-spinner-sm"><span /><span /><span /><span /><span /></span>
);

export default function CategoriesPage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [search, setSearch] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { canAccess } = usePermissions();
  const canManage = canAccess('categories.manage');

  const { categories, loading, error, fetchCategories, toggleCategoryStatus } = useCategoriesList();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q)
    );
  }, [categories, search]);

  const openForm = (category: Category | null) => {
    setEditingCategory(category);
    setFormKey((k) => k + 1);
    setShowForm(true);
  };

  const handleToggleCategoryStatus = async (category: Category) => {
    if (!dict) return;

    if (category.isActive) {
      const template: string = dict.admin?.confirmDeactivateCategory || 'Deactivate category "{name}"?';
      if (!confirm(template.replace('{name}', category.name))) return;
    }

    setTogglingId(category.id);
    await toggleCategoryStatus(
      category.id,
      !category.isActive,
      () => showToast.success(getStatusChangeMessage(!category.isActive, dict)),
      (err) => showToast.error(err)
    );
    setTogglingId(null);
  };

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  const renderBody = () => {
    if (loading) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingCategories || 'Loading categories…'}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{error}</p>
          <button
            onClick={() => fetchCategories()}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (filtered.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {search.trim()
            ? (dict.admin?.noCategoriesMatch || 'No categories match your search.')
            : (dict.admin?.noCategoriesYet || 'No categories yet.')}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.name || 'Name'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.description || 'Description'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.status || 'Status'}</th>
              {canManage && (
                <th className="px-4 py-3 text-right font-medium">{dict.common?.actions || 'Actions'}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtered.map((category) => {
              const toggleLabel = getActionButtonLabel(category.isActive, dict);
              const busy = togglingId === category.id;
              return (
                <tr key={category.id} className="hover:bg-gray-100 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{category.name}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-[320px] truncate" title={category.description || undefined}>
                    {category.description || '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClasses(category.isActive)}`}>
                      {getStatusLabel(category.isActive, dict)}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => openForm(category)}
                          title={dict.common?.edit || 'Edit'}
                          aria-label={`${dict.common?.edit || 'Edit'} ${category.name}`}
                          className="inline-flex items-center justify-center p-2.5 text-white bg-brand hover:brightness-110 transition-[filter]"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleToggleCategoryStatus(category)}
                          disabled={busy}
                          title={toggleLabel}
                          aria-label={`${toggleLabel} ${category.name}`}
                          className={`inline-flex items-center justify-center p-2.5 text-white ${getActionButtonColor(category.isActive)} hover:brightness-110 disabled:opacity-50 transition-[filter]`}
                        >
                          {busy ? SPINNER_SM : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d={category.isActive ? 'M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10' : 'm5 12 5 5L20 7'}
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={dict.admin?.categories || 'Categories'}
          description={dict.admin?.categoriesSubtitle || 'Manage product categories'}
        />

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap bg-white border border-gray-300 p-3">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={dict.admin?.searchCategoryPlaceholder || 'Search category…'}
                aria-label={dict.admin?.searchCategoryPlaceholder || 'Search category…'}
                className="pl-8 pr-3 py-2 border border-gray-300 text-sm w-56"
              />
            </div>
            {canManage && (
              <button
                onClick={() => openForm(null)}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
              >
                + {dict.admin?.addCategory || 'Add Category'}
              </button>
            )}
          </div>

          {renderBody()}
        </div>
      </div>

      <Win8Drawer open={showForm} onClose={() => setShowForm(false)}>
        <CategoryForm
          key={formKey}
          category={editingCategory}
          dict={dict}
          onClose={() => setShowForm(false)}
          onSave={() => {
            showToast.success(
              editingCategory
                ? (dict.admin?.categoryUpdated || 'Category updated')
                : (dict.admin?.categoryCreated || 'Category created')
            );
            setShowForm(false);
            fetchCategories((err) => showToast.error(err));
          }}
        />
      </Win8Drawer>
    </>
  );
}

function CategoryForm({
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
    // Save errors are shown inline in the drawer via `error`.
    await submitForm(() => onSave());
  };

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
        <h2 className="text-base font-semibold">
          {category
            ? (dict?.admin?.editCategory || 'Edit Category')
            : (dict?.admin?.addCategory || 'Add Category')}
        </h2>
        <button
          type="button"
          onClick={onClose}
          title={dict?.common?.close || 'Close'}
          aria-label={dict?.common?.close || 'Close'}
          className="text-white/70 hover:text-white"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div>
            <label htmlFor="category-name" className="block text-xs font-medium text-gray-600 mb-1">
              {dict?.admin?.name || 'Name'} <span className="text-win8-danger">*</span>
            </label>
            <input
              id="category-name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="category-description" className="block text-xs font-medium text-gray-600 mb-1">
              {dict?.admin?.description || 'Description'} ({dict?.common?.optional || 'optional'})
            </label>
            <textarea
              id="category-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full border border-gray-300 px-3 py-2 text-sm resize-none"
            />
          </div>
          {error && <div className="bg-win8-danger text-white text-sm p-3">{error}</div>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100"
          >
            {dict?.common?.cancel || 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {submitting ? (dict?.common?.saving || 'Saving…') : (dict?.common?.save || 'Save')}
          </button>
        </div>
      </form>
    </>
  );
}
