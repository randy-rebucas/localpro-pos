'use client';

import { useState, useEffect, useCallback } from 'react';
import { ITenantSettings } from '@/models/Tenant';

interface TaxRule {
  id: string;
  name: string;
  rate: number;
  label: string;
  appliesTo?: 'all' | 'products' | 'services' | 'categories';
  categoryIds?: string[];
  productIds?: string[];
  region?: {
    country?: string;
    state?: string;
    city?: string;
    zipCodes?: string[];
  };
  priority: number;
  isActive: boolean;
}

interface TaxRulesManagerProps {
  settings?: ITenantSettings;
  tenant: string;
  onUpdate?: (updates: Partial<ITenantSettings>) => void;
}

export default function TaxRulesManager({ tenant }: TaxRulesManagerProps) {
  const [rules, setRules] = useState<TaxRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TaxRule | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/tenants/${tenant}/tax-rules`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setRules(data.data || []);
      }
    } catch (error: unknown) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to load tax rules' });
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleSave = async (rule: Partial<TaxRule>) => {
    try {
      setMessage(null);
      const url = `/api/tenants/${tenant}/tax-rules`;
      const method = editing ? 'PUT' : 'POST';
      const body = editing ? { id: editing.id, ...rule } : rule;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Tax rule ${editing ? 'updated' : 'created'} successfully` });
        setShowForm(false);
        setEditing(null);
        fetchRules();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save tax rule' });
      }
    } catch (error: unknown) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save tax rule' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this tax rule?')) return;

    try {
      const res = await fetch(`/api/tenants/${tenant}/tax-rules?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Tax rule deleted successfully' });
        fetchRules();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to delete tax rule' });
      }
    } catch (error: unknown) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to delete tax rule' });
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading tax rules...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Tax Rules</h3>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          Add Tax Rule
        </button>
      </div>

      {message && (
        <div
          className={`p-3 rounded ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {showForm && (
        <TaxRuleForm
          rule={editing}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      <div className="space-y-3">
        {rules.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No tax rules yet. Add your first tax rule to get started.
          </div>
        ) : (
          rules
            .sort((a, b) => b.priority - a.priority)
            .map((rule) => (
              <div
                key={rule.id}
                className={`p-4 border-2 rounded ${
                  rule.isActive ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">{rule.name}</h4>
                    <div className="text-sm text-gray-600 mt-1">
                      <span className="font-medium">{rule.rate}%</span> - {rule.label}
                      {rule.appliesTo !== 'all' && (
                        <span className="ml-2">• Applies to: {rule.appliesTo}</span>
                      )}
                      {rule.region && (
                        <span className="ml-2">
                          • Region: {rule.region.country || 'Any'}
                          {rule.region.state && `, ${rule.region.state}`}
                        </span>
                      )}
                      <span className="ml-2">• Priority: {rule.priority}</span>
                    </div>
                    {!rule.isActive && (
                      <span className="text-xs text-gray-500 mt-1 block">Inactive</span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        setEditing(rule);
                        setShowForm(true);
                      }}
                      className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="px-3 py-1 text-xs text-red-600 hover:text-red-700 font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}

function TaxRuleForm({
  rule,
  onSave,
  onCancel,
}: {
  rule: TaxRule | null;
  onSave: (rule: Partial<TaxRule>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(rule?.name || '');
  const [rate, setRate] = useState(rule?.rate?.toString() || '0');
  const [label, setLabel] = useState(rule?.label || 'Tax');
  const [appliesTo, setAppliesTo] = useState<'all' | 'products' | 'services' | 'categories'>(rule?.appliesTo || 'all');
  const [priority, setPriority] = useState(rule?.priority?.toString() || '0');
  const [isActive, setIsActive] = useState(rule?.isActive !== false);
  const [country, setCountry] = useState(rule?.region?.country || '');
  const [state, setState] = useState(rule?.region?.state || '');
  const [city, setCity] = useState(rule?.region?.city || '');
  const [zipCodes, setZipCodes] = useState(rule?.region?.zipCodes?.join(', ') || '');

  return (
    <div className="border-2 border-gray-300 rounded p-6 bg-white">
      <h4 className="text-lg font-semibold mb-4">{rule ? 'Edit Tax Rule' : 'Add Tax Rule'}</h4>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Rule Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., California Sales Tax"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tax Rate (%) *</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tax Label *</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., VAT, GST, Sales Tax"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Applies To</label>
          <select
            value={appliesTo}
            onChange={(e) => setAppliesTo(e.target.value as 'all' | 'products' | 'services' | 'categories')}
            className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Products & Services</option>
            <option value="products">Products Only</option>
            <option value="services">Services Only</option>
            <option value="categories">Specific Categories</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Region (Optional)</label>
          <div className="grid grid-cols-3 gap-3">
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Country"
            />
            <input
              type="text"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="State/Province"
            />
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="City"
            />
          </div>
          <input
            type="text"
            value={zipCodes}
            onChange={(e) => setZipCodes(e.target.value)}
            className="mt-2 w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Zip Codes (comma-separated)"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="0"
            />
            <p className="text-xs text-gray-500 mt-1">Higher priority rules are applied first</p>
          </div>
          <div className="flex items-center pt-8">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
              Active
            </label>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() =>
              onSave({
                name,
                rate: parseFloat(rate),
                label,
                appliesTo,
                priority: parseInt(priority) || 0,
                isActive,
                region: country || state || city || zipCodes ? {
                  country: country || undefined,
                  state: state || undefined,
                  city: city || undefined,
                  zipCodes: zipCodes ? zipCodes.split(',').map((z) => z.trim()).filter(Boolean) : undefined,
                } : undefined,
              })
            }
            className="px-4 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            Save Rule
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 text-gray-700 font-medium hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
