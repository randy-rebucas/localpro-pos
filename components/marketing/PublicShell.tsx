import type { ReactNode } from 'react';
import '@/app/marketing.css';
import { marketingFontClasses } from './fonts';
import type { Translate } from './primitives';
import PublicFooter from './PublicFooter';
import PublicHeader from './PublicHeader';

/** Fonts, header and footer shared by every public page. `t` reads the `home` dictionary section. */
export default function PublicShell({ t, children }: { t: Translate; children: ReactNode }) {
  return (
    <div className={`${marketingFontClasses} mk-root min-h-screen`}>
      <PublicHeader t={t} />
      <main id="main-content">{children}</main>
      <PublicFooter t={t} />
    </div>
  );
}
