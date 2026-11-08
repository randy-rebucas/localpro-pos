'use client';

import { useState, useEffect } from 'react';
import { ITenantSettings } from '@/types/tenant';
import { sanitizeReceiptHtml } from '@/lib/receipt-template-sanitize';

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
  dict?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export default function ReceiptTemplatesManager({ settings, tenant, onUpdate, dict }: ReceiptTemplatesManagerProps) { // eslint-disable-line @typescript-eslint/no-unused-vars
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
      setMessage({ type: 'error', text: error.message || dict?.receiptTemplates?.failedToLoad || 'Failed to load templates' });
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
        setMessage({ type: 'success', text: editing ? (dict?.receiptTemplates?.templateUpdated || 'Template updated successfully') : (dict?.receiptTemplates?.templateCreated || 'Template created successfully') });
        setShowEditor(false);
        setEditing(null);
        fetchTemplates();
      } else {
        setMessage({ type: 'error', text: data.error || dict?.receiptTemplates?.failedToSave || 'Failed to save template' });
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setMessage({ type: 'error', text: error.message || dict?.receiptTemplates?.failedToSave || 'Failed to save template' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(dict?.receiptTemplates?.deleteConfirm || 'Are you sure you want to delete this template?')) return;

    try {
      const res = await fetch(`/api/tenants/${tenant}/receipt-templates?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: dict?.receiptTemplates?.templateDeleted || 'Template deleted successfully' });
        fetchTemplates();
      } else {
        setMessage({ type: 'error', text: data.error || dict?.receiptTemplates?.failedToDelete || 'Failed to delete template' });
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setMessage({ type: 'error', text: error.message || dict?.receiptTemplates?.failedToDelete || 'Failed to delete template' });
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

      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setMessage({ type: 'success', text: dict?.receiptTemplates?.defaultUpdated || 'Default template updated' });
        fetchTemplates();
      } else {
        setMessage({ type: 'error', text: data?.error || dict?.receiptTemplates?.failedToSetDefault || 'Failed to set default template' });
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setMessage({ type: 'error', text: error.message || dict?.receiptTemplates?.failedToSetDefault || 'Failed to set default template' });
    }
  };

  if (loading) {
    return <div className="text-center py-8">{dict?.receiptTemplates?.loading || 'Loading templates...'}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-ink">{dict?.receiptTemplates?.title || 'Receipt Templates'}</h3>
        <button
          onClick={() => {
            setEditing(null);
            setShowEditor(true);
          }}
          className="min-h-[44px] px-4 bg-ink font-receipt text-xs font-medium uppercase text-paper-white transition-colors hover:bg-brand-navy disabled:cursor-not-allowed disabled:opacity-50"
        >
          {dict?.receiptTemplates?.createNew || 'Create New Template'}
        </button>
      </div>

      {message && (
        <div
          className={`border-l-4 bg-paper p-3 font-receipt text-sm text-ink ${
            message.type === 'success' ? 'border-brand' : 'border-stamp'
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
          dict={dict}
        />
      )}

      <div className="space-y-3">
        {templates.length === 0 ? (
          <div className="text-center py-8 text-ink/60">
            {dict?.receiptTemplates?.noTemplates || 'No templates yet. Create your first template to get started.'}
          </div>
        ) : (
          templates.map((template) => (
            <div
              key={template.id}
              className="p-4 border-2 border-ink/25 hover:bg-paper"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-3">
                  <div>
                    <h4 className="font-medium text-ink">{template.name}</h4>
                    {template.isDefault && (
                      <span className="text-xs text-brand-hover font-medium">{dict?.receiptTemplates?.default || 'Default'}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {!template.isDefault && (
                    <button
                      onClick={() => handleSetDefault(template.id)}
                      className="flex min-h-[44px] items-center px-2 font-receipt text-xs font-medium uppercase text-ink underline hover:no-underline"
                    >
                      {dict?.receiptTemplates?.setDefault || 'Set Default'}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditing(template);
                      setShowEditor(true);
                    }}
                    className="flex min-h-[44px] items-center px-2 font-receipt text-xs font-medium uppercase text-ink underline hover:no-underline"
                  >
                    {dict?.common?.edit || 'Edit'}
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="flex min-h-[44px] items-center px-2 font-receipt text-xs font-medium uppercase text-stamp underline hover:no-underline"
                  >
                    {dict?.common?.delete || 'Delete'}
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
  dict,
}: {
  template: ReceiptTemplate | null;
  onSave: (template: { name: string; html: string; isDefault?: boolean }) => void;
  onCancel: () => void;
  dict?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
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
    {{#if logo}}<img src="{{logo}}" alt="Logo" style="max-width: 100px; max-height: 60px;" onerror="this.remove()" />{{/if}}
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
    <div className="border-2 border-ink/25 bg-paper-white p-4 sm:p-6">
      <h4 className="text-lg font-semibold mb-4">
        {template ? (dict?.receiptTemplates?.editTemplate || 'Edit Template') : (dict?.receiptTemplates?.createNew || 'Create New Template')}
      </h4>

      <div className="space-y-4">
        <div>
          <label className="mb-2 block font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/70">{dict?.receiptTemplates?.templateName || 'Template Name'}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full min-h-[44px] border-2 border-ink/25 bg-paper-white px-3 py-2 font-receipt text-sm text-ink placeholder:text-ink/45 focus:border-ink focus:outline-none"
            placeholder={dict?.receiptTemplates?.templateNamePlaceholder || 'My Custom Receipt'}
          />
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="isDefault"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="checkbox-win8 cursor-pointer"
          />
          <label htmlFor="isDefault" className="text-sm text-ink/80">
            {dict?.receiptTemplates?.setAsDefault || 'Set as default template'}
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/70">{dict?.receiptTemplates?.templateHtml || 'Template HTML'}</label>
            <button
              type="button"
              onClick={() => setPreview(!preview)}
              className="flex min-h-[44px] items-center px-2 font-receipt text-xs font-medium uppercase text-ink underline hover:no-underline"
            >
              {preview ? (dict?.common?.edit || 'Edit') : (dict?.receiptTemplates?.preview || 'Preview')}
            </button>
          </div>
          {preview ? (
            <div className="border-2 border-ink/25 p-4 bg-white">
              {/* Sandboxed (no scripts, opaque origin) and sanitized: the template
                  is tenant-authored HTML, and its <style> must not restyle this page. */}
              <iframe
                title={dict?.receiptTemplates?.preview || 'Preview'}
                sandbox=""
                srcDoc={sanitizeReceiptHtml(renderPreview())}
                className="mk-print-preview block h-[600px] w-full border-0 bg-white"
              />
            </div>
          ) : (
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={20}
              className="w-full border-2 border-ink/25 bg-paper-white px-3 py-2 font-receipt text-sm text-ink placeholder:text-ink/45 focus:border-ink focus:outline-none"
              placeholder={dict?.receiptTemplates?.htmlPlaceholder || 'Enter HTML template...'}
            />
          )}
        </div>

        <div className="border-l-4 border-brand bg-paper p-3">
          <p className="mb-2 font-receipt text-xs font-medium uppercase text-ink">{dict?.receiptTemplates?.availableVariables || 'Available Variables:'}</p>
          <div className="space-y-1 text-xs text-ink/80">
            <div><code className="bg-paper-white px-1 font-receipt">{'{{storeName}}'}</code>, <code className="bg-paper-white px-1 font-receipt">{'{{logo}}'}</code>, <code className="bg-paper-white px-1 font-receipt">{'{{address}}'}</code>, <code className="bg-paper-white px-1 font-receipt">{'{{phone}}'}</code>, <code className="bg-paper-white px-1 font-receipt">{'{{email}}'}</code></div>
            <div><code className="bg-paper-white px-1 font-receipt">{'{{receiptNumber}}'}</code>, <code className="bg-paper-white px-1 font-receipt">{'{{date}}'}</code>, <code className="bg-paper-white px-1 font-receipt">{'{{time}}'}</code></div>
            <div><code className="bg-paper-white px-1 font-receipt">{'{{#each items}}'}</code> - {dict?.receiptTemplates?.loopThroughItems || 'Loop through items'}</div>
            <div><code className="bg-paper-white px-1 font-receipt">{'{{#if condition}}'}</code> - {dict?.receiptTemplates?.conditionalBlocks || 'Conditional blocks'}</div>
            <div><code className="bg-paper-white px-1 font-receipt">{'{{subtotal}}'}</code>, <code className="bg-paper-white px-1 font-receipt">{'{{tax}}'}</code>, <code className="bg-paper-white px-1 font-receipt">{'{{total}}'}</code></div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => onSave({ name, html, isDefault })}
            className="min-h-[44px] px-4 bg-ink font-receipt text-xs font-medium uppercase text-paper-white transition-colors hover:bg-brand-navy disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dict?.receiptTemplates?.saveTemplate || 'Save Template'}
          </button>
          <button
            onClick={onCancel}
            className="min-h-[44px] px-4 border border-ink/25 font-receipt text-xs font-medium uppercase text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dict?.common?.cancel || 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
