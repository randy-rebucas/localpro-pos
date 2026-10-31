'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CornerDownLeft, Languages, MapPin, Store, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { normalizeImageUrl } from '@/lib/image-utils';
import { ArrowIcon } from './ui';
import type { HomeDict } from './useMarketing';

/** Shape returned by the public `GET /api/tenants` directory. */
export interface DirectoryTenant {
  slug: string;
  name: string;
  settings?: {
    companyName?: string;
    logo?: string;
    businessType?: string;
    currency?: string;
    language?: string;
    address?: { city?: string; country?: string };
  };
}

export const TYPE_ICONS: Record<string, LucideIcon> = { retail: Store, general: Wrench };

export const tenantDisplayName = (t: DirectoryTenant) => t.settings?.companyName || t.name;
/** Business types are stored in mixed case; normalise so filters and labels line up. */
export const tenantType = (t: DirectoryTenant) => (t.settings?.businessType || 'general').toLowerCase();
export const typeLabel = (type: string, d: HomeDict) => {
  const cap = type.charAt(0).toUpperCase() + type.slice(1);
  return d?.[`type${cap}`] || cap;
};

/** One store in the directory: keycap monogram, @handle, location and till settings. */
export default function StoreTile({
  tenant,
  href,
  index,
  topMatch,
  d,
}: {
  tenant: DirectoryTenant;
  href: string;
  index: number;
  topMatch: boolean;
  d: HomeDict;
}) {
  const name = tenantDisplayName(tenant);
  const type = tenantType(tenant);
  const TypeIcon = TYPE_ICONS[type] ?? Store;
  const location = [tenant.settings?.address?.city, tenant.settings?.address?.country].filter(Boolean).join(', ');
  const [logoFailed, setLogoFailed] = useState(false);
  const logo = logoFailed ? undefined : tenant.settings?.logo;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Link
      href={href}
      style={{ ['--i' as string]: index % 4 }}
      className={`mk-reveal mk-panel mk-sheen group relative flex flex-col rounded-lg p-3.5 hover:border-brand/60 focus-visible:outline-2 focus-visible:outline-brand ${
        topMatch ? 'ring-2 ring-brand ring-offset-2 ring-offset-[#eef3f5]' : ''
      }`}
    >
      {topMatch && (
        // .mk-key-* sets position: relative, so the absolute positioning lives on a wrapper
        <span className="absolute -top-2.5 right-3">
          <span className="mk-key-brand inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] font-bold font-mono tracking-wider">
            <CornerDownLeft className="w-3 h-3" strokeWidth={2.5} aria-hidden="true" />
            {d?.topMatch || 'TOP MATCH'}
          </span>
        </span>
      )}

      <div className="flex items-start gap-3">
        {logo ? (
          <span className="mk-key-light w-11 h-11 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={normalizeImageUrl(logo)} alt="" loading="lazy" onError={() => setLogoFailed(true)} className="w-full h-full object-contain" />
          </span>
        ) : (
          <span className="mk-key-brand w-11 h-11 rounded-md flex items-center justify-center flex-shrink-0 text-sm font-black tracking-tight" aria-hidden="true">
            {initials || '1'}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-gray-900 leading-tight line-clamp-2">{name}</h3>
          <p className="text-xs font-mono text-brand truncate mt-0.5">@{tenant.slug}</p>
        </div>
      </div>

      <dl className="mt-3 grid gap-1 text-xs text-gray-600">
        <div className="flex items-center gap-1.5 min-w-0">
          <dt className="sr-only">{d?.location || 'Location'}</dt>
          <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" strokeWidth={2.25} aria-hidden="true" />
          <dd className={`truncate ${location ? '' : 'text-gray-400'}`}>{location || d?.noLocation || 'Location not set'}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">{d?.businessType || 'Business type'}</dt>
          <TypeIcon className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" strokeWidth={2.25} aria-hidden="true" />
          <dd>{typeLabel(type, d)}</dd>
        </div>
      </dl>

      <div className="mt-auto pt-3 flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {tenant.settings?.currency && (
            <span className="mk-lcd rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums" title={d?.currency || 'Currency'}>
              {tenant.settings.currency}
            </span>
          )}
          {tenant.settings?.language && (
            <span className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-bold font-mono uppercase text-gray-500" title={d?.language || 'Language'}>
              <Languages className="w-3 h-3" strokeWidth={2.25} aria-hidden="true" />
              {tenant.settings.language}
            </span>
          )}
        </div>
        <span className="mk-key-light inline-flex items-center gap-1 h-7 px-2.5 rounded text-xs font-semibold text-gray-800 group-hover:text-brand">
          {d?.signIn || 'Sign in'}
          <ArrowIcon className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </span>
      </div>
    </Link>
  );
}
