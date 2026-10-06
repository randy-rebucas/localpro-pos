'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import { showToast } from '@/lib/toast';
import { useSupplierList, type Supplier, type SupplierFormData } from '@/hooks/useSupplierList';
import { usePermissions } from '@/hooks/usePermissions';

const ICON_BUTTON = 'inline-flex items-center justify-center p-2.5 text-white hover:brightness-110 disabled:opacity-50 transition-[filter]';
const INPUT = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';

export default function SuppliersPage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { canAccess } = usePermissions();
  const canCreate = canAccess('suppliers.create');
  const canEdit = canAccess('suppliers.edit');
  const canDelete = canAccess('suppliers.delete');
  const showRowActions = canEdit || canDelete;

  const {
    suppliers,
    loading,
    error,
    message,
    fetchSuppliers,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    setMessage,
  } = useSupplierList();

  // The hook's own messages are English; only surface its errors (e.g. delete failures).
  useEffect(() => {
    if (!message) return;
    if (message.type === 'error') showToast.error(message.text);
    setMessage(null);
  }, [message, setMessage]);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  const openForm = (supplier: Supplier | null) => {
    setEditingSupplier(supplier);
    setFormKey((k) => k + 1);
    setShowForm(true);
  };

  const handleDelete = async (supplier: Supplier) => {
    const msg = (dict.admin?.supplierDeleteConfirm || 'Delete supplier "{name}"? This cannot be undone.').replace('{name}', supplier.name);
    if (!confirm(msg)) return;
    setDeletingId(supplier._id);
    const success = await deleteSupplier(supplier._id);
    setDeletingId(null);
    if (success) {
      showToast.success(dict.admin?.supplierDeleted || 'Supplier deleted');
      await fetchSuppliers();
    }
  };

  const term = search.trim().toLowerCase();
  const visible = term
    ? suppliers.filter((s) =>
        [s.name, s.contactName, s.email, s.phone].some((v) => v?.toLowerCase().includes(term))
      )
    : suppliers;

  const renderBody = () => {
    if (loading && suppliers.length === 0) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingSuppliers || 'Loading suppliers…'}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{error}</p>
          <button
            type="button"
            onClick={() => fetchSuppliers()}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (visible.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {term
            ? (dict.admin?.noSuppliersMatch || 'No suppliers match your search.')
            : (dict.admin?.noSuppliersYet || 'No suppliers yet.')}
        </div>
      );
    }

    const editLabel = dict.common?.edit || 'Edit';
    const deleteLabel = dict.common?.delete || 'Delete';

    return (
      <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.name || 'Name'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.contact || 'Contact'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.phone || 'Phone'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.email || 'Email'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.status || 'Status'}</th>
              {showRowActions && <th className="px-4 py-3 text-right font-medium">{dict.common?.actions || 'Actions'}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {visible.map((supplier) => {
              const deleting = deletingId === supplier._id;
              return (
                <tr key={supplier._id} className="hover:bg-gray-100 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{supplier.name}</td>
                  <td className="px-4 py-3 text-gray-700">{supplier.contactName || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700">{supplier.phone || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{supplier.email || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 text-xs font-semibold text-white ${supplier.isActive ? 'bg-win8-success' : 'bg-gray-500'}`}>
                      {supplier.isActive ? (dict.admin?.active || 'Active') : (dict.admin?.inactive || 'Inactive')}
                    </span>
                  </td>
                  {showRowActions && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => openForm(supplier)}
                            title={editLabel}
                            aria-label={`${editLabel}: ${supplier.name}`}
                            className={`${ICON_BUTTON} bg-brand`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
                            </svg>
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(supplier)}
                            disabled={deleting}
                            title={deleteLabel}
                            aria-label={`${deleteLabel}: ${supplier.name}`}
                            className={`${ICON_BUTTON} bg-win8-danger`}
                          >
                            {deleting ? (
                              <span className="win8-spinner win8-spinner-sm"><span /><span /><span /><span /><span /></span>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12.1a2 2 0 0 1-2 1.9H9.7a2 2 0 0 1-2-1.9L7 7h10Z" />
                              </svg>
                            )}
                          </button>
                        )}
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
          title={dict.admin?.suppliers || 'Suppliers'}
          description={dict.admin?.suppliersSubtitle || 'Manage the vendors you purchase inventory from'}
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
                placeholder={dict.admin?.searchSuppliers || 'Search suppliers…'}
                aria-label={dict.admin?.searchSuppliers || 'Search suppliers…'}
                className="pl-8 pr-3 py-2 border border-gray-300 text-sm w-56"
              />
            </div>
            {canCreate && (
              <button
                type="button"
                onClick={() => openForm(null)}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
              >
                + {dict.admin?.addSupplier || 'Add Supplier'}
              </button>
            )}
          </div>

          {renderBody()}
        </div>
      </div>

      <Win8Drawer open={showForm} onClose={() => setShowForm(false)}>
        <SupplierForm
          key={formKey}
          dict={dict}
          supplier={editingSupplier}
          onClose={() => setShowForm(false)}
          onSave={async () => {
            showToast.success(
              editingSupplier
                ? (dict.admin?.supplierUpdated || 'Supplier updated successfully')
                : (dict.admin?.supplierCreated || 'Supplier created successfully')
            );
            setShowForm(false);
            await fetchSuppliers();
          }}
          createSupplier={createSupplier}
          updateSupplier={updateSupplier}
        />
      </Win8Drawer>
    </>
  );
}

function SupplierForm({
  dict,
  supplier,
  onClose,
  onSave,
  createSupplier,
  updateSupplier,
}: {
  dict: TranslationDict;
  supplier: Supplier | null;
  onClose: () => void;
  onSave: () => Promise<void>;
  createSupplier: (form: SupplierFormData) => Promise<true | string>;
  updateSupplier: (id: string, form: Partial<SupplierFormData>) => Promise<true | string>;
}) {
  const [formData, setFormData] = useState<SupplierFormData>({
    name: supplier?.name || '',
    contactName: supplier?.contactName || '',
    phone: supplier?.phone || '',
    email: supplier?.email || '',
    address: supplier?.address || '',
    notes: supplier?.notes || '',
    isActive: supplier?.isActive ?? true,
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const result = supplier ? await updateSupplier(supplier._id, formData) : await createSupplier(formData);
    setSubmitting(false);
    if (result === true) {
      await onSave();
    } else {
      setError(result);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
        <h2 className="text-base font-semibold">
          {supplier ? (dict.admin?.editSupplier || 'Edit Supplier') : (dict.admin?.addSupplier || 'Add Supplier')}
        </h2>
        <button
          type="button"
          onClick={onClose}
          title={dict.common?.close || 'Close'}
          aria-label={dict.common?.close || 'Close'}
          className="text-white/70 hover:text-white"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div>
            <label htmlFor="supplier-name" className={LABEL}>{dict.admin?.name || 'Name'} <span className="text-win8-danger">*</span></label>
            <input id="supplier-name" type="text" required maxLength={150} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={INPUT} />
          </div>
          <div>
            <label htmlFor="supplier-contact" className={LABEL}>{dict.admin?.contactName || 'Contact Name'}</label>
            <input id="supplier-contact" type="text" value={formData.contactName} onChange={(e) => setFormData({ ...formData, contactName: e.target.value })} className={INPUT} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="supplier-phone" className={LABEL}>{dict.admin?.phone || 'Phone'}</label>
              <input id="supplier-phone" type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className={INPUT} />
            </div>
            <div>
              <label htmlFor="supplier-email" className={LABEL}>{dict.admin?.email || 'Email'}</label>
              <input id="supplier-email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={INPUT} />
            </div>
          </div>
          <div>
            <label htmlFor="supplier-address" className={LABEL}>{dict.admin?.address || 'Address'}</label>
            <textarea id="supplier-address" rows={2} value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className={`${INPUT} resize-none`} />
          </div>
          <div>
            <label htmlFor="supplier-notes" className={LABEL}>{dict.admin?.notes || 'Notes'}</label>
            <textarea id="supplier-notes" rows={2} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className={`${INPUT} resize-none`} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" className="checkbox-win8" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} />
            {dict.admin?.active || 'Active'}
          </label>
          {error && <div className="bg-win8-danger text-white text-sm p-3">{error}</div>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors">
            {dict.common?.cancel || 'Cancel'}
          </button>
          <button type="submit" disabled={submitting} className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors">
            {submitting ? (dict.common?.saving || 'Saving…') : (dict.common?.save || 'Save')}
          </button>
        </div>
      </form>
    </>
  );
}
