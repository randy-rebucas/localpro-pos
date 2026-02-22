'use client';

import { useState, useEffect } from 'react';
import { ITenantSettings } from '@/models/Tenant';

interface ReceiptTemplate {
  id: string;
  name: string;
  html: string;
  isDefault?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ReceiptTemplatesManagerProps {
  settings: ITenantSettings;
  tenant: string;
  onUpdate: (updates: Partial<ITenantSettings>) => void;
}

export default function ReceiptTemplatesManager({ settings, tenant, onUpdate }: ReceiptTemplatesManagerProps) { // eslint-disable-line @typescript-eslint/no-unused-vars
  const [templates, setTemplates] = useState<ReceiptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ReceiptTemplate | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchTemplates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/tenants/${tenant}/receipt-templates`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setTemplates(data.data.templates || []);
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setMessage({ type: 'error', text: error.message || 'Failed to load templates' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (template: { name: string; html: string; isDefault?: boolean }) => {
    try {
      setMessage(null);
      const url = `/api/tenants/${tenant}/receipt-templates`;
      const method = editing ? 'PUT' : 'POST';
      const body = editing
        ? { id: editing.id, ...template }
        : template;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Template ${editing ? 'updated' : 'created'} successfully` });
        setShowEditor(false);
        setEditing(null);
        fetchTemplates();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save template' });
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setMessage({ type: 'error', text: error.message || 'Failed to save template' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const res = await fetch(`/api/tenants/${tenant}/receipt-templates?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Template deleted successfully' });
        fetchTemplates();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to delete template' });
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setMessage({ type: 'error', text: error.message || 'Failed to delete template' });
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetch(`/api/tenants/${tenant}/receipt-templates`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, isDefault: true }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Default template updated' });
        fetchTemplates();
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setMessage({ type: 'error', text: error.message || 'Failed to set default template' });
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading templates...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Receipt Templates</h3>
        <button
          onClick={() => {
            setEditing(null);
            setShowEditor(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          Create New Template
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

      {showEditor && (
        <TemplateEditor
          template={editing}
          onSave={handleSave}
          onCancel={() => {
            setShowEditor(false);
            setEditing(null);
          }}
        />
      )}

      <div className="space-y-3">
        {templates.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No templates yet. Create your first template to get started.
          </div>
        ) : (
          templates.map((template) => (
            <div
              key={template.id}
              className="p-4 border-2 border-gray-300 rounded hover:bg-gray-50"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div>
                    <h4 className="font-medium text-gray-900">{template.name}</h4>
                    {template.isDefault && (
                      <span className="text-xs text-blue-600 font-medium">Default</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {!template.isDefault && (
                    <button
                      onClick={() => handleSetDefault(template.id)}
                      className="px-3 py-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditing(template);
                      setShowEditor(true);
                    }}
                    className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800 font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
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

function TemplateEditor({
  template,
  onSave,
  onCancel,
}: {
  template: ReceiptTemplate | null;
  onSave: (template: { name: string; html: string; isDefault?: boolean }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template?.name || '');
  const [html, setHtml] = useState(template?.html || '');
  const [isDefault, setIsDefault] = useState(template?.isDefault || false);
  const [preview, setPreview] = useState(false);

  const defaultTemplate = `<!DOCTYPE html>
<html>
<head>
  <title>Receipt</title>
  <style>
    @media print {
      @page { margin: 0; size: 80mm auto; }
      body { margin: 0; padding: 10px; }
    }
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      width: 80mm;
      margin: 0 auto;
      padding: 10px;
    }
    .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
    .item { display: flex; justify-content: space-between; margin-bottom: 5px; }
    .total { border-top: 2px dashed #000; padding-top: 10px; margin-top: 10px; font-weight: bold; }
    .footer { text-align: center; margin-top: 20px; font-size: 10px; }
  </style>
</head>
<body>
  <div class="header">
    {{#if storeName}}<h2>{{storeName}}</h2>{{/if}}
    {{#if logo}}<img src="{{logo}}" alt="Logo" style="max-width: 100px; max-height: 60px;" />{{/if}}
    <p>Receipt #{{receiptNumber}}</p>
    <p>{{date}} {{time}}</p>
    {{#if address}}<p>{{address}}</p>{{/if}}
    {{#if phone}}<p>{{phone}}</p>{{/if}}
    {{#if email}}<p>{{email}}</p>{{/if}}
    {{#if header}}<p>{{header}}</p>{{/if}}
  </div>
  {{#each items}}
  <div class="item">
    <div>
      <div>{{name}} x{{quantity}}</div>
      <div style="font-size: 10px;">@ {{price}}</div>
    </div>
    <div>{{subtotal}}</div>
  </div>
  {{/each}}
  <div class="total">
    <div class="item">
      <div>Subtotal:</div>
      <div>{{subtotal}}</div>
    </div>
    {{#if discount}}
    <div class="item">
      <div>Discount:</div>
      <div>-{{discount}}</div>
    </div>
    {{/if}}
    {{#if tax}}
    <div class="item">
      <div>{{taxLabel}}:</div>
      <div>{{tax}}</div>
    </div>
    {{/if}}
    <div class="item">
      <div>TOTAL:</div>
      <div>{{total}}</div>
    </div>
    <div class="item">
      <div>Payment:</div>
      <div>{{paymentMethod}}</div>
    </div>
    {{#if cashReceived}}
    <div class="item">
      <div>Cash:</div>
      <div>{{cashReceived}}</div>
    </div>
    {{/if}}
    {{#if change}}
    <div class="item">
      <div>Change:</div>
      <div>{{change}}</div>
    </div>
    {{/if}}
  </div>
  {{#if footer}}<div class="footer">{{footer}}</div>{{/if}}
</body>
</html>`;

  useEffect(() => {
    if (!template && html === '') {
      setHtml(defaultTemplate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sampleData = {
    storeName: 'Sample Store',
    logo: '',
    address: '123 Main St, City, State 12345',
    phone: '+1 (555) 123-4567',
    email: 'info@samplestore.com',
    receiptNumber: 'REC-20240101-00001',
    date: '2024-01-01',
    time: '10:30 AM',
    items: [
      { name: 'Product 1', quantity: 2, price: '$10.00', subtotal: '$20.00' },
      { name: 'Product 2', quantity: 1, price: '$15.00', subtotal: '$15.00' },
    ],
    subtotal: '$35.00',
    discount: '$5.00',
    tax: '$2.40',
    taxLabel: 'Tax',
    total: '$32.40',
    paymentMethod: 'Cash',
    cashReceived: '$50.00',
    change: '$17.60',
    footer: 'Thank you for your business!',
    header: '',
  };

  const renderPreview = () => {
    let previewHtml = html;
    // Simple variable replacement for preview
    Object.entries(sampleData).forEach(([key, value]) => {
      if (typeof value === 'string') {
        previewHtml = previewHtml.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }
    });
    // Handle if blocks
    previewHtml = previewHtml.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, content) => {
      const key = condition as keyof typeof sampleData;
      return key in sampleData && sampleData[key] ? content : '';
    });
    // Handle each blocks
    previewHtml = previewHtml.replace(/\{\{#each\s+items\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, content) => {
      return sampleData.items.map((item: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        let itemHtml = content;
        Object.entries(item).forEach(([key, value]) => {
          itemHtml = itemHtml.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
        });
        return itemHtml;
      }).join('');
    });
    return previewHtml;
  };

  return (
    <div className="border-2 border-gray-300 rounded p-6 bg-white">
      <h4 className="text-lg font-semibold mb-4">
        {template ? 'Edit Template' : 'Create New Template'}
      </h4>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Template Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="My Custom Receipt"
          />
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="isDefault"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="isDefault" className="text-sm text-gray-700">
            Set as default template
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Template HTML</label>
            <button
              type="button"
              onClick={() => setPreview(!preview)}
              className="px-3 py-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              {preview ? 'Edit' : 'Preview'}
            </button>
          </div>
          {preview ? (
            <div className="border-2 border-gray-300 rounded p-4 bg-white">
              <div dangerouslySetInnerHTML={{ __html: renderPreview() }} />
            </div>
          ) : (
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={20}
              className="w-full px-4 py-2 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              placeholder="Enter HTML template..."
            />
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded p-3">
          <p className="text-xs font-medium text-blue-900 mb-2">Available Variables:</p>
          <div className="text-xs text-blue-800 space-y-1">
            <div><code className="bg-blue-100 px-1 rounded">{'{{storeName}}'}</code>, <code className="bg-blue-100 px-1 rounded">{'{{logo}}'}</code>, <code className="bg-blue-100 px-1 rounded">{'{{address}}'}</code>, <code className="bg-blue-100 px-1 rounded">{'{{phone}}'}</code>, <code className="bg-blue-100 px-1 rounded">{'{{email}}'}</code></div>
            <div><code className="bg-blue-100 px-1 rounded">{'{{receiptNumber}}'}</code>, <code className="bg-blue-100 px-1 rounded">{'{{date}}'}</code>, <code className="bg-blue-100 px-1 rounded">{'{{time}}'}</code></div>
            <div><code className="bg-blue-100 px-1 rounded">{'{{#each items}}'}</code> - Loop through items</div>
            <div><code className="bg-blue-100 px-1 rounded">{'{{#if condition}}'}</code> - Conditional blocks</div>
            <div><code className="bg-blue-100 px-1 rounded">{'{{subtotal}}'}</code>, <code className="bg-blue-100 px-1 rounded">{'{{tax}}'}</code>, <code className="bg-blue-100 px-1 rounded">{'{{total}}'}</code></div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => onSave({ name, html, isDefault })}
            className="px-4 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            Save Template
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
