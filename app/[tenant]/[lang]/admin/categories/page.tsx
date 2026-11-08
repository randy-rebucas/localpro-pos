'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Pencil, Plus, Tags } from 'lucide-react';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { useCategoriesList, type Category } from '@/hooks/useCategoriesList';
import { useCategoryForm } from '@/hooks/useCategoryForm';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirm } from '@/lib/confirm';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  ICON, DARK_KEY_PRIMARY, LABEL, INPUT, KEY, KEY_PRIMARY, ROW_KEY,
  RegisterPage, LedReadout, Sheet, Strip,
} from '@/components/admin/register-ui';
import {
  getStatusLabel,
  getActionButtonLabel,
  getStatusChangeMessage,
} from '@/lib/categories-helpers';

export default function CategoriesPage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';
  const { settings } = useTenantSettings();
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { confirm, Dialog: ConfirmDialog } = useConfirm();
  const { canAccess } = usePermissions();
  const canManage = canAccess('categories.manage');

  const { categories, loading, fetchCategories, toggleCategoryStatus } = useCategoriesList();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchCategories((error) => toast.error(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleCategoryStatus = async (category: Category) => {
    if (!dict) return;

    const newStatus = !category.isActive;
    // Ask before switching a category off (bundles and products already ask)
    if (!newStatus) {
      const ok = await confirm(
        (dict.admin?.deactivateCategoryTitle || 'Deactivate {name}?').replace('{name}', category.name),
        dict.admin?.deactivateCategoryConfirm || 'You can turn it back on at any time. Its products are not changed.',
        { variant: 'warning', confirmText: dict.admin?.deactivate || 'Deactivate', cancelText: dict.common?.cancel || 'Cancel' }
      );
      if (!ok) return;
    }
    setTogglingId(category._id);
    try {
      await toggleCategoryStatus(
        category._id,
        newStatus,
        () => {
          toast.success(getStatusChangeMessage(!category.isActive, dict));
        },
        (error) => toast.error(error)
      );
    } finally {
      setTogglingId(null);
    }
  };

  // Show the spinner only for the first load, so refetches after a save or delete keep the page (and any open modal) mounted.
  const [loadedOnce, setLoadedOnce] = useState(false);
  if (!loading && !loadedOnce) setLoadedOnce(true);

  if (!dict || !loadedOnce) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const activeCount = categories.filter((category) => category.isActive).length;
  const openForm = (category: Category | null) => {
    setEditingCategory(category);
    setShowCategoryModal(true);
  };

  return (
    <RegisterPage
      tagNo="CT"
      tag={settings?.companyName}
      title={dict.admin?.categories || 'Categories'}
      subtitle={dict.admin?.categoriesSubtitle || 'Manage product categories'}
      side={<LedReadout value={activeCount} label={dict.admin?.activeCategories || 'Active categories'} />}
    >
      {canManage && (
        <div className="mt-6 flex">
          <button type="button" onClick={() => openForm(null)} className={`${DARK_KEY_PRIMARY} w-full sm:w-auto`}>
            <Plus className={ICON} strokeWidth={1.75} aria-hidden />
            {dict.admin?.addCategory || 'Add Category'}
          </button>
        </div>
      )}

      {/* The aisle signs, printed as a numbered list */}
      <section className="mt-6 max-w-4xl">
        <div className="bg-paper-white text-ink">
          <h2 className="border-b border-dashed border-ink/30 px-4 py-3 text-3xl sm:px-5">
            {dict.admin?.categories || 'Categories'}
          </h2>

          {categories.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <Tags className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
              <p className="font-receipt text-sm text-ink/60">{dict.common?.noResults || 'No categories found'}</p>
              {canManage && (
                <button type="button" onClick={() => openForm(null)} className={`${KEY} mx-auto mt-4`}>
                  <Plus className={ICON} strokeWidth={1.75} aria-hidden />
                  {dict.admin?.addCategory || 'Add Category'}
                </button>
              )}
            </div>
          ) : (
            <ol className="divide-y divide-dashed divide-ink/20">
              {categories.map((category, index) => (
                <li
                  key={category._id}
                  className={`grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 px-4 py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center sm:px-5 ${category.isActive ? '' : 'bg-ink/[0.03]'}`}
                >
                  <span className="pt-0.5 font-led text-2xl leading-none text-ink/40 sm:pt-0" aria-hidden>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <p className={`flex flex-wrap items-center gap-2 font-medium ${category.isActive ? '' : 'text-ink/60'}`}>
                      {category.name}
                      <span
                        className={`border px-1.5 py-0.5 font-receipt text-[11px] uppercase ${category.isActive ? 'border-ink/25 text-ink/70' : 'border-dashed border-ink/40 text-ink/60'}`}
                      >
                        {getStatusLabel(category.isActive, dict)}
                      </span>
                    </p>
                    {category.description && (
                      <p className="mt-0.5 text-sm text-ink/60">{category.description}</p>
                    )}
                  </div>
                  {canManage && (
                    <div className="col-start-2 mt-2 flex items-center gap-1 sm:col-start-3 sm:mt-0">
                      <button
                        type="button"
                        onClick={() => openForm(category)}
                        className={ROW_KEY}
                        title={dict.common?.edit || 'Edit'}
                        aria-label={`${dict.common?.edit || 'Edit'}: ${category.name}`}
                      >
                        <Pencil className={ICON} strokeWidth={1.75} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleCategoryStatus(category)}
                        disabled={togglingId === category._id}
                        className={`${KEY} w-36 ${category.isActive ? 'hover:border-stamp hover:bg-transparent hover:text-stamp' : 'border-ink bg-ink text-paper-white hover:bg-brand-navy'}`}
                        aria-label={`${getActionButtonLabel(category.isActive, dict)}: ${category.name}`}
                      >
                        {getActionButtonLabel(category.isActive, dict)}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
      </section>

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
      {ConfirmDialog}
    </RegisterPage>
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
    <Sheet
      title={category
        ? (dict?.admin?.editCategory || 'Edit Category')
        : (dict?.admin?.addCategory || 'Add Category')}
      onClose={onClose}
      closeLabel={dict?.common?.close || 'Close'}
      footer={
        <>
          <button type="button" onClick={onClose} className={KEY}>
            {dict?.common?.cancel || 'Cancel'}
          </button>
          <button type="submit" form="category-form" disabled={submitting} className={KEY_PRIMARY}>
            {submitting ? (dict?.common?.saving || 'Saving...') : (dict?.common?.save || 'Save')}
          </button>
        </>
      }
    >
      <form id="category-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="category-name" className={LABEL}>
            {dict?.admin?.name || 'Name'} *
          </label>
          <input
            id="category-name"
            type="text"
            required
            autoFocus
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="category-description" className={LABEL}>
            {dict?.admin?.description || 'Description'} ({dict?.common?.optional || 'optional'})
          </label>
          <textarea
            id="category-description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            className={INPUT}
          />
        </div>
        {error && <Strip tone="error">{error}</Strip>}
      </form>
    </Sheet>
  );
}
