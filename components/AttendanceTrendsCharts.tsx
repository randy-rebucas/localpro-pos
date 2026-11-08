'use client';

import { memo, useMemo } from 'react';
import { useReducedMotion } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { toTenantDateString } from '@/lib/timezone';
import { formatHours } from '@/lib/attendance-helpers';
import { type TranslationDict } from '@/types/dictionary';
import { type AttendanceRecord } from '@/hooks/useAttendance';

const CHART_INK = '#10202b';
const CHART_BAR = '#2d868a';
const CHART_TICK = { fontFamily: 'var(--mk-font-receipt)', fontSize: 12, fill: CHART_INK, fillOpacity: 0.6 };

interface Day { day: string; label: string; hours: number; shifts: number }

function DayTooltip({ active, payload, shiftsLabel }: {
  active?: boolean;
  payload?: readonly { payload?: Day }[];
  shiftsLabel: string;
}) {
  const day = payload?.[0]?.payload;
  if (!active || !day) return null;
  return (
    <div className="border border-ink bg-paper-white px-3 py-2 font-receipt text-xs text-ink">
      <p className="font-semibold">{day.label}</p>
      <p className="mt-1 text-sm font-semibold">{formatHours(day.hours)}</p>
      <p className="text-ink/60">{shiftsLabel}: {day.shifts}</p>
    </div>
  );
}

/**
 * Hours worked over the period: a bar per store day, and the employees who worked the most.
 * Only finished shifts count, since an open shift has no total yet.
 */
export default memo(function AttendanceTrendsCharts({ attendances, dict, lang }: {
  attendances: AttendanceRecord[];
  dict: TranslationDict;
  lang: 'en' | 'es';
}) {
  const { settings } = useTenantSettings();
  const timeZone = (settings || getDefaultTenantSettings()).timezone || 'Asia/Manila';
  const reduceMotion = useReducedMotion();

  const { days, people } = useMemo(() => {
    const byDay = new Map<string, Day>();
    const byPerson = new Map<string, { id: string; name: string; hours: number }>();
    const fmt = new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    for (const a of attendances) {
      if (!a.totalHours) continue;
      const day = toTenantDateString(a.clockIn, timeZone);
      const entry = byDay.get(day) || { day, label: fmt.format(new Date(`${day}T12:00:00Z`)), hours: 0, shifts: 0 };
      entry.hours += a.totalHours;
      entry.shifts += 1;
      byDay.set(day, entry);

      const id = typeof a.userId === 'object' ? a.userId._id : a.userId;
      const name = typeof a.userId === 'object' ? a.userId.name : dict.admin?.unknown || 'Unknown';
      const person = byPerson.get(id) || { id, name, hours: 0 };
      person.hours += a.totalHours;
      byPerson.set(id, person);
    }
    return {
      // 'YYYY-MM-DD' sorts as text, whatever date format the store prints.
      days: [...byDay.values()].sort((x, y) => x.day.localeCompare(y.day)).map((d) => ({ ...d, hours: Math.round(d.hours * 100) / 100 })),
      people: [...byPerson.values()].sort((x, y) => y.hours - x.hours).slice(0, 8),
    };
  }, [attendances, timeZone, lang, dict]);

  if (days.length === 0) return null;
  const top = people[0]?.hours || 1;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12">
      <div className="p-4 sm:p-5 xl:col-span-8">
        <h3 className="mb-3 font-receipt text-xs uppercase tracking-[0.14em] text-ink/60">{dict.admin?.dailyHoursWorked || 'Daily Hours Worked'}</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART_INK} strokeOpacity={0.12} strokeDasharray="2 4" />
            <XAxis dataKey="label" tick={CHART_TICK} tickLine={false} axisLine={{ stroke: CHART_INK, strokeOpacity: 0.3 }} minTickGap={16} />
            <YAxis tickFormatter={(v: number) => `${v}h`} tick={CHART_TICK} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: CHART_INK, fillOpacity: 0.06 }}
              content={(props) => (
                <DayTooltip
                  active={props.active}
                  payload={props.payload as Parameters<typeof DayTooltip>[0]['payload']}
                  shiftsLabel={dict.admin?.shifts || 'Shifts'}
                />
              )}
            />
            <Bar dataKey="hours" fill={CHART_BAR} maxBarSize={28} isAnimationActive={!reduceMotion} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="border-t border-dashed border-ink/30 p-4 sm:p-5 xl:col-span-4 xl:border-l xl:border-t-0">
        <h3 className="mb-3 font-receipt text-xs uppercase tracking-[0.14em] text-ink/60">{dict.admin?.hoursByEmployee || 'Hours by Employee'}</h3>
        <ul className="space-y-3">
          {people.map((p) => (
            <li key={p.id} className="font-receipt text-sm">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 truncate" title={p.name}>{p.name}</span>
                <span className="mk-leader" aria-hidden />
                <span className="whitespace-nowrap font-medium">{formatHours(p.hours)}</span>
              </div>
              <div className="mt-1 h-2 bg-ink/10" aria-hidden>
                <div className="h-full bg-brand-hover" style={{ width: `${Math.max(2, (p.hours / top) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
});
