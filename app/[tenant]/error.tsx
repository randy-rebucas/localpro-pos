'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import { ReceiptRow } from '@/components/marketing/primitives';
import StatusSlip, { resolveStatusLang, slipPrimaryKey, slipSecondaryKey, type StatusLocale } from '@/components/StatusSlip';

export default function TenantError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [lang, setLang] = useState<StatusLocale>('en');

  useEffect(() => {
    console.error('Tenant error:', error);
    const resolved = resolveStatusLang(params?.lang);
    getDictionaryClient(resolved).then((loaded) => {
      setDict(loaded);
      setLang(resolved);
    });
  }, [error, params?.lang]);

  return (
    <StatusSlip
      code="ERR"
      title={dict?.admin?.errorLoadingStore || 'Error Loading Store'}
      message={
        process.env.NODE_ENV === 'development' && error.message
          ? error.message
          : dict?.admin?.errorLoadingStoreMessage || 'An error occurred while loading the store information.'
      }
    >
      {error.digest && (
        <div className="font-receipt text-xs text-ink/70">
          <ReceiptRow label={dict?.admin?.errorReference || 'Reference'} value={error.digest} />
        </div>
      )}
      <button type="button" onClick={reset} className={slipPrimaryKey}>
        {dict?.admin?.tryAgain || 'Try Again'}
      </button>
      <Link href={`/default/${lang}`} className={slipSecondaryKey}>
        {dict?.admin?.goToDefaultStore || 'Go to Default Store'}
      </Link>
    </StatusSlip>
  );
}
