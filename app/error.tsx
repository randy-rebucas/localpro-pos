'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import { ReceiptRow } from '@/components/marketing/primitives';
import StatusSlip, { resolveStatusLang, slipPrimaryKey, slipSecondaryKey } from '@/components/StatusSlip';

/** Catches what app/[tenant]/error.tsx can't: failures in the tenant layout itself, and in every other area. */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  useEffect(() => {
    console.error('Application error:', error);
    getDictionaryClient(resolveStatusLang(pathname?.split('/')[2])).then(setDict);
  }, [error, pathname]);

  return (
    <StatusSlip
      code="ERR"
      title={dict?.common?.error || 'Something went wrong'}
      message={
        process.env.NODE_ENV === 'development' && error.message
          ? error.message
          : dict?.common?.unexpectedErrorMessage || 'This page ran into a problem. Try again, or come back in a moment.'
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
      <Link href="/" className={slipSecondaryKey}>
        {dict?.admin?.goToHome || 'Go to Home'}
      </Link>
    </StatusSlip>
  );
}
