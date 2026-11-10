'use client';

import { useState } from 'react';
import { Activity, Database } from 'lucide-react';
import {
  ICON, KEY, KEY_PRIMARY, LedStat, SaPage, Slip, Strip, TABLE, TBODY, TD, TD_RIGHT, TH, TH_RIGHT, THEAD, TR,
} from '@/components/super-admin/ui';

interface CollectionStat {
  name: string;
  count: number;
}

interface HealthData {
  status: 'ok' | 'error';
  latencyMs: number;
  totalCollections: number;
  collections: CollectionStat[];
}

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState('');

  const [seedLoading, setSeedLoading] = useState<string | null>(null);
  const [seedResults, setSeedResults] = useState<{ target: string; seeded: string[]; error?: string }[]>([]);

  const checkHealth = async () => {
    setHealthLoading(true);
    setHealthError('');
    try {
      const res = await fetch('/api/super-admin/system/health', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setHealth(data.data);
      } else {
        setHealthError(data.error || 'Health check failed');
        setHealth(data.data || null);
      }
    } catch {
      setHealthError('Failed to reach the health endpoint');
    } finally {
      setHealthLoading(false);
    }
  };

  const runSeed = async (target: string) => {
    setSeedLoading(target);
    try {
      const res = await fetch('/api/super-admin/system/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ target }),
      });
      const data = await res.json();
      setSeedResults(prev => [
        { target, seeded: data.seeded || [], error: data.success ? undefined : (data.error || 'Failed') },
        ...prev.slice(0, 9),
      ]);
    } catch {
      setSeedResults(prev => [
        { target, seeded: [], error: 'Network error' },
        ...prev.slice(0, 9),
      ]);
    } finally {
      setSeedLoading(null);
    }
  };

  return (
    <SaPage
      tagNo="13"
      tag="Back office"
      title="Settings"
      subtitle="Database health and seed data management."
    >
      {/* DB Health */}
      <Slip
        className="mt-8"
        title="Database health"
        action={
          <button type="button" onClick={checkHealth} disabled={healthLoading} className={KEY_PRIMARY}>
            <Activity className={ICON} strokeWidth={1.75} aria-hidden />
            {healthLoading ? 'Checking…' : 'Check health'}
          </button>
        }
        tear
      >
        <div className="px-4 py-4 sm:px-5">
          <p className="text-sm text-ink/70">Check the MongoDB connection and collection stats.</p>

          {healthError && (
            <div className="mt-4">
              <Strip tone="error">{healthError}</Strip>
            </div>
          )}

          {!health && !healthError && (
            <p className="mt-4 font-receipt text-sm text-ink/50">Press Check health to run diagnostics.</p>
          )}
        </div>

        {health && (
          <>
            <div className="grid gap-3 bg-ink px-4 py-4 sm:grid-cols-3 sm:px-5">
              <LedStat
                label="Connection"
                value={health.status === 'ok' ? 'OK' : 'ERR'}
                note={health.status === 'ok' ? 'Connected' : 'Error'}
                tone={health.status === 'ok' ? 'default' : 'alert'}
              />
              <LedStat label="Latency" value={health.latencyMs} note="Milliseconds" />
              <LedStat label="Collections" value={health.totalCollections} />
            </div>

            <div className="overflow-x-auto" role="region" aria-label="Collections" tabIndex={0}>
              <table className={TABLE}>
                <thead className={THEAD}>
                  <tr>
                    <th scope="col" className={TH}>Collection</th>
                    <th scope="col" className={TH_RIGHT}>Documents</th>
                  </tr>
                </thead>
                <tbody className={TBODY}>
                  {health.collections.map(col => (
                    <tr key={col.name} className={TR}>
                      <td className={`${TD} text-ink/80`}>{col.name}</td>
                      <td className={TD_RIGHT}>{col.count === -1 ? 'N/A' : col.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Slip>

      {/* Seed Data */}
      <Slip className="mt-10" title="Seed data" tear>
        <div className="px-4 py-4 sm:px-5">
          <p className="text-sm text-ink/70">Upsert default platform data.</p>

          <ol className="mt-4 divide-y divide-dashed divide-ink/20 border-y border-dashed border-ink/30">
            <li className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="w-6 font-receipt text-xs text-ink/50">01</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Subscription plans</p>
                  <p className="mt-0.5 text-sm text-ink/60">Upsert Starter, Pro, Business, Enterprise plans</p>
                </div>
              </div>
              <button type="button" onClick={() => runSeed('plans')} disabled={seedLoading !== null} className={KEY}>
                {seedLoading === 'plans' ? 'Seeding…' : 'Seed plans'}
              </button>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="w-6 font-receipt text-xs text-ink/50">02</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Seed all</p>
                  <p className="mt-0.5 text-sm text-ink/60">Runs all seed operations in sequence</p>
                </div>
              </div>
              <button type="button" onClick={() => runSeed('all')} disabled={seedLoading !== null} className={KEY_PRIMARY}>
                {seedLoading === 'all' ? 'Seeding…' : 'Seed all'}
              </button>
            </li>
          </ol>

          {/* Seed results log */}
          {seedResults.length > 0 && (
            <div className="mt-6">
              <p className="flex items-center gap-2 font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/60">
                <Database className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Recent operations
              </p>
              <div className="mt-2 space-y-2">
                {seedResults.map((r, i) => (
                  <Strip key={i} tone={r.error ? 'error' : 'ok'}>
                    {r.error ? (
                      <><span className="font-semibold">Error [{r.target}]:</span> {r.error}</>
                    ) : (
                      <><span className="font-semibold">Seeded [{r.target}]:</span> {r.seeded.join(', ')}</>
                    )}
                  </Strip>
                ))}
              </div>
            </div>
          )}
        </div>
      </Slip>
    </SaPage>
  );
}
