'use client';

import { useState, useEffect, useRef } from 'react';
import Win8Drawer from '@/components/admin/Win8Drawer';
import { showToast } from '@/lib/toast';

interface NotificationTemplatesManagerProps {
  tenant: string;
  /** When false, templates are shown read-only (no edit controls). */
  canManage?: boolean;
  dict?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

type TemplateType = 'email' | 'sms';
type TemplateCategory = 'bookingConfirmation' | 'bookingReminder' | 'bookingCancellation' | 'lowStockAlert' | 'attendanceAlert';

const getCategoryLabel = (category: TemplateCategory, dict: any): string => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const labels: Record<TemplateCategory, string> = {
    bookingConfirmation: dict?.notificationTemplates?.bookingConfirmation || 'Booking Confirmation',
    bookingReminder: dict?.notificationTemplates?.bookingReminder || 'Booking Reminder',
    bookingCancellation: dict?.notificationTemplates?.bookingCancellation || 'Booking Cancellation',
    lowStockAlert: dict?.notificationTemplates?.lowStockAlert || 'Low Stock Alert',
    attendanceAlert: dict?.notificationTemplates?.attendanceAlert || 'Attendance Alert',
  };
  return labels[category];
};

const CATEGORY_VARIABLES: Record<TemplateCategory, string[]> = {
  bookingConfirmation: ['{{customerName}}', '{{serviceName}}', '{{startTime}}', '{{endTime}}', '{{date}}', '{{staffName}}'],
  bookingReminder: ['{{customerName}}', '{{serviceName}}', '{{startTime}}', '{{date}}', '{{staffName}}'],
  bookingCancellation: ['{{customerName}}', '{{serviceName}}', '{{startTime}}', '{{date}}', '{{reason}}'],
  lowStockAlert: ['{{productName}}', '{{currentStock}}', '{{threshold}}', '{{sku}}'],
  attendanceAlert: ['{{employeeName}}', '{{clockInTime}}', '{{expectedTime}}', '{{hours}}'],
};

// Attendance alerts are only ever sent by email (lib/notifications.ts
// sendAttendanceNotification has no SMS path) — don't offer an SMS template
// that would silently never be used.
const SMS_UNSUPPORTED_CATEGORIES: TemplateCategory[] = ['attendanceAlert'];

const SMS_SEGMENT_LENGTH = 160;

export default function NotificationTemplatesManager({ tenant, canManage = true, dict }: NotificationTemplatesManagerProps) {
  const [templates, setTemplates] = useState<Record<string, any>>({}); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<TemplateType>('email');
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Kept after close so the drawer title doesn't blank mid-animation.
  const [editing, setEditing] = useState<{ type: TemplateType; category: TemplateCategory } | null>(null);
  const [editorKey, setEditorKey] = useState(0);

  const nt = dict?.notificationTemplates;

  useEffect(() => {
    fetchTemplates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch(`/api/tenants/${tenant}/notification-templates`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setTemplates(data.data || {});
      } else {
        setLoadError(data.error || nt?.failedToLoad || 'Failed to load templates');
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setLoadError(error.message || nt?.failedToLoad || 'Failed to load templates');
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

  const openEditor = (type: TemplateType, category: TemplateCategory) => {
    setEditing({ type, category });
    setEditorKey((k) => k + 1);
    setDrawerOpen(true);
  };

  /** Returns an error message for the drawer, or null on success. */
  const handleSave = async (type: TemplateType, category: TemplateCategory, subject: string, body: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/tenants/${tenant}/notification-templates`, {
        method: 'PUT',
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
        showToast.success(nt?.templateSaved || 'Template saved successfully');
        setDrawerOpen(false);
        // The PUT responds with the full template map.
        if (data.data) setTemplates(data.data);
        else fetchTemplates();
        return null;
      }
      return data.error || nt?.failedToSave || 'Failed to save template';
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      return error.message || nt?.failedToSave || 'Failed to save template';
    }
  };

  const typeLabel = (type: TemplateType) => (type === 'email' ? (dict?.admin?.email || 'Email') : (dict?.admin?.sms || 'SMS'));
  const categories = (Object.keys(CATEGORY_VARIABLES) as TemplateCategory[])
    .filter((category) => activeType === 'email' || !SMS_UNSUPPORTED_CATEGORIES.includes(category));

  return (
    <>
      <div className="space-y-4">
        {/* Email / SMS tabs */}
        <div role="tablist" aria-label={nt?.templateTypes || 'Template type'} className="flex flex-wrap border border-gray-300 bg-white w-fit">
          {(['email', 'sms'] as TemplateType[]).map((type) => {
            const active = activeType === type;
            return (
              <button
                key={type}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveType(type)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  active ? 'bg-brand text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {typeLabel(type)}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
            <p className="mt-3 text-gray-400 text-sm">{nt?.loading || 'Loading templates…'}</p>
          </div>
        ) : loadError ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <p className="text-win8-danger text-sm font-medium">{loadError}</p>
            <button
              type="button"
              onClick={fetchTemplates}
              className="mt-4 inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
            >
              {dict?.common?.retry || 'Retry'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {categories.map((category) => {
              const body = getTemplate(activeType, category);
              const subject = activeType === 'email' ? getSubject(category) : '';
              const isCustom = body !== '';
              const label = getCategoryLabel(category, dict);
              return (
                <section key={category} className="bg-white border border-gray-300">
                  <div className="px-5 py-3 border-b border-gray-300 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <h2 className="text-sm font-bold text-gray-900 truncate">{label}</h2>
                      <span className={`px-2 py-0.5 text-xs font-semibold shrink-0 ${isCustom ? 'bg-brand text-white' : 'bg-gray-500 text-white'}`}>
                        {isCustom ? (nt?.customBadge || 'Custom') : (nt?.defaultBadge || 'Default')}
                      </span>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => openEditor(activeType, category)}
                        title={nt?.editTemplate || 'Edit template'}
                        aria-label={`${nt?.editTemplate || 'Edit template'}: ${label} (${typeLabel(activeType)})`}
                        className="inline-flex items-center justify-center p-2.5 text-white bg-brand hover:brightness-110 transition-[filter] shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="px-5 py-4 text-sm">
                    {isCustom ? (
                      <>
                        {subject && <p className="font-medium text-gray-900 mb-1">{subject}</p>}
                        <p className="text-gray-600 whitespace-pre-line line-clamp-4">{body}</p>
                      </>
                    ) : (
                      <p className="text-gray-400 italic">{nt?.usingDefault || 'Using the built-in default message.'}</p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <Win8Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        {editing && (
          <TemplateEditor
            key={editorKey}
            type={editing.type}
            category={editing.category}
            title={(nt?.editTemplateTitle || '{category} · {type}')
              .replace('{category}', getCategoryLabel(editing.category, dict))
              .replace('{type}', typeLabel(editing.type))}
            initialSubject={getSubject(editing.category)}
            initialBody={getTemplate(editing.type, editing.category)}
            onSave={(subject, body) => handleSave(editing.type, editing.category, subject, body)}
            onCancel={() => setDrawerOpen(false)}
            dict={dict}
          />
        )}
      </Win8Drawer>
    </>
  );
}

function TemplateEditor({
  type,
  category,
  title,
  initialSubject,
  initialBody,
  onSave,
  onCancel,
  dict,
}: {
  type: TemplateType;
  category: TemplateCategory;
  title: string;
  initialSubject: string;
  initialBody: string;
  onSave: (subject: string, body: string) => Promise<string | null>;
  onCancel: () => void;
  dict?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const nt = dict?.notificationTemplates;

  const insertVariable = (variable: string) => {
    const el = bodyRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const next = body.slice(0, start) + variable + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + variable.length, start + variable.length);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const error = await onSave(subject, body);
    setSaving(false);
    if (error) setFormError(error);
  };

  const segments = Math.max(1, Math.ceil(body.length / SMS_SEGMENT_LENGTH));

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
        <h2 className="text-base font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onCancel}
          title={nt?.close || 'Close'}
          aria-label={nt?.close || 'Close'}
          className="text-white/70 hover:text-white"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          {type === 'email' && (
            <div>
              <label htmlFor="template-subject" className="block text-xs font-medium text-gray-600 mb-1">
                {nt?.subject || 'Subject'}
              </label>
              <input
                id="template-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 text-sm"
                placeholder={nt?.emailSubjectPlaceholder || 'Email subject'}
              />
            </div>
          )}

          <div>
            <label htmlFor="template-body" className="block text-xs font-medium text-gray-600 mb-1">
              {type === 'email' ? (nt?.body || 'Body') : (nt?.message || 'Message')} <span className="text-win8-danger">*</span>
            </label>
            <textarea
              id="template-body"
              ref={bodyRef}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={type === 'email' ? 10 : 5}
              className="w-full border border-gray-300 px-3 py-2 text-sm resize-y"
              placeholder={type === 'email' ? (nt?.emailBodyPlaceholder || 'Email message body') : (nt?.smsBodyPlaceholder || 'SMS message body')}
            />
            <p className="text-xs text-gray-400 mt-1 tabular-nums">
              {(nt?.characterCount || '{count} characters').replace('{count}', body.length.toLocaleString())}
              {type === 'sms' && <> · {(nt?.smsSegments || '{count} SMS segment(s)').replace('{count}', String(segments))}</>}
            </p>
          </div>

          <hr className="border-gray-300" />

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {nt?.availableVariables || 'Available variables'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5 mb-2">
              {nt?.insertVariableHint || 'Click a variable to insert it at the cursor.'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_VARIABLES[category].map((variable) => (
                <button
                  key={variable}
                  type="button"
                  onClick={() => insertVariable(variable)}
                  className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-mono border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  {variable}
                </button>
              ))}
            </div>
          </div>

          {formError && <div className="bg-win8-danger text-white text-sm p-3">{formError}</div>}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100"
          >
            {dict?.common?.cancel || 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {saving ? (nt?.saving || 'Saving…') : (dict?.common?.save || 'Save')}
          </button>
        </div>
      </form>
    </>
  );
}
