'use client';

import type { ReactNode } from 'react';
import { Barcode, LineTag, ReceiptRow } from '@/components/marketing/primitives';
import PublicShell from '@/components/marketing/PublicShell';
import { usePublicCopy } from '@/hooks/usePublicCopy';

const LAST_UPDATED = 'November 7, 2026';

function P({ children }: { children: ReactNode }) {
  return <p className="mt-3 leading-relaxed text-ink/85 first:mt-0">{children}</p>;
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-5 font-bold first:mt-0">{children}</h3>;
}

function List({ children }: { children: ReactNode }) {
  return <ul className="mt-3 space-y-2 leading-relaxed text-ink/85">{children}</ul>;
}

function Li({ children }: { children: ReactNode }) {
  return <li className="relative pl-5 before:absolute before:left-0 before:text-brand-hover before:content-['–']">{children}</li>;
}

/* The legal wording below is the approved policy. Change it only on purpose, and update LAST_UPDATED when you do. */
const SECTIONS: { id: string; title: string; body: ReactNode }[] = [
  {
    id: 'introduction',
    title: 'Introduction',
    body: (
      <>
        <P>
          Welcome to <strong>1pos</strong>{' '}(&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). We are committed to protecting your personal information and your right to
          privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our point-of-sale platform and related services.
        </P>
        <P>By accessing or using 1pos, you agree to the terms of this Privacy Policy. If you do not agree, please discontinue use of our services.</P>
      </>
    ),
  },
  {
    id: 'information-we-collect',
    title: 'Information We Collect',
    body: (
      <>
        <H3>2.1 Information You Provide</H3>
        <List>
          <Li>Account registration details (name, email address, password)</Li>
          <Li>Business information (store name, company name, business type)</Li>
          <Li>Contact information (phone number, email)</Li>
          <Li>Payment and billing information (processed via our secure payment partners)</Li>
          <Li>Employee and user accounts you create within your tenant</Li>
          <Li>Customer data you enter into the system (names, contact details, purchase history)</Li>
        </List>
        <H3>2.2 Information Collected Automatically</H3>
        <List>
          <Li>Log data (IP address, browser type, pages visited, timestamps)</Li>
          <Li>Device information (hardware model, operating system)</Li>
          <Li>Usage data (features used, transaction counts, session duration)</Li>
          <Li>Location data (country and currency detected for setup purposes)</Li>
        </List>
      </>
    ),
  },
  {
    id: 'how-we-use-your-information',
    title: 'How We Use Your Information',
    body: (
      <>
        <P>We use the information we collect to:</P>
        <List>
          <Li>Provide, operate, and maintain the 1pos platform</Li>
          <Li>Process transactions and send related information (receipts, confirmations)</Li>
          <Li>Manage your account and tenant configuration</Li>
          <Li>Send administrative communications (security alerts, service updates)</Li>
          <Li>Respond to support requests and troubleshoot issues</Li>
          <Li>Analyze usage to improve our platform features and performance</Li>
          <Li>Comply with legal obligations, including BIR compliance requirements</Li>
          <Li>Detect and prevent fraud or unauthorized access</Li>
        </List>
      </>
    ),
  },
  {
    id: 'data-sharing-and-disclosure',
    title: 'Data Sharing and Disclosure',
    body: (
      <>
        <P>We do not sell, trade, or rent your personal information. We may share data with:</P>
        <List>
          <Li>
            <strong>Service providers</strong> — trusted third parties who assist in operating our platform (hosting, payment processing, email delivery), bound by
            confidentiality agreements.
          </Li>
          <Li>
            <strong>Legal authorities</strong> — when required by law, court order, or government regulation, including tax and BIR compliance obligations.
          </Li>
          <Li>
            <strong>Business transfers</strong> — in the event of a merger, acquisition, or sale of assets, your data may be transferred as part of that transaction.
          </Li>
        </List>
      </>
    ),
  },
  {
    id: 'data-retention',
    title: 'Data Retention',
    body: (
      <P>
        We retain your personal data for as long as your account is active or as needed to provide services. Transaction and audit records may be retained longer to satisfy
        BIR and legal requirements. You may request deletion of your account and associated data by contacting us, subject to any legal retention obligations.
      </P>
    ),
  },
  {
    id: 'data-security',
    title: 'Data Security',
    body: (
      <P>
        We implement industry-standard security measures including encryption in transit (HTTPS/TLS), hashed password storage, role-based access controls, and audit logging.
        However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
      </P>
    ),
  },
  {
    id: 'tenant-data-isolation',
    title: 'Tenant Data Isolation',
    body: (
      <P>
        Each business (tenant) on 1pos operates in an isolated environment. Your store&apos;s data — including products, customers, and transactions — is logically separated
        from other tenants and is not accessible to other businesses using the platform.
      </P>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your Rights',
    body: (
      <>
        <P>Depending on your jurisdiction, you may have the right to:</P>
        <List>
          <Li>Access the personal data we hold about you</Li>
          <Li>Correct inaccurate or incomplete data</Li>
          <Li>Request deletion of your personal data</Li>
          <Li>Restrict or object to certain processing activities</Li>
          <Li>Data portability (receive your data in a structured format)</Li>
        </List>
        <P>To exercise any of these rights, please contact us at the email below.</P>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies',
    body: (
      <P>
        We use cookies and similar tracking technologies to maintain authentication sessions and remember your preferences. Essential cookies are required for the platform to
        function. You can configure your browser to refuse cookies, but this may affect platform functionality.
      </P>
    ),
  },
  {
    id: 'childrens-privacy',
    title: 'Children’s Privacy',
    body: (
      <P>
        Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from minors. If we become aware that a minor has
        provided us with personal data, we will promptly delete it.
      </P>
    ),
  },
  {
    id: 'changes-to-this-policy',
    title: 'Changes to This Policy',
    body: (
      <P>
        We may update this Privacy Policy from time to time. We will notify you of significant changes by posting the new policy on this page with an updated &quot;Last
        updated&quot; date. Continued use of 1pos after changes are posted constitutes your acceptance of the revised policy.
      </P>
    ),
  },
  {
    id: 'contact-us',
    title: 'Contact Us',
    body: (
      <>
        <P>If you have questions, concerns, or requests regarding this Privacy Policy or how we handle your data, please contact us:</P>
        <div className="mt-5 max-w-md border-2 border-ink p-5 font-receipt text-sm">
          <p className="font-semibold">1pos Support</p>
          <p className="text-xs">1pos is a product of Devcom Digital Marketing Services.</p>
          <div className="mt-3 space-y-1">
            <ReceiptRow
              label="Email:"
              value={
                <a href="mailto:support@devcomdigital.com" className="underline underline-offset-2">
                  support@devcomdigital.com
                </a>
              }
            />
            <ReceiptRow
              label="Website:"
              value={
                <a href="https://www.1pos.solutions/" className="underline underline-offset-2">
                  www.1pos.solutions
                </a>
              }
            />
          </div>
        </div>
      </>
    ),
  },
];

const number = (index: number) => String(index + 1).padStart(2, '0');

export default function PrivacyPolicy() {
  const { lang, t, shellT } = usePublicCopy('privacy');

  const contents = (
    <ol>
      {SECTIONS.map((section, i) => (
        <li key={section.id} className="border-b border-ink/15">
          <a href={`#${section.id}`} className="flex items-center gap-3 py-1 text-sm hover:text-brand-hover">
            <span className="font-receipt text-xs text-ink/55">{number(i)}</span>
            {section.title}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <PublicShell t={shellT}>
      <section aria-labelledby="privacy-heading" className="bg-brand-navy-deep text-paper-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:items-center lg:px-8 lg:py-16">
          <div className="lg:col-span-7">
            <LineTag no="00" className="text-[#8fe3d0]">
              {t('tag', 'The fine print')}
            </LineTag>
            <h1 id="privacy-heading" className="mt-4 text-6xl sm:text-7xl lg:text-8xl">
              {t('heading', 'Privacy policy')}
            </h1>
            <p className="mt-5 font-receipt text-sm text-paper/80">
              {t('lastUpdated', 'Last updated:')} {LAST_UPDATED}
            </p>
            {lang === 'es' && <p className="mt-3 max-w-md text-sm leading-relaxed text-paper/80">{t('englishOnly', 'This policy is available in English only.')}</p>}
          </div>

          <div className="w-full max-w-sm drop-shadow-[0_14px_16px_rgb(0_0_0/0.35)] lg:col-span-5 lg:justify-self-end">
            <div className="mk-tear-b bg-paper-white px-6 pb-8 pt-5 font-receipt text-xs leading-relaxed text-ink">
              <p className="text-center text-sm font-semibold uppercase">{t('glanceTitle', 'At a glance')}</p>
              <div className="my-3 border-t border-dashed border-ink/40" />
              <div className="space-y-1">
                <ReceiptRow label={t('glanceSold', 'Your data sold')} value={t('glanceNever', 'Never')} />
                <ReceiptRow label={t('glanceShared', 'Shared with other stores')} value={t('glanceNo', 'No')} />
                <ReceiptRow label={t('glancePasswords', 'Passwords')} value={t('glanceHashed', 'Hashed')} />
                <ReceiptRow label={t('glanceDeletion', 'Deletion on request')} value={t('glanceYes', 'Yes*')} />
              </div>
              <div className="my-3 border-t border-dashed border-ink/40" />
              <p className="text-[11px] text-ink/70">{t('glanceNote', '*Subject to legal retention. This summary does not replace the full policy below.')}</p>
              <Barcode className="mx-auto mt-3 h-7 w-36" />
            </div>
          </div>
        </div>
      </section>

      <section aria-label={t('policyLabel', 'Full policy')} className="bg-paper-white py-12 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:gap-12 lg:px-8">
          <aside className="lg:col-span-4">
            <details className="border-2 border-ink p-4 lg:hidden">
              <summary className="cursor-pointer font-receipt text-xs font-medium uppercase tracking-[0.14em]">{t('contents', 'On this page')}</summary>
              <div className="mt-3">{contents}</div>
            </details>
            <nav aria-label={t('contents', 'On this page')} className="hidden lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
              <p className="mb-3 font-receipt text-xs font-medium uppercase tracking-[0.14em]">{t('contents', 'On this page')}</p>
              {contents}
            </nav>
          </aside>

          <article className="min-w-0 max-w-2xl lg:col-span-8">
            {SECTIONS.map((section, i) => (
              <section key={section.id} id={section.id} className="scroll-mt-24 border-t-2 border-ink pb-12 pt-5 last:pb-0">
                <p className="font-receipt text-xs text-ink/60">{number(i)}</p>
                <h2 className="mb-4 mt-1 text-4xl">{section.title}</h2>
                {section.body}
              </section>
            ))}
          </article>
        </div>
      </section>
    </PublicShell>
  );
}
