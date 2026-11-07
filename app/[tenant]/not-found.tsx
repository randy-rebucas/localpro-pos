'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import StatusSlip, { resolveStatusLang, slipPrimaryKey, slipSecondaryKey, type StatusLocale } from '@/components/StatusSlip';

/** Only reached once the tenant layout has found the store, so it's the page that's missing. Unknown stores get app/not-found.tsx. */
export default function TenantNotFound() {
  const params = useParams();
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [lang, setLang] = useState<StatusLocale>('en');

  useEffect(() => {
    const resolved = resolveStatusLang(params?.lang);
    getDictionaryClient(resolved).then((loaded) => {
      setDict(loaded);
      setLang(resolved);
    });
  }, [params?.lang]);

  return (
    <StatusSlip
      code="404"
      title={dict?.common?.pageNotFound || 'Page Not Found'}
      message={dict?.common?.pageNotFoundInStore || "This page doesn't exist in this store."}
    >
      <Link href={`/${params?.tenant}/${lang}`} className={slipPrimaryKey}>
        {dict?.common?.backToStore || 'Back to Store'}
      </Link>
      <Link href="/" className={slipSecondaryKey}>
        {dict?.admin?.goToHome || 'Go to Home'}
      </Link>
    </StatusSlip>
  );
}
