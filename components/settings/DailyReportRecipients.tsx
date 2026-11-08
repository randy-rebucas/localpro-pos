'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

interface DailyReportRecipientsProps {
  tenant: string;
  labels?: Record<string, unknown>;
  /** Off when the page prints its own heading above this block. */
  showTitle?: boolean;
}

const LABEL = 'mb-1 block font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/70';
const INPUT = 'w-full min-h-[44px] border-2 border-ink/25 bg-paper-white px-3 py-2 font-receipt text-sm text-ink placeholder:text-ink/45 focus:border-ink focus:outline-none disabled:opacity-60';

/** Saves on its own because recipients are kept apart from the publicly readable tenant settings. */
export default function DailyReportRecipients({ tenant, labels, showTitle = true }: DailyReportRecipientsProps) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const text = (key: string, fallback: string) => {
    const value = labels?.[key];
    return typeof value === 'string' ? value : fallback;
  };

  useEffect(() => {
    let active = true;
    fetch(`/api/tenants/${tenant}/daily-report`, { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (!active || !json.success) return;
        setEmail(json.data.email);
        setPhone(json.data.phone);
        setLoaded(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [tenant]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenant}/daily-report`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone }),
      });
      const json = await res.json();
      if (json.success) {
        setEmail(json.data.email);
        setPhone(json.data.phone);
        toast.success(text('saved', 'Settings saved'));
      } else {
        toast.error(json.error || text('error', 'Failed to save settings'));
      }
    } catch {
      toast.error(text('error', 'Failed to save settings'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {showTitle && <h3 className="mb-1 text-lg font-semibold text-ink">{text('dailyReportTitle', 'Daily Sales Report')}</h3>}
      <div className="space-y-4">
        <p className="text-sm text-ink/60">
          {text('dailyReportDesc', "Sent shortly after midnight once the day's Z-Reading is ready. Leave both blank to stop it.")}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="dailyReportEmail" className={LABEL}>
              {text('dailyReportEmail', 'Send by email')}
            </label>
            <input id="dailyReportEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!loaded} className={INPUT} />
          </div>
          <div>
            <label htmlFor="dailyReportPhone" className={LABEL}>
              {text('dailyReportPhone', 'Send by SMS')}
            </label>
            <input id="dailyReportPhone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!loaded} placeholder="+639171234567" className={INPUT} />
            <p className="text-xs text-ink/60 mt-1">
              {text('dailyReportPhoneHint', 'Use the international format, such as +639171234567. Each text is billed.')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={!loaded || saving}
          className="min-h-[44px] border border-ink/25 px-5 font-receipt text-xs font-medium uppercase text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {text('save', 'Save')}
        </button>
      </div>
    </div>
  );
}
