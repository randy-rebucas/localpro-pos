'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarPlus, Copy, Trash2 } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  ICON, DARK_KEY, DARK_KEY_PRIMARY, HINT, INPUT, INPUT_BASE, KEY, LABEL, ROW_KEY,
  LedReadout, RegisterPage, Strip,
} from '@/components/admin/register-ui';
import type { BusinessHours } from '@/lib/business-hours';
import type { ITenantSettings } from '@/types/tenant';

type Dict = Record<string, Record<string, string | undefined> | undefined>;
type DaySchedule = { enabled: boolean; openTime?: string; closeTime?: string; breaks?: Array<{ start: string; end: string }> };
type SpecialDay = { date: string; enabled: boolean; openTime?: string; closeTime?: string; note?: string };

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DEFAULT_DAY: DaySchedule = { enabled: false, openTime: '09:00', closeTime: '17:00' };
const toMin = (t?: string) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : NaN);

/** The weekday, date and minute of the day right now in a time zone. */
function nowIn(timeZone: string) {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value])
    );
    return { day: parts.weekday.toLowerCase(), date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
  } catch {
    return null;
  }
}

/** Whether the door is open now by these hours: special dates first, then the week, including last night's late hours. */
function openNow(schedule: Record<string, DaySchedule>, special: SpecialDay[], timeZone: string): boolean | null {
  const now = nowIn(timeZone);
  if (!now) return null;
  const within = (open?: string, close?: string) => {
    const o = toMin(open), c = toMin(close);
    if (Number.isNaN(o) || Number.isNaN(c)) return false;
    return o < c ? now.minute >= o && now.minute < c : now.minute >= o;
  };
  const sp = special.find((s) => s.date === now.date);
  if (sp) return sp.enabled && within(sp.openTime, sp.closeTime);
  const today = schedule[now.day];
  if (today?.enabled && within(today.openTime, today.closeTime)) return true;
  const yesterday = schedule[DAYS[(DAYS.indexOf(now.day as (typeof DAYS)[number]) + 6) % 7]];
  if (yesterday?.enabled && toMin(yesterday.closeTime) < toMin(yesterday.openTime) && now.minute < toMin(yesterday.closeTime)) return true;
  return false;
}

function timeZones(current: string): string[] {
  const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  return all.includes(current) ? all : [current, ...all];
}

/**
 * The shop-door hours sign: the week on one card, the dates that differ pinned beside it,
 * and one save that replaces both.
 */
export default function BusinessHoursManager({ settings, tenant, dict, canManage, header, onSaved }: {
  settings: ITenantSettings;
  tenant: string;
  dict: Dict;
  canManage: boolean;
  header: { tag?: string; title: string; subtitle?: string };
  onSaved: (hours: BusinessHours) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Saving replaces the whole schedule, so never save on top of a failed load
  // (the editor would be showing an empty schedule, not the stored one).
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [schedule, setSchedule] = useState<Record<string, DaySchedule>>({});
  const [special, setSpecial] = useState<SpecialDay[]>([]);
  const [timezone, setTimezone] = useState('');
  const [saved, setSaved] = useState('');

  const dictRef = useRef(dict);
  dictRef.current = dict;
  const bh = (key: string, fallback: string) => dict.businessHours?.[key] || fallback;

  const snapshot = (s: typeof schedule, sp: typeof special, tz: string) => JSON.stringify({ s, sp, tz });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/tenants/${tenant}/business-hours`, { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        const hours: BusinessHours = data.data || {};
        const week: Record<string, DaySchedule> = {};
        for (const d of DAYS) week[d] = { ...DEFAULT_DAY, ...(hours.schedule?.[d] || {}) };
        const sp = [...(hours.specialHours || [])].sort((a, b) => a.date.localeCompare(b.date));
        const tz = hours.timezone || settings.timezone || 'Asia/Manila';
        setSchedule(week);
        setSpecial(sp);
        setTimezone(tz);
        setSaved(snapshot(week, sp, tz));
      } else {
        setLoadError(data?.error || dictRef.current.businessHours?.failedToLoad || 'Failed to load business hours');
      }
    } catch {
      setLoadError(dictRef.current.businessHours?.failedToLoad || 'Failed to load business hours');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = !loading && !loadError && snapshot(schedule, special, timezone) !== saved;
  const status = useMemo(() => (timezone ? openNow(schedule, special, timezone) : null), [schedule, special, timezone]);
  const zones = useMemo(() => (timezone ? timeZones(timezone) : []), [timezone]);

  // Warn before leaving with unsaved hours.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const dayName = (d: string) => bh(d, d.charAt(0).toUpperCase() + d.slice(1));
  const setDay = (day: string, patch: Partial<DaySchedule>) => setSchedule((s) => ({ ...s, [day]: { ...s[day], ...patch } }));
  const setSpecialAt = (i: number, patch: Partial<SpecialDay>) => setSpecial((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const copyToOpenDays = (from: string) => {
    const src = schedule[from];
    setSchedule((s) => Object.fromEntries(DAYS.map((d) => [d, s[d].enabled ? { ...s[d], openTime: src.openTime, closeTime: src.closeTime } : s[d]])));
  };

  /** Mirrors the server's checks so the message names the day in the right language. */
  const validate = (): string => {
    for (const d of DAYS) {
      const e = schedule[d];
      if (e.enabled && (!e.openTime || !e.closeTime)) return bh('hoursMissing', 'Set opening and closing times for {day}').replace('{day}', dayName(d));
      if (e.enabled && e.openTime === e.closeTime) return bh('hoursSameTime', 'Opening and closing times are the same on {day}').replace('{day}', dayName(d));
    }
    const seen = new Set<string>();
    for (const s of special) {
      if (!s.date) return bh('specialDateMissing', 'Every special date needs a date');
      if (seen.has(s.date)) return bh('specialDateDuplicate', '{date} is listed twice').replace('{date}', s.date);
      seen.add(s.date);
      if (s.enabled && (!s.openTime || !s.closeTime)) return bh('hoursMissing', 'Set opening and closing times for {day}').replace('{day}', s.date);
      if (s.enabled && s.openTime === s.closeTime) return bh('hoursSameTime', 'Opening and closing times are the same on {day}').replace('{day}', s.date);
    }
    return '';
  };

  const handleSave = async () => {
    if (saving || loadError) return;
    const problem = validate();
    setFormError(problem);
    if (problem) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenant}/business-hours`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ schedule, specialHours: special, timezone }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        const sp = [...special].sort((a, b) => a.date.localeCompare(b.date));
        setSpecial(sp);
        setSaved(snapshot(schedule, sp, timezone));
        onSaved(data.data);
        toast.success(bh('savedSuccessfully', 'Business hours saved'));
      } else {
        setFormError(data?.error || bh('failedToSave', 'Failed to save business hours'));
      }
    } catch {
      setFormError(bh('failedToSave', 'Failed to save business hours'));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !saved && !loadError) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const openDays = DAYS.filter((d) => schedule[d]?.enabled).length;
  const closedLabel = bh('closed', 'Closed');
  const removeLabel = bh('remove', 'Remove');
  const side = status === null ? undefined : (
    <LedReadout value={status ? bh('ledOpen', 'OPEN') : bh('ledClosed', 'SHUT')} label={bh('rightNow', 'Right now')} />
  );

  return (
    <RegisterPage tagNo="HR" tag={header.tag} title={header.title} subtitle={header.subtitle} side={side}>
      {loadError && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Strip tone="error">{loadError}</Strip>
          <button type="button" onClick={load} className={DARK_KEY}>{bh('tryAgain', 'Try again')}</button>
        </div>
      )}
      {!canManage && !loadError && (
        <div className="mt-6"><Strip tone="ok">{bh('readOnly', 'You can view these hours. Ask a manager to change them.')}</Strip></div>
      )}

      {!loadError && (
        <fieldset disabled={!canManage || saving} className="mt-6 grid min-w-0 gap-6 xl:grid-cols-12">
          {/* The sign on the door */}
          <section className="min-w-0 xl:col-span-7">
            <div className="border-4 border-ink bg-paper-white text-ink">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-4 border-ink px-4 py-3 sm:px-5">
                <h2 className="text-4xl sm:text-5xl">{bh('weeklySchedule', 'Weekly Schedule')}</h2>
                <span className="font-receipt text-xs uppercase tracking-[0.08em] text-ink/60">
                  {bh('openDaysCount', '{n} days open').replace('{n}', String(openDays))}
                </span>
              </div>
              <ul className="divide-y divide-dashed divide-ink/25">
                {DAYS.map((d) => {
                  const e = schedule[d] || DEFAULT_DAY;
                  const overnight = e.enabled && toMin(e.closeTime) < toMin(e.openTime);
                  return (
                    <li key={d} className="px-4 py-2.5 sm:px-5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="w-28 shrink-0 font-display text-2xl font-bold uppercase leading-none">{dayName(d)}</span>
                        <div role="group" aria-label={dayName(d)} className="flex">
                          {[true, false].map((on) => (
                            <button
                              key={String(on)}
                              type="button"
                              aria-pressed={e.enabled === on}
                              onClick={() => setDay(d, { enabled: on })}
                              className={`min-h-[44px] border px-3 font-receipt text-[11px] font-medium uppercase tracking-[0.08em] transition-colors disabled:cursor-not-allowed ${e.enabled === on ? (on ? 'border-brand bg-brand text-ink' : 'border-ink bg-ink text-paper-white') : 'border-ink/25 text-ink/60 hover:bg-paper'} ${on ? '' : '-ml-px'}`}
                            >
                              {on ? bh('open', 'Open') : closedLabel}
                            </button>
                          ))}
                        </div>
                        {e.enabled ? (
                          <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
                            <label className="sr-only" htmlFor={`bh-${d}-open`}>{`${dayName(d)} ${bh('openTime', 'Open Time')}`}</label>
                            <input id={`bh-${d}-open`} type="time" value={e.openTime || ''} onChange={(ev) => setDay(d, { openTime: ev.target.value })} className={`${INPUT_BASE} w-[9rem] px-2 sm:w-[9.75rem] sm:px-3 font-receipt`} />
                            <span aria-hidden className="font-receipt text-ink/50">–</span>
                            <label className="sr-only" htmlFor={`bh-${d}-close`}>{`${dayName(d)} ${bh('closeTime', 'Close Time')}`}</label>
                            <input id={`bh-${d}-close`} type="time" value={e.closeTime || ''} onChange={(ev) => setDay(d, { closeTime: ev.target.value })} className={`${INPUT_BASE} w-[9rem] px-2 sm:w-[9.75rem] sm:px-3 font-receipt`} />
                            {canManage && (
                              <button type="button" onClick={() => copyToOpenDays(d)} className={ROW_KEY} title={bh('copyToOpenDays', 'Use these hours on every open day')} aria-label={`${bh('copyToOpenDays', 'Use these hours on every open day')}: ${dayName(d)}`}>
                                <Copy className={ICON} strokeWidth={1.75} aria-hidden />
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                      {(overnight || (e.enabled && e.breaks?.length)) && (
                        <p className="mt-1 font-receipt text-[11px] text-ink/60 sm:pl-[7.75rem]">
                          {overnight && bh('closesNextDay', 'Closes after midnight')}
                          {overnight && e.breaks?.length ? ' · ' : ''}
                          {e.breaks?.length ? `${bh('breaks', 'Breaks')}: ${e.breaks.map((b) => `${b.start}–${b.end}`).join(', ')}` : ''}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-4 max-w-sm">
              <label htmlFor="bh-timezone" className="mb-1 block font-receipt text-xs font-medium uppercase tracking-[0.08em] text-white/60">{bh('timezone', 'Timezone')}</label>
              <select id="bh-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} className={`${INPUT} font-receipt`}>
                {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
              </select>
              {settings.timezone && settings.timezone !== timezone && (
                <p className="mt-1 font-receipt text-xs text-[#8fe3d0]">
                  {bh('storeZoneDiffers', 'Your store time zone in Settings is {zone}.').replace('{zone}', settings.timezone.replace(/_/g, ' '))}
                </p>
              )}
            </div>
          </section>

          {/* Notices pinned beside the sign: dates that differ from the week */}
          <section className="min-w-0 xl:col-span-5">
            <div className="bg-paper-white text-ink">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-ink/30 px-4 py-3 sm:px-5">
                <h2 className="text-3xl">{bh('specialHours', 'Special Hours')}</h2>
                {canManage && (
                  <button type="button" onClick={() => setSpecial((l) => [...l, { date: '', enabled: false, openTime: '09:00', closeTime: '17:00', note: '' }])} className={KEY}>
                    <CalendarPlus className={ICON} strokeWidth={1.75} aria-hidden />
                    {bh('addDate', 'Add date')}
                  </button>
                )}
              </div>
              {special.length === 0 ? (
                <p className="px-4 py-8 text-center font-receipt text-sm text-ink/60 sm:px-5">
                  {bh('noSpecialHours', 'No special hours configured. Add special hours for holidays or special events.')}
                </p>
              ) : (
                <ul className="divide-y divide-dashed divide-ink/20">
                  {special.map((s, i) => (
                    <li key={i} className="space-y-2 px-4 py-3 sm:px-5">
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                          <label htmlFor={`bh-sp-${i}-date`} className={LABEL}>{bh('date', 'Date')}</label>
                          <input id={`bh-sp-${i}-date`} type="date" value={s.date} onChange={(e) => setSpecialAt(i, { date: e.target.value })} className={`${INPUT} font-receipt`} />
                        </div>
                        <div role="group" aria-label={bh('date', 'Date')} className="mr-auto flex sm:mr-0">
                          {[true, false].map((on) => (
                            <button
                              key={String(on)}
                              type="button"
                              aria-pressed={s.enabled === on}
                              onClick={() => setSpecialAt(i, { enabled: on })}
                              className={`min-h-[44px] border px-3 font-receipt text-[11px] font-medium uppercase tracking-[0.08em] transition-colors ${s.enabled === on ? (on ? 'border-brand bg-brand text-ink' : 'border-ink bg-ink text-paper-white') : 'border-ink/25 text-ink/60 hover:bg-paper'} ${on ? '' : '-ml-px'}`}
                            >
                              {on ? bh('open', 'Open') : closedLabel}
                            </button>
                          ))}
                        </div>
                        {canManage && (
                          <button type="button" onClick={() => setSpecial((l) => l.filter((_, j) => j !== i))} className={`${ROW_KEY} hover:text-stamp`} aria-label={`${removeLabel} ${s.date}`} title={removeLabel}>
                            <Trash2 className={ICON} strokeWidth={1.75} aria-hidden />
                          </button>
                        )}
                      </div>
                      {s.enabled && (
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="sr-only" htmlFor={`bh-sp-${i}-open`}>{bh('openTime', 'Open Time')}</label>
                          <input id={`bh-sp-${i}-open`} type="time" value={s.openTime || ''} onChange={(e) => setSpecialAt(i, { openTime: e.target.value })} className={`${INPUT_BASE} w-[9rem] px-2 sm:w-[9.75rem] sm:px-3 font-receipt`} />
                          <span aria-hidden className="font-receipt text-ink/50">–</span>
                          <label className="sr-only" htmlFor={`bh-sp-${i}-close`}>{bh('closeTime', 'Close Time')}</label>
                          <input id={`bh-sp-${i}-close`} type="time" value={s.closeTime || ''} onChange={(e) => setSpecialAt(i, { closeTime: e.target.value })} className={`${INPUT_BASE} w-[9rem] px-2 sm:w-[9.75rem] sm:px-3 font-receipt`} />
                        </div>
                      )}
                      <div>
                        <label htmlFor={`bh-sp-${i}-note`} className="sr-only">{bh('noteOptional', 'Note (Optional)')}</label>
                        <input id={`bh-sp-${i}-note`} type="text" maxLength={100} value={s.note || ''} onChange={(e) => setSpecialAt(i, { note: e.target.value })} className={INPUT} placeholder={bh('noteOptional', 'Note (Optional)')} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
            <p className={`${HINT} text-white/60`}>{bh('specialHint', 'A date listed here replaces that weekday’s hours.')}</p>
          </section>
        </fieldset>
      )}

      {canManage && !loadError && (
        <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-white/10 bg-brand-navy-deep/95 px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {formError && <div className="mr-auto min-w-0 flex-1"><Strip tone="error">{formError}</Strip></div>}
          {!formError && dirty && <span className="mr-auto font-receipt text-xs uppercase tracking-[0.08em] text-[#8fe3d0]">{bh('unsaved', 'Unsaved changes')}</span>}
          <button type="button" onClick={handleSave} disabled={saving || !dirty} className={`${DARK_KEY_PRIMARY} disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand`}>
            {saving ? bh('saving', 'Saving...') : bh('saveBusinessHours', 'Save Business Hours')}
          </button>
        </div>
      )}
    </RegisterPage>
  );
}
