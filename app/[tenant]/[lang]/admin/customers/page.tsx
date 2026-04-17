'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import { showToast } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';
import { useCustomersList, type Customer } from '@/hooks/useCustomersList';
import { useCustomersForm } from '@/hooks/useCustomersForm';
import {
  getStatusBadgeClass,
  getStatusLabel,
  getDeleteConfirmMessage,
  getDeleteSuccessMessage,
  getDeleteErrorMessage,
  getSaveSuccessMessage,
  getSaveErrorMessage,
  getToggleStatusMessage,
  formatCurrency,
} from '@/lib/customers-helpers';

export default function CustomersPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Record<string, any>>(null!); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const {
    customers,
    loading,
    page,
    totalPages,
    search,
    filterActive,
    setPage,
    setSearch,
    setFilterActive,
    fetchCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    toggleCustomerStatus,
  } = useCustomersList();

  const { formData, setFormData, error, submitting, handleSubmit, resetForm, initializeForm } = useCustomersForm();
  const { confirm, Dialog: ConfirmDialog } = useConfirm();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    if (dict) fetchCustomers();
  }, [dict, fetchCustomers]);

  const openCreate = () => {
    setEditingCustomer(null);
    resetForm();
    setShowModal(true);
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    initializeForm(customer);
    setShowModal(true);
  };

  const handleSave = async () => {
    await handleSubmit(async (data) => {
      const isEdit = !!editingCustomer;
      const success = isEdit
        ? await updateCustomer(editingCustomer._id, data)
        : await createCustomer(data);

      if (success) {
        showToast.success(getSaveSuccessMessage(isEdit, dict));
        setShowModal(false);
        await fetchCustomers();
      } else {
        showToast.error(getSaveErrorMessage(dict));
      }
      return success;
    });
  };

  const handleDelete = async (customer: Customer) => {
    const confirmed = await confirm(
      dict?.admin?.deleteCustomer || 'Delete Customer',
      getDeleteConfirmMessage(dict),
      { variant: 'danger' }
    );
    if (!confirmed) return;

    const success = await deleteCustomer(customer._id);
    if (success) {
      showToast.success(getDeleteSuccessMessage(dict));
      await fetchCustomers();
    } else {
      showToast.error(getDeleteErrorMessage(dict));
    }
  };

  const handleToggleStatus = async (customer: Customer) => {
    const success = await toggleCustomerStatus(customer._id, !customer.isActive);
    if (success) {
      showToast.success(getToggleStatusMessage(!customer.isActive, dict));
      await fetchCustomers();
    } else {
      showToast.error(getDeleteErrorMessage(dict));
    }
  };

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {ConfirmDialog}
      <Navbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {dict?.admin?.backToAdmin || 'Back to Admin'}
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {dict?.admin?.customers || 'Customers'}
              </h1>
              <p className="text-gray-600">{dict?.admin?.customersSubtitle || 'Manage your customer database'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-300 p-6">
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
            <div className="flex flex-col sm:flex-row gap-3 flex-1">
              <input
                type="text"
                placeholder={dict?.common?.search || 'Search...'}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="px-4 py-2 border border-gray-300 text-sm focus:outline-none focus:border-blue-500 w-full sm:w-64"
              />
              <select
                value={filterActive}
                onChange={(e) => { setFilterActive(e.target.value); setPage(1); }}
                className="px-4 py-2 border border-gray-300 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="all">{dict?.common?.all || 'All'}</option>
                <option value="true">{dict?.common?.active || 'Active'}</option>
                <option value="false">{dict?.common?.inactive || 'Inactive'}</option>
              </select>
            </div>
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 font-medium border border-blue-700 whitespace-nowrap"
            >
              {dict?.common?.add || 'Add'} {dict?.admin?.customer || 'Customer'}
            </button>
            <Link
              href={`/${tenant}/${lang}/admin/file-upload`}
              className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium border border-gray-300 inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {dict?.admin?.uploadFiles || 'Upload Files'}
            </Link>
          </div>

          {/* Table */}
          {customers.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p>{dict?.common?.noCustomersFound || 'No customers found'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict?.admin?.name || 'Name'}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict?.admin?.email || 'Email'}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict?.admin?.phone || 'Phone'}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict?.common?.totalSpent || 'Total Spent'}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict?.admin?.tags || 'Tags'}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict?.admin?.status || 'Status'}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict?.common?.actions || 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {customers.map((customer) => (
                    <tr key={customer._id}>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {customer.firstName} {customer.lastName}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {customer.email || '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {customer.phone || '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(customer.totalSpent || 0, lang)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex gap-1 flex-wrap">
                          {(customer.tags || []).slice(0, 3).map((tag) => (
                            <span key={tag} className="px-2 py-0.5 text-xs font-medium border border-gray-300 bg-gray-100 text-gray-700">
                              {tag}
                            </span>
                          ))}
                          {(customer.tags || []).length > 3 && (
                            <span className="text-xs text-gray-400">+{customer.tags!.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleStatus(customer)}
                          className={`px-2 py-1 text-xs font-semibold border ${getStatusBadgeClass(customer.isActive)}`}
                        >
                          {getStatusLabel(customer.isActive, dict)}
                        </button>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEdit(customer)}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {dict?.common?.edit || 'Edit'}
                          </button>
                          {customer.isActive && (
                            <button
                              onClick={() => handleDelete(customer)}
                              className="text-red-600 hover:text-red-800 font-medium"
                            >
                              {dict?.common?.delete || 'Delete'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 text-sm disabled:opacity-50"
              >
                {dict?.common?.previous || 'Previous'}
              </button>
              <span className="px-3 py-1 text-sm text-gray-600">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 border border-gray-300 text-sm disabled:opacity-50"
              >
                {dict?.common?.next || 'Next'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-lg border border-gray-300">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">
                {editingCustomer ? (dict?.common?.edit || 'Edit') : (dict?.common?.add || 'Add')} {dict?.admin?.customer || 'Customer'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {dict?.common?.firstName || 'First Name'} *
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ firstName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {dict?.common?.lastName || 'Last Name'} *
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ lastName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.admin?.email || 'Email'}
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.admin?.phone || 'Phone'}
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.admin?.tags || 'Tags'} <span className="text-gray-400 font-normal">({dict?.common?.commaSeparated || 'comma separated'})</span>
                </label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ tags: e.target.value })}
                  placeholder="VIP, Regular, Wholesale"
                  className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.common?.notes || 'Notes'}
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
              {error && <div className="text-sm text-red-600">{error}</div>}
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {dict?.common?.cancel || 'Cancel'}
              </button>
              <button
                onClick={handleSave}
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 border border-blue-700 disabled:opacity-50"
              >
                {submitting ? (dict?.common?.saving || 'Saving...') : (dict?.common?.save || 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
