import { Big_Shoulders, Doto, Hanken_Grotesk, IBM_Plex_Mono } from 'next/font/google';

/* Public pages only, so the tenant app keeps its own fonts. */
const displayFont = Big_Shoulders({ subsets: ['latin'], variable: '--mk-font-display', display: 'swap' });
const bodyFont = Hanken_Grotesk({ subsets: ['latin'], variable: '--mk-font-body', display: 'swap' });
const receiptFont = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--mk-font-receipt',
  display: 'swap',
});
const ledFont = Doto({ subsets: ['latin'], weight: '800', variable: '--mk-font-led', display: 'swap' });

export const marketingFontClasses = `${displayFont.variable} ${bodyFont.variable} ${receiptFont.variable} ${ledFont.variable}`;
