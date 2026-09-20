'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { useSupplierList, type Supplier, type SupplierFormData } from '@/hooks/useSupplierList';
import { usePermissions } from '@/hooks/usePermissions';

export default function SuppliersPage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const { canAccess } = usePermissions();
  const canManage = canAccess('suppliers.manage');

  const {
    suppliers,
    loading,
    message,
    fetchSuppliers,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    clearMessage,
    setMessage,
  } = useSupplierList();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const handleDelete = async (supplier: Supplier) => {
    if (!confirm(`Delete supplier "${supplier.name}"?`)) return;
    const success = await deleteSupplier(supplier._id);
    if (success) await fetchSuppliers();
  };

  if (!dict || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 sm:px-6 py-6">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Suppliers</h1>
          <p className="text-gray-600">Manage the vendors you purchase inventory from</p>
        </div>

        {message && (
          <div className={`mb-6 p-4 border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white border border-gray-300 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Suppliers</h2>
            {canManage && (
              <button
                onClick={() => {
                  clearMessage();
                  setEditingSupplier(null);
                  setShowModal(true);
                }}
                className="px-4 py-2 bg-brand text-white hover:bg-brand-hover font-medium border border-brand-hover"
              >
                Add Supplier
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {suppliers.map((supplier) => (
                  <tr key={supplier._id}>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{supplier.name}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{supplier.contactName || '-'}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{supplier.phone || '-'}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{supplier.email || '-'}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold border ${supplier.isActive ? 'border-green-300 bg-green-50 text-green-800' : 'border-gray-300 bg-gray-100 text-gray-600'}`}>
                        {supplier.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                      {canManage ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              clearMessage();
                              setEditingSupplier(supplier);
                              setShowModal(true);
                            }}
                            className="text-brand hover:text-brand-navy-deep"
                          >
                            Edit
                          </button>
                          <button onClick={() => handleDelete(supplier)} className="text-red-600 hover:text-red-900">
                            Delete
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {suppliers.length === 0 && (
              <div className="text-center py-8 text-gray-500">No suppliers found</div>
            )}
          </div>
        </div>

        {showModal && (
          <SupplierModal
            supplier={editingSupplier}
            onClose={() => {
              setShowModal(false);
              setEditingSupplier(null);
            }}
            onSave={async () => {
              setMessage({
                type: 'success',
                text: editingSupplier ? 'Supplier updated successfully' : 'Supplier created successfully',
              });
              await fetchSuppliers();
              setShowModal(false);
              setEditingSupplier(null);
            }}
            createSupplier={createSupplier}
            updateSupplier={updateSupplier}
          />
        )}
      </div>
    </div>
  );
}

function SupplierModal({
  supplier,
  onClose,
  onSave,
  createSupplier,
  updateSupplier,
}: {
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
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">{supplier ? 'Edit Supplier' : 'Add Supplier'}</h2>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                required
                maxLength={150}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
              <input
                type="text"
                value={formData.contactName}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <textarea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
              />
            </div>
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-700">Active</span>
              </label>
            </div>
            {error && <div className="bg-red-50 text-red-800 border border-red-300 p-3">{error}</div>}
            <div className="flex gap-3 justify-end pt-4">
              <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-brand text-white hover:bg-brand-hover disabled:opacity-50 border border-brand-hover"
              >
                {submitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
