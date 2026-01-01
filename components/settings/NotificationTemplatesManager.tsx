'use client';

import { useState, useEffect } from 'react';
import { ITenantSettings } from '@/models/Tenant';

interface NotificationTemplatesManagerProps {
  settings: ITenantSettings;
  tenant: string;
  onUpdate: (updates: Partial<ITenantSettings>) => void;
}

type TemplateType = 'email' | 'sms';
type TemplateCategory = 'bookingConfirmation' | 'bookingReminder' | 'bookingCancellation' | 'lowStockAlert' | 'attendanceAlert';

interface Template {
  type: TemplateType;
  category: TemplateCategory;
  subject?: string;
  body: string;
}

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  bookingConfirmation: 'Booking Confirmation',
  bookingReminder: 'Booking Reminder',
  bookingCancellation: 'Booking Cancellation',
  lowStockAlert: 'Low Stock Alert',
  attendanceAlert: 'Attendance Alert',
};

const CATEGORY_VARIABLES: Record<TemplateCategory, string[]> = {
  bookingConfirmation: ['{{customerName}}', '{{serviceName}}', '{{startTime}}', '{{endTime}}', '{{date}}', '{{staffName}}'],
  bookingReminder: ['{{customerName}}', '{{serviceName}}', '{{startTime}}', '{{date}}', '{{staffName}}'],
  bookingCancellation: ['{{customerName}}', '{{serviceName}}', '{{startTime}}', '{{date}}', '{{reason}}'],
  lowStockAlert: ['{{productName}}', '{{currentStock}}', '{{threshold}}', '{{sku}}'],
  attendanceAlert: ['{{employeeName}}', '{{clockInTime}}', '{{expectedTime}}', '{{hours}}'],
};

export default function NotificationTemplatesManager({ settings, tenant, onUpdate }: NotificationTemplatesManagerProps) {
  const [templates, setTemplates] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ type: TemplateType; category: TemplateCategory } | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeType, setActiveType] = useState<TemplateType>('email');

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/tenants/${tenant}/notification-templates`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setTemplates(data.data || {});
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to load templates' });
    } finally {
      setLoading(false);
    }
  };

  const getTemplate = (type: TemplateType, category: TemplateCategory): string => {
    const templateKey = type === 'email' 
      ? templates.email?.[category] 
      : templates.sms?.[category];
    
    if (typeof templateKey === 'string') {
      // Handle format: "subject|body" for email
      if (type === 'email' && templateKey.includes('|')) {
        return templateKey.split('|')[1] || '';
      }
      return templateKey;
    }
    return '';
  };

  const getSubject = (category: TemplateCategory): string => {
    const templateKey = templates.email?.[category];
    if (typeof templateKey === 'string' && templateKey.includes('|')) {
      return templateKey.split('|')[0] || '';
    }
    return '';
  };

  const handleSave = async (type: TemplateType, category: TemplateCategory, subject: string, body: string) => {
    try {
      setMessage(null);
      const res = await fetch(`/api/tenants/${tenant}/notification-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type,
          category,
          subject: type === 'email' ? subject : undefined,
          body,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Template saved successfully' });
        setEditing(null);
        fetchTemplates();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save template' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to save template' });
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading templates...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Notification Templates</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveType('email')}
            className={`px-4 py-2 text-sm font-medium ${
              activeType === 'email'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Email
          </button>
          <button
            onClick={() => setActiveType('sms')}
            className={`px-4 py-2 text-sm font-medium ${
              activeType === 'sms'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            SMS
          </button>
        </div>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(Object.keys(CATEGORY_LABELS) as TemplateCategory[]).map((category) => (
          <div
            key={category}
            className="p-4 border-2 border-gray-300 rounded hover:bg-gray-50"
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-gray-900">{CATEGORY_LABELS[category]}</h4>
              <button
                onClick={() => setEditing({ type: activeType, category })}
                className="px-3 py-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                {editing?.type === activeType && editing?.category === category ? 'Cancel' : 'Edit'}
              </button>
            </div>
            
            {editing?.type === activeType && editing?.category === category ? (
              <TemplateEditor
                type={activeType}
                category={category}
                initialSubject={getSubject(category)}
                initialBody={getTemplate(activeType, category)}
                onSave={(subject, body) => {
                  handleSave(activeType, category, subject, body);
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="text-sm text-gray-600">
                {getTemplate(activeType, category) || (
                  <span className="italic text-gray-400">No template set</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateEditor({
  type,
  category,
  initialSubject,
  initialBody,
  onSave,
  onCancel,
}: {
  type: TemplateType;
  category: TemplateCategory;
  initialSubject: string;
  initialBody: string;
  onSave: (subject: string, body: string) => void;
  onCancel: () => void;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);

  return (
    <div className="space-y-3 mt-3">
      {type === 'email' && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 text-sm border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Email subject"
          />
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          {type === 'email' ? 'Body' : 'Message'}
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 text-sm border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder={`${type === 'email' ? 'Email' : 'SMS'} message body`}
        />
        <div className="mt-2 text-xs text-gray-500">
          <div className="font-medium mb-1">Available variables:</div>
          <div className="flex flex-wrap gap-1">
            {CATEGORY_VARIABLES[category].map((variable) => (
              <code key={variable} className="px-1 py-0.5 bg-gray-100 rounded text-xs">
                {variable}
              </code>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSave(subject, body)}
          className="px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 font-medium"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 hover:bg-gray-300 font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
