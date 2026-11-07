'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import StatusSlip, { resolveStatusLang, slipPrimaryKey, slipSecondaryKey } from '@/components/StatusSlip';

/** Shown for unknown stores and unknown pages alike, since the tenant layout's notFound() lands here. */
export default function RootNotFound() {
  const pathname = usePathname();
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  useEffect(() => {
    // Paths read /{tenant}/{lang}/..., and params aren't available at this level
    getDictionaryClient(resolveStatusLang(pathname?.split('/')[2])).then(setDict);
  }, [pathname]);

  return (
    <StatusSlip
      code="404"
      title={dict?.common?.pageNotFound || 'Page Not Found'}
      message={dict?.common?.pageNotFoundMessage || "We couldn't find that store or page. Check the link, or find your store in the directory."}
    >
      <Link href="/stores" className={slipPrimaryKey}>
        {dict?.common?.browseStores || 'Browse Stores'}
      </Link>
      <Link href="/" className={slipSecondaryKey}>
        {dict?.admin?.goToHome || 'Go to Home'}
      </Link>
    </StatusSlip>
  );
}
