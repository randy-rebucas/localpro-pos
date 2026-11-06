'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Barcode, LineTag, ReceiptRow, type Translate } from '@/components/marketing/primitives';
import PublicShell from '@/components/marketing/PublicShell';
import { usePublicCopy } from '@/hooks/usePublicCopy';

interface Plan {
  _id: string;
  name: string;
  tier: string;
  isCustom?: boolean;
  availableToNewTenants?: boolean;
  price: { monthly: number; setupFee?: number; currency: string };
  features: Record<string, number | boolean | undefined>;
  birCompliance?: Record<string, boolean | undefined>;
}

/** Matches the yearly charge in app/api/subscriptions/activate/route.ts. */
const YEARLY_RATE = 0.9;
const TRIAL_DAYS = 14;

const money = (amount: number, currency: string) =>
  `${currency === 'PHP' ? '₱' : `${currency} `}${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const isQuoted = (plan: Plan) => plan.price.monthly === 0 && (plan.isCustom || plan.tier === 'enterprise');

function includedLines(plan: Plan, t: Translate) {
  const { features: f, birCompliance: bir = {} } = plan;
  return [
    [f.enableInventory, t('lineInventory', 'Inventory tracking')],
    [f.enableReports, t('lineReports', 'Sales reports')],
    [f.enableDiscounts, t('lineDiscounts', 'Discount codes')],
    [f.enableCustomerManagement, t('lineCustomers', 'Customer records')],
    [f.enableLoyaltyProgram, t('lineLoyalty', 'Loyalty program')],
    [f.enableBookingScheduling, t('lineBookings', 'Bookings')],
    [f.enableHardwareIntegration, t('lineHardware', 'Scanners and printers')],
    [bir.receiptFormatting, t('lineReceipts', 'BIR receipt format')],
    [bir.ptuAssistance, t('linePtu', 'Permit to Use help')],
    [bir.birDocumentation, t('lineBirDocs', 'BIR documents')],
    [bir.casReporting, t('lineCas', 'CAS reporting')],
    [bir.auditTrailSystem, t('lineAudit', 'Full audit trail')],
    [bir.monthlySupport, t('lineMonthlySupport', 'Monthly compliance help')],
    [f.prioritySupport, t('linePriority', 'Priority support')],
    [f.customIntegrations, t('lineIntegrations', 'Custom integrations')],
    [f.dedicatedAccountManager, t('lineManager', 'Account manager')],
  ]
    .filter(([included]) => included)
    .map(([, label]) => label as string);
}

function PlanBill({ plan, no, t }: { plan: Plan; no: number; t: Translate }) {
  const { features: f, price } = plan;
  const limit = (value: number | boolean | undefined) => (value === -1 ? t('unlimited', 'Unlimited') : Number(value ?? 0).toLocaleString('en-PH'));
  const quoted = isQuoted(plan);

  return (
    <article className="drop-shadow-[0_10px_12px_rgb(0_0_0/0.3)]">
      <div className="mk-tear-b bg-paper-white px-5 pb-9 pt-5 font-receipt text-xs leading-relaxed text-ink">
        <p className="text-center uppercase tracking-[0.14em] text-ink/60">
          {t('planLine', 'Plan')} {String(no).padStart(2, '0')}
        </p>
        <h2 className="mt-1 break-words text-center text-5xl">{plan.name}</h2>

        <div className="mt-4 space-y-1 border-t border-dashed border-ink/40 pt-3">
          <ReceiptRow label={t('limitUsers', 'Staff logins')} value={limit(f.maxUsers)} />
          {/* The branches API refuses a second branch unless multi-branch is on, whatever maxBranches says. */}
          <ReceiptRow label={t('limitBranches', 'Branches')} value={limit(f.enableMultiBranch ? f.maxBranches : 1)} />
          <ReceiptRow label={t('limitProducts', 'Products')} value={limit(f.maxProducts)} />
          <ReceiptRow label={t('limitSales', 'Sales a month')} value={limit(f.maxTransactions)} />
        </div>

        <ul className="mt-3 space-y-1 border-t border-dashed border-ink/40 pt-3">
          {includedLines(plan, t).map((line) => (
            <li key={line}>
              <ReceiptRow label={line} value={t('included', 'Incl')} />
            </li>
          ))}
        </ul>

        <div className="mt-3 border-t-2 border-ink pt-3">
          {quoted ? (
            <p className="text-3xl font-semibold leading-none tracking-tight">{t('quoted', 'By quote')}</p>
          ) : (
            <>
              <p className="uppercase tracking-[0.14em] text-ink/60">{t('perMonth', 'Per month')}</p>
              <p className="mt-1 text-3xl font-semibold leading-none tracking-tight">{money(price.monthly, price.currency)}</p>
            </>
          )}
          <div className="mt-3 space-y-1">
            {!quoted && price.monthly > 0 && <ReceiptRow label={t('yearlyLine', 'Yearly, 10% off')} value={money(price.monthly * 12 * YEARLY_RATE, price.currency)} />}
            {Boolean(price.setupFee) && <ReceiptRow label={t('setupLine', 'One-time setup from')} value={money(price.setupFee ?? 0, price.currency)} />}
          </div>
        </div>

        <Link
          href={quoted ? '/contact' : '/signup'}
          className="group mt-5 flex items-center justify-center gap-2 bg-ink px-4 py-3 font-body text-sm font-semibold text-paper-white hover:bg-brand-navy"
        >
          {quoted ? t('askForQuote', 'Ask for a quote') : t('startTrial', 'Start free trial')}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
        <Barcode className="mx-auto mt-5 h-8 w-40 text-ink" />
      </div>
    </article>
  );
}

export default function PriceList() {
  const { t, shellT } = usePublicCopy('pricing');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPlans() {
      try {
        const res = await fetch('/api/subscription-plans');
        const data = await res.json();
        // The API also returns retired plans kept for existing subscribers.
        if (data.success && data.data) setPlans(data.data.filter((plan: Plan) => plan.availableToNewTenants !== false));
      } catch {
        // The empty state covers a failed load.
      } finally {
        setLoading(false);
      }
    }
    fetchPlans();
  }, []);

  const questions = [
    [t('q1', 'Do I need a card for the trial?'), t('a1', 'No. Sign up and your store runs for {days} days on the limits of the first plan listed here.').replace('{days}', String(TRIAL_DAYS))],
    [t('q2', 'How do I pay?'), t('a2', 'Online through PayPal, from the subscription page inside your store.')],
    [t('q3', 'What does paying yearly save?'), t('a3', 'Yearly billing is twelve months at 10% off.')],
    [t('q4', 'What happens when I reach a limit?'), t('a4', 'You can’t add more until you move up a plan. The sales limit starts over each month.')],
    [t('q5', 'Which hardware works?'), t('a5', 'USB and wireless barcode scanners, ESC/POS receipt printers, and a camera for QR codes, on plans that list scanners and printers.')],
    [t('q6', 'What if a payment is missed?'), t('a6', 'Overdue invoices can pick up late fees. If the account is deactivated, a reactivation fee may apply.')],
  ];

  return (
    <PublicShell t={shellT}>
      <section aria-labelledby="pricing-heading" className="bg-brand text-ink">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <LineTag no="00">{t('tag', 'Price list')}</LineTag>
              <h1 id="pricing-heading" className="mt-4 text-6xl sm:text-7xl lg:text-8xl">
                {t('heading', 'Read the bill first')}
              </h1>
              <p className="mt-4 max-w-lg text-lg leading-relaxed">{t('intro', 'Every plan is itemized below, so you know what you get before you ring anything up.')}</p>
            </div>
            <div className="w-fit border-4 border-[#0b1820] bg-[#04100f] px-4 py-3 text-right lg:col-span-4 lg:justify-self-end">
              <p className="font-receipt text-[11px] text-[#8fe3d0]/80">{t('trialPanel', 'Free trial days')}</p>
              <p className="mk-led-glow font-led text-5xl leading-tight text-[#7df0d6]">{TRIAL_DAYS}</p>
            </div>
          </div>
        </div>
      </section>

      <section aria-label={t('plansLabel', 'Plans')} className="min-h-[28rem] bg-brand-navy-deep py-14 text-paper-white lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-[32rem] bg-paper-white/10 motion-safe:animate-pulse" />
              ))}
            </div>
          ) : plans.length > 0 ? (
            <div className="grid items-start gap-6 sm:grid-cols-2 xl:grid-cols-4">
              {plans.map((plan, i) => (
                <PlanBill key={plan._id} plan={plan} no={i + 1} t={t} />
              ))}
            </div>
          ) : (
            <div className="mx-auto max-w-sm drop-shadow-[0_10px_12px_rgb(0_0_0/0.3)]">
              <div className="mk-tear-b bg-paper-white px-6 pb-10 pt-8 text-center text-ink" aria-live="polite">
                <h2 className="text-4xl">{t('noPlans', 'Price list didn’t print')}</h2>
                <p className="mt-2 leading-relaxed text-ink/75">{t('noPlansDesc', 'We couldn’t load the plans. Try again in a moment, or ask us for them.')}</p>
                <Link href="/contact" className="mt-6 flex items-center justify-center bg-ink px-4 text-sm font-semibold text-paper-white hover:bg-brand-navy">
                  {t('contactUs', 'Contact us')}
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="pricing-questions" className="bg-paper py-20 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
          <div className="lg:col-span-4">
            <LineTag no="01">{t('questionsTag', 'Fine print')}</LineTag>
            <h2 id="pricing-questions" className="mt-4 text-5xl sm:text-6xl">
              {t('questionsHeading', 'Before you pay')}
            </h2>
            <p className="mt-4 leading-relaxed text-ink/75">{t('questionsIntro', 'Need something the list doesn’t cover?')}</p>
            <Link href="/contact" className="flex items-center font-semibold text-brand-hover underline underline-offset-4 hover:text-ink">
              {t('contactUs', 'Contact us')}
            </Link>
          </div>
          <ol className="border-t-2 border-ink lg:col-span-8">
            {questions.map(([question, answer], i) => (
              <li key={question} className="flex gap-4 border-b border-ink/20 py-5">
                <span className="w-6 shrink-0 pt-1 font-receipt text-xs text-ink/50">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3 className="font-semibold">{question}</h3>
                  <p className="mt-1 leading-relaxed text-ink/75">{answer}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </PublicShell>
  );
}
