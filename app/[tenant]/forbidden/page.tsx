'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import { ReceiptRow } from '@/components/marketing/primitives';
import StatusSlip, { StatusLoading, resolveStatusLang, slipPrimaryKey, slipSecondaryKey } from '@/components/StatusSlip';

interface Account {
  name: string | null;
  email: string | null;
  tenantSlug: string | null;
}

export default function ForbiddenPage() {
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const params = useParams();
  const router = useRouter();
  const currentTenant = params?.tenant as string;
  const lang = resolveStatusLang(params?.lang);

  useEffect(() => {
    async function loadData() {
      try {
        const [dictData, profileData] = await Promise.all([
          getDictionaryClient(lang),
          fetch('/api/auth/profile', { credentials: 'include' }).then((res) => res.json()),
        ]);

        setDict(dictData);

        if (profileData.success && profileData.user) {
          setAccount({
            name: profileData.user.name || null,
            email: profileData.user.email || null,
            tenantSlug: profileData.user.tenantSlug || null,
          });
        }
      } catch (error) {
        console.error('Error loading forbidden page data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [lang]);

  if (loading) {
    return <StatusLoading label={dict?.components?.protectedRoute?.loading || 'Loading...'} />;
  }

  const f = dict?.components?.forbidden;

  return (
    <StatusSlip
      code="403"
      wide
      stamp={f?.stamp || 'Denied'}
      title={f?.title || dict?.components?.protectedRoute?.accessDenied || 'Access Denied'}
      message={f?.message || "You don't have permission to access this store."}
    >
      {/* Who tried, and where */}
      <div className="space-y-1 font-receipt text-sm">
        {account?.name && (
          <ReceiptRow
            label={<span className="whitespace-nowrap">{f?.yourAccount || 'Your Account'}</span>}
            value={<span className="whitespace-normal">{account.name}</span>}
          />
        )}
        {account?.email && <p className="break-all text-right text-xs text-ink/60">{account.email}</p>}
        {account?.tenantSlug && <ReceiptRow label={f?.yourStore || 'Your Store'} value={account.tenantSlug} />}
        <ReceiptRow
          label={f?.attemptedAccess || 'Attempted Access'}
          value={<span className="font-semibold text-stamp">{currentTenant}</span>}
        />
      </div>

      {account?.tenantSlug && (
        <button type="button" onClick={() => router.push(`/${account.tenantSlug}/${lang}`)} className={slipPrimaryKey}>
          {f?.goToMyStore || 'Go to My Store'}
        </button>
      )}

      <Link href={`/default/${lang}`} className={slipSecondaryKey}>
        {f?.goToDefaultStore || 'Go to Default Store'}
      </Link>

      <button
        type="button"
        onClick={() => router.back()}
        className="flex min-h-[44px] w-full items-center justify-center font-receipt text-xs uppercase text-ink/70 transition-colors hover:text-ink"
      >
        {f?.goBack || 'Go Back'}
      </button>

      <p className="text-xs text-ink/60">
        {f?.contactAdmin || 'If you believe this is an error, please contact your administrator.'}
      </p>
    </StatusSlip>
  );
}
