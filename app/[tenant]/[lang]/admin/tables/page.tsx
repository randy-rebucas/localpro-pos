'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import Navbar from '@/components/Navbar';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';

interface TableRow {
  _id: string;
  name: string;
  capacity?: number;
  status: 'open' | 'occupied' | 'check-requested';
  isActive: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-green-100 text-green-800' },
  occupied: { label: 'Occupied', cls: 'bg-red-100 text-red-800' },
  'check-requested': { label: 'Check Requested', cls: 'bg-yellow-100 text-yellow-800' },
};

export default function TablesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedTable, setSelectedTable] = useState<TableRow | null>(null);
  const [formData, setFormData] = useState({ name: '', capacity: '' });

  const { settings } = useTenantSettings();
  const primaryColor = settings?.primaryColor || '#3b82f6';

  const fetchTables = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/tables?tenant=${tenant}&isActive=${showInactive ? 'all' : 'true'}`,
        { credentials: 'include' }
      );
      const data = await res.json();
      if (data.success) setTables(data.data || []);
      else toast.error(data.error || 'Failed to load tables');
    } catch {
      toast.error('Error loading tables');
    } finally {
      setLoading(false);
    }
  }, [tenant, showInactive]);

  useEffect(() => {
    if (tenant) fetchTables();
  }, [fetchTables, tenant]);

  const openAdd = () => {
    setSelectedTable(null);
    setFormData({ name: '', capacity: '' });
    setShowModal(true);
  };

  const openEdit = (table: TableRow) => {
    setSelectedTable(table);
    setFormData({ name: table.name, capacity: table.capacity?.toString() || '' });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) { toast.error('Table name is required'); return; }
    if (formData.capacity) {
      const cap = parseInt(formData.capacity);
      if (isNaN(cap) || cap < 1 || cap > 100) { toast.error('Capacity must be 1–100'); return; }
    }

    const method = selectedTable ? 'PATCH' : 'POST';
    const url = selectedTable
      ? `/api/tables/${selectedTable._id}?tenant=${tenant}`
      : `/api/tables?tenant=${tenant}`;

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: formData.name.trim(),
          capacity: formData.capacity ? parseInt(formData.capacity) : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(selectedTable ? 'Table updated' : 'Table created');
        setShowModal(false);
        fetchTables();
      } else {
        toast.error(data.error || 'Failed to save table');
      }
    } catch {
      toast.error('Error saving table');
    }
  };

  const handleDeactivate = async (table: TableRow) => {
    if (!confirm(`Deactivate table "${table.name}"?`)) return;
    try {
      const res = await fetch(`/api/tables/${table._id}?tenant=${tenant}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) { toast.success('Table deactivated'); fetchTables(); }
      else toast.error(data.error || 'Failed to deactivate');
    } catch {
      toast.error('Error deactivating table');
    }
  };

  const handleReactivate = async (table: TableRow) => {
    try {
      const res = await fetch(`/api/tables/${table._id}?tenant=${tenant}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: true }),
      });
      const data = await res.json();
      if (data.success) { toast.success('Table reactivated'); fetchTables(); }
      else toast.error(data.error || 'Failed to reactivate');
    } catch {
      toast.error('Error reactivating table');
    }
  };

  const handleResetStatus = async (table: TableRow) => {
    try {
      const res = await fetch(`/api/tables/${table._id}?tenant=${tenant}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'open' }),
      });
      const data = await res.json();
      if (data.success) { toast.success('Table reset to open'); fetchTables(); }
      else toast.error(data.error || 'Failed to reset status');
    } catch {
      toast.error('Error resetting table status');
    }
  };

  const activeTables = tables.filter((t) => t.isActive);
  const displayed = showInactive ? tables : activeTables;

  return (
    <div>
      <Navbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-8 flex flex-wrap gap-3 justify-between items-center">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-1">Tables</h1>
            <p className="text-gray-600">
              {activeTables.length} active table{activeTables.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded"
              />
              Show inactive
            </label>
            <button
              type="button"
              onClick={openAdd}
              style={{ backgroundColor: primaryColor }}
              className="px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition"
            >
              + Add Table
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-16">
            <div
              className="inline-block animate-spin h-8 w-8 border-b-2"
              style={{ borderTopColor: primaryColor, borderRightColor: primaryColor, borderLeftColor: primaryColor, borderBottomColor: 'transparent' }}
            />
          </div>
        )}

        {/* Tables grid */}
        {!loading && displayed.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayed.map((table) => {
              const statusCfg = STATUS_CONFIG[table.status] ?? STATUS_CONFIG.open;
              return (
                <div
                  key={table._id}
                  className={`bg-white border-2 p-4 transition ${
                    table.isActive ? 'border-gray-200 hover:shadow-md' : 'border-dashed border-gray-200 opacity-60'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-bold text-gray-900">{table.name}</h3>
                    {table.isActive ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.cls}`}>
                        {statusCfg.label}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        Inactive
                      </span>
                    )}
                  </div>

                  {table.capacity && (
                    <p className="text-sm text-gray-500 mb-3">{table.capacity} seats</p>
                  )}

                  <div className="flex flex-wrap gap-2 mt-3">
                    {table.isActive ? (
                      <>
                        {table.status !== 'open' && (
                          <button
                            type="button"
                            onClick={() => handleResetStatus(table)}
                            className="text-xs px-2 py-1 border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 transition"
                          >
                            Reset to Open
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEdit(table)}
                          className="text-xs px-3 py-1 border hover:bg-gray-50 transition"
                          style={{ borderColor: primaryColor, color: primaryColor }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeactivate(table)}
                          className="text-xs px-3 py-1 border border-red-200 text-red-500 hover:bg-red-50 transition"
                        >
                          Deactivate
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleReactivate(table)}
                        className="text-xs px-3 py-1 border border-green-300 text-green-600 hover:bg-green-50 transition"
                      >
                        Reactivate
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!loading && displayed.length === 0 && (
          <div className="text-center py-16 bg-white border-2 border-gray-200">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18M10 4v16M14 4v16" />
            </svg>
            <p className="text-gray-500 mb-4">No tables configured yet</p>
            <button
              type="button"
              onClick={openAdd}
              style={{ backgroundColor: primaryColor }}
              className="px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition"
            >
              + Add Table
            </button>
          </div>
        )}

        {/* Status legend */}
        {!loading && activeTables.length > 0 && (
          <div className="flex flex-wrap gap-3 mt-4 text-xs text-gray-500">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <span key={key} className={`px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>{cfg.label}</span>
            ))}
            <span className="ml-auto">&ldquo;Reset to Open&rdquo; clears stuck occupied status</span>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-900">{selectedTable ? 'Edit Table' : 'Add Table'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Table Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  placeholder="e.g. T1, Table 5, Patio A"
                  maxLength={50}
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Seating Capacity</label>
                <input
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  placeholder="e.g. 4"
                  min={1}
                  max={100}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-sm hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: primaryColor }}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition"
                >
                  {selectedTable ? 'Save Changes' : 'Add Table'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
