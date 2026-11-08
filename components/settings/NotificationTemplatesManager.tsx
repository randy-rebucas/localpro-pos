'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Mail, MessageSquare, Pencil, RotateCcw } from 'lucide-react';
import { parseEmailTemplate } from '@/lib/notification-template-format';
import {
  MAX_TEMPLATE_LENGTH, PER_PRODUCT_CATEGORIES, TEMPLATE_SLOTS, slotVariables, unknownTemplateVariables,
  type TemplateCategory, type TemplateType,
} from '@/lib/notification-template-slots';
import { useConfirm } from '@/lib/confirm';
import { type TranslationDict } from '@/types/dictionary';
import {
  ICON, DARK_KEY, HINT, INPUT, KEY, KEY_PRIMARY, LABEL, ROW_KEY, Sheet, Strip,
} from '@/components/admin/register-ui';

export type TemplatesDict = TranslationDict & { notificationTemplates?: Record<string, string | undefined> };

type StoredTemplates = { email?: Record<string, string | undefined>; sms?: Record<string, string | undefined> };

/** A dark key while it is switched on. */
const DARK_KEY_ON = 'flex min-h-[44px] items-center justify-center gap-2 border border-paper-white bg-paper-white px-4 font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink touch-manipulation';

const SMS_SEGMENT = 160;

const categoryLabel = (category: TemplateCategory, dict: TemplatesDict): string => {
  const fallback: Record<TemplateCategory, string> = {
    bookingConfirmation: 'Booking Confirmation',
    bookingReminder: 'Booking Reminder',
    bookingCancellation: 'Booking Cancellation',
    lowStockAlert: 'Low Stock Alert',
    attendanceAlert: 'Attendance Alert',
  };
  return dict.notificationTemplates?.[category] || fallback[category];
};

/**
 * Email and SMS templates as message slips: one per slot, showing the custom text or
 * saying the built-in message is sent. Editing happens on a paper sheet with the
 * variables the sender really fills.
 */
export default function NotificationTemplatesManager({ tenant, dict, emailOn, smsOn, settingsHref }: {
  tenant: string;
  dict: TemplatesDict;
  /** Whether the tenant has email / SMS notifications switched on in Settings. */
  emailOn: boolean;
  smsOn: boolean;
  settingsHref: string;
}) {
  const nt = (key: string, fallback: string) => dict.notificationTemplates?.[key] || fallback;
  const [templates, setTemplates] = useState<StoredTemplates>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [activeType, setActiveType] = useState<TemplateType>('email');
  const [editing, setEditing] = useState<TemplateCategory | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const { confirm, Dialog: ConfirmDialog } = useConfirm();

  // Read the dictionary through a ref so its arrival does not refetch.
  const dictRef = useRef(dict);
  dictRef.current = dict;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tenants/${tenant}/notification-templates`, { credentials: 'include' });
        const data = await res.json();
        if (cancelled) return;
        if (data.success) setTemplates(data.data || {});
        else setLoadError(data.error || dictRef.current.notificationTemplates?.failedToLoad || 'Failed to load templates');
      } catch {
        if (!cancelled) setLoadError(dictRef.current.notificationTemplates?.failedToLoad || 'Failed to load templates');
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [tenant]);

  const stored = (type: TemplateType, category: TemplateCategory) => templates[type]?.[category];
  const readSlot = (type: TemplateType, category: TemplateCategory) => {
    const raw = stored(type, category);
    if (typeof raw !== 'string' || !raw) return null;
    return type === 'email' ? parseEmailTemplate(raw) : { subject: null, body: raw };
  };

  const save = async (payload: Record<string, unknown>): Promise<string | null> => {
    try {
      const res = await fetch(`/api/tenants/${tenant}/notification-templates`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setTemplates(data.data || {});
        return null;
      }
      return data.error || nt('failedToSave', 'Failed to save template');
    } catch {
      return nt('failedToSave', 'Failed to save template');
    }
  };

  const handleReset = async (category: TemplateCategory) => {
    const ok = await confirm(
      nt('resetTitle', 'Go back to the built-in message?'),
      nt('resetConfirm', 'Your custom text for {name} is removed and the built-in message is sent instead.').replace('{name}', categoryLabel(category, dict)),
      { variant: 'warning', confirmText: nt('resetToBuiltIn', 'Use built-in'), cancelText: dict.common?.cancel || 'Cancel' }
    );
    if (!ok) return;
    setResetting(category);
    const error = await save({ type: activeType, category, reset: true });
    setResetting(null);
    if (error) toast.error(error);
    else toast.success(nt('templateReset', 'Built-in message restored'));
  };

  const categories = TEMPLATE_SLOTS[activeType] as readonly TemplateCategory[];
  const customCount = (TEMPLATE_SLOTS.email as readonly TemplateCategory[]).filter((c) => readSlot('email', c)).length
    + (TEMPLATE_SLOTS.sms as readonly TemplateCategory[]).filter((c) => readSlot('sms', c)).length;
  const channelOff = activeType === 'email' ? !emailOn : !smsOn;

  return (
    <div className="mt-6">
      {ConfirmDialog}

      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto flex gap-2" role="group" aria-label={nt('channel', 'Channel')}>
          {(['email', 'sms'] as const).map((type) => {
            const Icon = type === 'email' ? Mail : MessageSquare;
            return (
              <button
                key={type}
                type="button"
                aria-pressed={activeType === type}
                onClick={() => { setActiveType(type); setEditing(null); }}
                className={activeType === type ? DARK_KEY_ON : DARK_KEY}
              >
                <Icon className={ICON} strokeWidth={1.75} aria-hidden />
                {type === 'email' ? (dict.admin?.email || 'Email') : (dict.admin?.sms || 'SMS')}
              </button>
            );
          })}
        </div>
        {loaded && !loadError && (
          <p className="font-receipt text-xs uppercase tracking-[0.08em] text-white/60">
            {nt('customCount', '{n} custom').replace('{n}', String(customCount))}
          </p>
        )}
      </div>

      {channelOff && (
        <div className="mt-4">
          <Strip tone="error">
            {activeType === 'email'
              ? nt('emailOff', 'Email notifications are switched off, so none of these emails are sent.')
              : nt('smsOff', 'SMS notifications are switched off, so none of these texts are sent.')}{' '}
            <a href={settingsHref} className="font-semibold underline underline-offset-2">{nt('openSettings', 'Open Settings')}</a>
          </Strip>
        </div>
      )}

      {!loaded ? (
        <p className="mt-6 font-receipt text-sm text-white/60">{nt('loading', 'Loading templates...')}</p>
      ) : loadError ? (
        <div className="mt-6"><Strip tone="error">{loadError}</Strip></div>
      ) : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {categories.map((category) => {
            const slot = readSlot(activeType, category);
            const label = categoryLabel(category, dict);
            return (
              <li key={category} className="flex min-w-0 flex-col">
                <div className="flex flex-1 flex-col bg-paper-white text-ink">
                  <div className={`flex items-center justify-between gap-2 px-4 py-1.5 font-receipt text-[11px] font-medium uppercase tracking-[0.08em] ${slot ? 'bg-brand text-ink' : 'bg-ink/10 text-ink/60'}`}>
                    <span>{activeType === 'email' ? (dict.admin?.email || 'Email') : (dict.admin?.sms || 'SMS')}</span>
                    <span>{slot ? nt('custom', 'Custom') : nt('builtIn', 'Built-in')}</span>
                  </div>
                  <div className="flex-1 px-4 pb-4 pt-3">
                    <h3 className="font-display text-2xl font-bold uppercase leading-none sm:text-3xl">{label}</h3>
                    {slot ? (
                      <div className="mt-3 border-t border-dashed border-ink/30 pt-3 font-receipt text-xs">
                        {activeType === 'email' && slot.subject && (
                          <p className="mb-2 break-words"><span className="text-ink/50">{nt('subject', 'Subject')}:</span> {slot.subject}</p>
                        )}
                        <p className="line-clamp-6 whitespace-pre-wrap break-words text-ink/80">{slot.body}</p>
                      </div>
                    ) : (
                      <p className="mt-3 border-t border-dashed border-ink/30 pt-3 font-receipt text-xs text-ink/60">
                        {nt('builtInNote', 'No custom text. The built-in message is sent.')}
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end border-t border-dashed border-ink/25">
                    {slot && (
                      <button
                        type="button"
                        disabled={resetting === category}
                        onClick={() => handleReset(category)}
                        className={`${ROW_KEY} mr-auto w-auto gap-2 px-3 font-receipt text-xs uppercase disabled:opacity-40`}
                      >
                        <RotateCcw className={ICON} strokeWidth={1.75} aria-hidden />
                        {nt('resetToBuiltIn', 'Use built-in')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditing(category)}
                      className={`${ROW_KEY} w-auto gap-2 px-3 font-receipt text-xs uppercase`}
                      aria-label={`${dict.common?.edit || 'Edit'} ${label}`}
                    >
                      <Pencil className={ICON} strokeWidth={1.75} aria-hidden />
                      {dict.common?.edit || 'Edit'}
                    </button>
                  </div>
                </div>
                <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <TemplateSheet
          type={activeType}
          category={editing}
          initialSubject={readSlot(activeType, editing)?.subject || ''}
          initialBody={readSlot(activeType, editing)?.body || ''}
          dict={dict}
          onClose={() => setEditing(null)}
          onSave={async (subject, body) => {
            const error = await save({ type: activeType, category: editing, subject: activeType === 'email' ? subject : undefined, body });
            if (!error) {
              toast.success(nt('templateSaved', 'Template saved successfully'));
              setEditing(null);
            }
            return error;
          }}
        />
      )}
    </div>
  );
}

/** Write one template, with the variables its sender fills as keys that insert at the cursor. */
function TemplateSheet({ type, category, initialSubject, initialBody, dict, onClose, onSave }: {
  type: TemplateType;
  category: TemplateCategory;
  initialSubject: string;
  initialBody: string;
  dict: TemplatesDict;
  onClose: () => void;
  onSave: (subject: string, body: string) => Promise<string | null>;
}) {
  const nt = (key: string, fallback: string) => dict.notificationTemplates?.[key] || fallback;
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const vars = slotVariables(type, category);
  const unknown = [
    ...unknownTemplateVariables(body, vars.body),
    ...(type === 'email' ? unknownTemplateVariables(subject, vars.subject) : []),
  ];
  const max = MAX_TEMPLATE_LENGTH[type];
  const segments = Math.max(1, Math.ceil(body.length / SMS_SEGMENT));

  const insert = (name: string) => {
    const token = `{{${name}}}`;
    const el = bodyRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!body.trim()) { setError(nt('bodyRequired', 'Write the message first, or use the built-in one.')); return; }
    setSaving(true);
    setError('');
    const err = await onSave(subject, body);
    setSaving(false);
    if (err) setError(err);
  };

  return (
    <Sheet
      wide
      title={categoryLabel(category, dict)}
      subtitle={type === 'email' ? (dict.admin?.email || 'Email') : (dict.admin?.sms || 'SMS')}
      onClose={onClose}
      closeLabel={dict.common?.close || 'Close'}
      footer={
        <>
          <button type="button" onClick={onClose} className={KEY}>{dict.common?.cancel || 'Cancel'}</button>
          <button type="submit" form="template-form" disabled={saving} className={KEY_PRIMARY}>
            {saving ? (dict.common?.saving || 'Saving...') : (dict.common?.save || 'Save')}
          </button>
        </>
      }
    >
      <form id="template-form" onSubmit={handleSubmit} className="space-y-4">
        {type === 'email' && (
          <div>
            <label htmlFor="template-subject" className={LABEL}>{nt('subject', 'Subject')}</label>
            <input
              id="template-subject"
              type="text"
              value={subject}
              maxLength={MAX_TEMPLATE_LENGTH.subject}
              onChange={(e) => setSubject(e.target.value.replace(/\|/g, ''))}
              className={`${INPUT} font-receipt`}
              placeholder={nt('emailSubjectPlaceholder', 'Email subject')}
            />
            <p className={HINT}>
              {nt('subjectVariables', 'The subject can use')}: {vars.subject.map((v) => `{{${v}}}`).join(' ')}
            </p>
          </div>
        )}
        <div>
          <label htmlFor="template-body" className={LABEL}>
            {type === 'email' ? nt('body', 'Body') : nt('message', 'Message')}
          </label>
          <textarea
            id="template-body"
            ref={bodyRef}
            value={body}
            maxLength={max}
            onChange={(e) => setBody(e.target.value)}
            rows={type === 'email' ? 9 : 4}
            className={`${INPUT} font-receipt`}
            placeholder={type === 'email' ? nt('emailBodyPlaceholder', 'Email message body') : nt('smsBodyPlaceholder', 'SMS message body')}
          />
          <p className={`${HINT} flex flex-wrap justify-between gap-2`}>
            <span>
              {PER_PRODUCT_CATEGORIES.includes(category)
                ? nt('perProductHint', 'Sent once per low-stock product, so write it as a single line.')
                : ' '}
            </span>
            <span>
              {type === 'sms'
                ? nt('smsCount', '{chars} characters · {parts} SMS').replace('{chars}', String(body.length)).replace('{parts}', String(segments))
                : `${body.length}/${max}`}
            </span>
          </p>
        </div>

        <div>
          <p className={LABEL}>{nt('availableVariables', 'Available variables')}</p>
          <div className="flex flex-wrap gap-2">
            {vars.body.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => insert(v)}
                className="flex min-h-[36px] items-center border border-ink/25 bg-paper px-2 font-receipt text-xs text-ink transition-colors hover:border-ink"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
          <p className={HINT}>{nt('variablesHint', 'Tap a variable to insert it. Wrap optional lines in {{#if name}} … {{/if}}.')}</p>
        </div>

        {unknown.length > 0 && (
          <Strip tone="error">
            {nt('unknownVariables', 'These are never filled for this message and will print blank:')}{' '}
            <span className="font-semibold">{[...new Set(unknown)].map((v) => `{{${v}}}`).join(' ')}</span>
          </Strip>
        )}
        {error && <Strip tone="error">{error}</Strip>}
      </form>
    </Sheet>
  );
}
