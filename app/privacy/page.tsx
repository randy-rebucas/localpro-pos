import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — 1pos',
  description: 'Learn how 1pos collects, uses, and protects your personal information.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  const lastUpdated = 'June 14, 2026';

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-soft via-white to-slate-100">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-brand hover:text-brand-hover transition-colors">
            1pos
          </Link>
          <Link
            href="/"
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white border border-gray-200 p-8 sm:p-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-10">Last updated: {lastUpdated}</p>

          <div className="prose prose-gray max-w-none space-y-8 text-gray-700">

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Introduction</h2>
              <p>
                Welcome to <strong>1pos</strong> (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). We are committed to protecting your
                personal information and your right to privacy. This Privacy Policy explains how we
                collect, use, disclose, and safeguard your information when you use our point-of-sale
                platform and related services.
              </p>
              <p className="mt-3">
                By accessing or using 1pos, you agree to the terms of this Privacy Policy. If you do not
                agree, please discontinue use of our services.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Information We Collect</h2>
              <h3 className="text-base font-semibold text-gray-800 mb-2">2.1 Information You Provide</h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Account registration details (name, email address, password)</li>
                <li>Business information (store name, company name, business type)</li>
                <li>Contact information (phone number, email)</li>
                <li>Payment and billing information (processed via our secure payment partners)</li>
                <li>Employee and user accounts you create within your tenant</li>
                <li>Customer data you enter into the system (names, contact details, purchase history)</li>
              </ul>

              <h3 className="text-base font-semibold text-gray-800 mb-2 mt-4">2.2 Information Collected Automatically</h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Log data (IP address, browser type, pages visited, timestamps)</li>
                <li>Device information (hardware model, operating system)</li>
                <li>Usage data (features used, transaction counts, session duration)</li>
                <li>Location data (country and currency detected for setup purposes)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">3. How We Use Your Information</h2>
              <p>We use the information we collect to:</p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>Provide, operate, and maintain the 1pos platform</li>
                <li>Process transactions and send related information (receipts, confirmations)</li>
                <li>Manage your account and tenant configuration</li>
                <li>Send administrative communications (security alerts, service updates)</li>
                <li>Respond to support requests and troubleshoot issues</li>
                <li>Analyze usage to improve our platform features and performance</li>
                <li>Comply with legal obligations, including BIR compliance requirements</li>
                <li>Detect and prevent fraud or unauthorized access</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Data Sharing and Disclosure</h2>
              <p>We do not sell, trade, or rent your personal information. We may share data with:</p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>
                  <strong>Service providers</strong> — trusted third parties who assist in operating our
                  platform (hosting, payment processing, email delivery), bound by confidentiality
                  agreements.
                </li>
                <li>
                  <strong>Legal authorities</strong> — when required by law, court order, or government
                  regulation, including tax and BIR compliance obligations.
                </li>
                <li>
                  <strong>Business transfers</strong> — in the event of a merger, acquisition, or sale of
                  assets, your data may be transferred as part of that transaction.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Data Retention</h2>
              <p>
                We retain your personal data for as long as your account is active or as needed to provide
                services. Transaction and audit records may be retained longer to satisfy BIR and legal
                requirements. You may request deletion of your account and associated data by contacting
                us, subject to any legal retention obligations.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Data Security</h2>
              <p>
                We implement industry-standard security measures including encryption in transit (HTTPS/TLS),
                hashed password storage, role-based access controls, and audit logging. However, no method
                of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Tenant Data Isolation</h2>
              <p>
                Each business (tenant) on 1pos operates in an isolated environment. Your store&apos;s
                data — including products, customers, and transactions — is logically separated from other
                tenants and is not accessible to other businesses using the platform.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Your Rights</h2>
              <p>Depending on your jurisdiction, you may have the right to:</p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>Access the personal data we hold about you</li>
                <li>Correct inaccurate or incomplete data</li>
                <li>Request deletion of your personal data</li>
                <li>Restrict or object to certain processing activities</li>
                <li>Data portability (receive your data in a structured format)</li>
              </ul>
              <p className="mt-3">
                To exercise any of these rights, please contact us at the email below.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Cookies</h2>
              <p>
                We use cookies and similar tracking technologies to maintain authentication sessions and
                remember your preferences. Essential cookies are required for the platform to function.
                You can configure your browser to refuse cookies, but this may affect platform functionality.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Children&apos;s Privacy</h2>
              <p>
                Our services are not directed to individuals under the age of 18. We do not knowingly
                collect personal information from minors. If we become aware that a minor has provided
                us with personal data, we will promptly delete it.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">11. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of significant
                changes by posting the new policy on this page with an updated &quot;Last updated&quot; date.
                Continued use of 1pos after changes are posted constitutes your acceptance of the revised
                policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">12. Contact Us</h2>
              <p>
                If you have questions, concerns, or requests regarding this Privacy Policy or how we handle
                your data, please contact us:
              </p>
              <div className="mt-3 p-4 bg-gray-50 border border-gray-200">
                <p className="font-medium text-gray-900">1pos Support</p>
                <p className="text-gray-700 mt-1">
                  Email:{' '}
                  <a href="mailto:privacy@1pos.app" className="text-brand hover:text-brand-hover underline">
                    privacy@1pos.app
                  </a>
                </p>
                <p className="text-gray-700">Website: 1pos.app</p>
              </div>
            </section>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-4 py-8 text-center text-sm text-gray-500">
        <p>
          &copy; 2026 1pos. All rights reserved.{' '}
          <Link href="/" className="text-brand hover:text-brand-hover">
            Home
          </Link>
        </p>
      </footer>
    </div>
  );
}
