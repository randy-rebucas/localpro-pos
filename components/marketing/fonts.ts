import { Doto, Hanken_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import localFont from 'next/font/local';

/* Public pages, the register, and the header and dialogs shared across the tenant app. */
// Local because next/font/google has no fallback metrics for this family; here Next reads them from the file.
const displayFont = localFont({
  src: '../../public/fonts/Big_Shoulders/BigShoulders-VariableFont_opsz,wght.ttf',
  weight: '100 900',
  variable: '--mk-font-display',
  display: 'swap',
});
const bodyFont = Hanken_Grotesk({ subsets: ['latin'], variable: '--mk-font-body', display: 'swap' });
const receiptFont = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--mk-font-receipt',
  display: 'swap',
});
const ledFont = Doto({ subsets: ['latin'], weight: '800', variable: '--mk-font-led', display: 'swap' });

export const marketingFontClasses = `${displayFont.variable} ${bodyFont.variable} ${receiptFont.variable} ${ledFont.variable}`;
