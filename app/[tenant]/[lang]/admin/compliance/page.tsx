'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ShieldCheck, AlertTriangle, XCircle, CheckCircle, ChevronRight, Clock, Minus } from 'lucide-react';
import { getDictionaryClient } from '../../dictionaries-client';
import { usePermissions } from '@/hooks/usePermissions';

type ComplianceStatus = 'compliant' | 'warning' | 'expired' | 'missing' | 'not_applicable';

interface ComplianceItem {
  id: string;
  label: string;
  description: string;
  status: ComplianceStatus;
  daysUntilExpiry?: number;
  actionLabel?: string;
  actionHref?: string;
}

interface ComplianceSection {
  title: string;
  items: ComplianceItem[];
}

function statusIcon(s: ComplianceStatus) {
  switch (s) {
    case 'compliant': return <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />;
    case 'warning': return <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />;
    case 'expired': return <XCircle className="w-5 h-5 text-red-500 shrink-0" />;
    case 'missing': return <XCircle className="w-5 h-5 text-red-400 shrink-0" />;
    case 'not_applicable': return <Minus className="w-5 h-5 text-gray-300 shrink-0" />;
  }
}

function statusBorder(s: ComplianceStatus) {
  switch (s) {
    case 'compliant': return 'border-green-200';
    case 'warning': return 'border-amber-300';
    case 'expired': return 'border-red-400';
    case 'missing': return 'border-red-300';
    case 'not_applicable': return 'border-gray-100';
  }
}

function statusBg(s: ComplianceStatus) {
  switch (s) {
    case 'compliant': return '';
    case 'warning': return 'bg-amber-50';
    case 'expired': return 'bg-red-50';
    case 'missing': return 'bg-red-50';
    case 'not_applicable': return '';
  }
}

/**
 * Whole calendar days between today and the given date, comparing local
 * midnight-to-midnight rather than raw instants. Using live `Date.now()`
 * against a stored midnight timestamp (via Math.ceil on the raw ms diff)
 * would flip the result by a day depending on what time of day it is "today",
 * which matters right at renewal-deadline boundaries.
 */
function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  return Math.round((targetMidnight.getTime() - todayMidnight.getTime()) / 86400000);
}

function expiryStatus(dateStr: string | null | undefined, isPresent: boolean): ComplianceStatus {
  if (!isPresent) return 'missing';
  if (!dateStr) return 'compliant';
  const days = daysUntil(dateStr);
  if (days < 0) return 'expired';
  if (days <= 30) return 'warning';
  return 'compliant';
}

function daysLeft(dateStr?: string | null) {
  if (!dateStr) return undefined;
  return daysUntil(dateStr);
}

export default function CompliancePage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  useEffect(() => {
    getDictionaryClient(lang as 'en' | 'es').then(setDict);
  }, [lang]);

  const [sections, setSections] = useState<ComplianceSection[]>([]);
  const [overallStatus, setOverallStatus] = useState<'compliant' | 'action_required' | 'critical'>('compliant');
  const [businessType, setBusinessType] = useState('');
  const [loading, setLoading] = useState(true);
  const { canAccess } = usePermissions();
  const canView = canAccess('compliance.view');

  const buildDashboard = useCallback(async () => {
    try {
      // Fetch all compliance data in parallel
      const [birRes, permitsRes, settingsRes, retailRes] = await Promise.all([
        fetch(`/api/tenants/${tenant}/bir-settings`),
        fetch(`/api/tenants/${tenant}/business-permits`),
        fetch(`/api/tenants/${tenant}/settings`),
        fetch(`/api/tenants/${tenant}/retail-compliance`),
      ]);

      const [birJson, permitsJson, settingsJson, retailJson] = await Promise.all([
        birRes.json(), permitsRes.json(), settingsRes.json(), retailRes.json(),
      ]);

      const bir = birJson.success ? birJson.data : {};
      const permits = permitsJson.success ? permitsJson.data : {};
      const tenantSettings = settingsJson.success ? settingsJson.data : {};
      const retail = retailJson.success ? retailJson.data : {};

      const bType = (tenantSettings.businessType as string) ?? '';
      setBusinessType(bType);

      const base = () => `/${tenant}/${lang}/admin`;
      const allSections: ComplianceSection[] = [];
      const allItems: ComplianceItem[] = [];

      // ── 1. BIR Compliance (all business types) ──
      const birItems: ComplianceItem[] = [
        {
          id: 'bir_tin',
          label: 'BIR Tax Identification Number (TIN)',
          description: 'Required for all registered businesses in the Philippines',
          status: bir.birTin ? 'compliant' : 'missing',
          actionLabel: 'Configure',
          actionHref: `${base()}/bir-compliance`,
        },
        {
          id: 'bir_ptu',
          label: 'BIR Permit to Use (PTU)',
          description: 'Required permit for Computerized POS systems (BIR RR 10-2015)',
          status: expiryStatus(bir.birPtuExpiryDate, !!bir.birPtuNumber),
          daysUntilExpiry: daysLeft(bir.birPtuExpiryDate),
          actionLabel: 'Configure',
          actionHref: `${base()}/bir-compliance`,
        },
        {
          id: 'audit_trail',
          label: 'Audit Trail System',
          description: 'All transactions and user actions logged (BIR-required for CAS)',
          status: 'compliant',
        },
      ];
      allSections.push({ title: 'BIR Compliance', items: birItems });
      allItems.push(...birItems);

      // ── 2. Business Permits (all business types) ──
      const permitsItems: ComplianceItem[] = [
        {
          id: 'mayors_permit',
          label: "Mayor's Business Permit",
          description: 'Local government permit required to operate a business (RA 7160)',
          status: expiryStatus(permits.mayorsPermitExpiry, !!permits.mayorsPermitNumber),
          daysUntilExpiry: daysLeft(permits.mayorsPermitExpiry),
          actionLabel: 'Configure',
          actionHref: `${base()}/business-permits`,
        },
        {
          id: 'barangay_clearance',
          label: 'Barangay Business Clearance',
          description: 'Clearance from the barangay where your business is located',
          status: expiryStatus(permits.barangayClearanceExpiry, !!permits.barangayClearanceNumber),
          daysUntilExpiry: daysLeft(permits.barangayClearanceExpiry),
          actionLabel: 'Configure',
          actionHref: `${base()}/business-permits`,
        },
        {
          id: 'dti_sec',
          label: 'DTI / SEC Registration',
          description: 'DTI Business Name Registration (sole proprietors) or SEC registration (corporations)',
          status: permits.dtiSecRegistration ? 'compliant' : 'missing',
          actionLabel: 'Configure',
          actionHref: `${base()}/business-permits`,
        },
        {
          id: 'bir_cor',
          label: 'BIR Certificate of Registration (COR)',
          description: 'BIR COR — proof of BIR registration for the business',
          status: permits.birCertificateOfRegistration ? 'compliant' : 'missing',
          actionLabel: 'Configure',
          actionHref: `${base()}/business-permits`,
        },
        {
          id: 'fsic',
          label: 'Fire Safety Inspection Certificate (FSIC)',
          description: 'Issued by Bureau of Fire Protection (BFP) — annual renewal',
          status: expiryStatus(permits.fsicExpiry, !!permits.fireSafetyInspectionCertificate),
          daysUntilExpiry: daysLeft(permits.fsicExpiry),
          actionLabel: 'Configure',
          actionHref: `${base()}/business-permits`,
        },
      ];

      // Sanitary permit for applicable types
      if (bType === 'general' || !bType) {
        permitsItems.push({
          id: 'sanitary_permit',
          label: 'Sanitary Permit',
          description: 'Issued by LGU Health Office',
          status: expiryStatus(permits.sanitaryPermitExpiry, !!permits.sanitaryPermitNumber),
          daysUntilExpiry: daysLeft(permits.sanitaryPermitExpiry),
          actionLabel: 'Configure',
          actionHref: `${base()}/business-permits`,
        });
      }

      allSections.push({ title: 'Business Permits (LGU)', items: permitsItems });
      allItems.push(...permitsItems);

      // ── 3. Business-type-specific compliance ──
      if (bType === 'retail') {
        const retailItems: ComplianceItem[] = [
          {
            id: 'dti_bn',
            label: 'DTI Business Name Registration',
            description: 'Required for retail sole proprietors operating under a trade name',
            status: retail.dtiBusinessNameRegistration ? 'compliant' : 'missing',
            actionLabel: 'Configure',
            actionHref: `${base()}/retail-compliance`,
          },
          {
            id: 'price_tagging',
            label: 'Price Tagging (RA 7394)',
            description: 'All products must have visible price tags per Consumer Act',
            status: retail.priceTaggingCompliant ? 'compliant' : 'missing',
            actionLabel: 'Configure',
            actionHref: `${base()}/retail-compliance`,
          },
          {
            id: 'weights_measures',
            label: 'Weights & Measures',
            description: 'Weighing devices calibrated and stamped by DOST-MSSM',
            status: retail.weightsAndMeasuresCompliant ? 'compliant' : 'missing',
            actionLabel: 'Configure',
            actionHref: `${base()}/retail-compliance`,
          },
          {
            id: 'product_labels',
            label: 'Product Labeling Compliance (RA 7394)',
            description: 'All products display mandatory label information',
            status: retail.productLabelsCompliant ? 'compliant' : 'missing',
            actionLabel: 'Configure',
            actionHref: `${base()}/retail-compliance`,
          },
        ];
        allSections.push({ title: 'Retail Store Compliance (RA 7394 Consumer Act)', items: retailItems });
        allItems.push(...retailItems);
      }

      const hasCritical = allItems.some(i => i.status === 'expired' || i.status === 'missing');
      const hasWarning = allItems.some(i => i.status === 'warning');
      setOverallStatus(hasCritical ? 'critical' : hasWarning ? 'action_required' : 'compliant');
      setSections(allSections);
    } catch {
      toast.error(dict?.admin?.failedToLoadComplianceData || 'Failed to load compliance data');
    } finally {
      setLoading(false);
    }
  }, [tenant, lang, dict]);

  useEffect(() => { buildDashboard(); }, [buildDashboard]);

  const overallBadge = {
    compliant: { label: dict?.admin?.complianceAllCompliant || 'All Compliant', cls: 'bg-green-50 text-green-800 border border-green-300' },
    action_required: { label: dict?.admin?.complianceActionRequired || 'Action Required', cls: 'bg-amber-50 text-amber-800 border border-amber-300' },
    critical: { label: dict?.admin?.complianceAttentionNeeded || 'Attention Needed', cls: 'bg-red-50 text-red-800 border border-red-300' },
  }[overallStatus];

  const quickLinks = [
    { label: 'Business Permits', href: `/${tenant}/${lang}/admin/business-permits` },
    { label: 'BIR Compliance', href: `/${tenant}/${lang}/admin/bir-compliance` },
    ...(businessType === 'retail' ? [{ label: 'Retail Compliance', href: `/${tenant}/${lang}/admin/retail-compliance` }] : []),
  ];

  const compliantCount = sections.flatMap(s => s.items).filter(i => i.status === 'compliant').length;
  const totalCount = sections.flatMap(s => s.items).length;

  if (!canView) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <div className="bg-red-50 border-2 border-red-300 p-6">
          <h2 className="text-lg font-bold text-red-800 mb-1">{dict?.admin?.accessRestricted || 'Access Restricted'}</h2>
          <p className="text-sm text-red-700">
            {dict?.admin?.accessRestrictedCompliance || "You don't have permission to view the compliance dashboard. Contact an admin or owner."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-6">

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-brand flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{dict?.admin?.complianceDashboard || 'Compliance Dashboard'}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{dict?.admin?.complianceDashboardSubtitle || 'Your Philippine regulatory compliance status at a glance'}</p>
          </div>
        </div>
        {!loading && (
          <span className={`text-xs px-3 py-1.5 font-semibold ${overallBadge.cls}`}>
            {overallBadge.label}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400">
          <div className="text-center">
            <div className="inline-block animate-spin h-7 w-7 border-b-2 border-brand mb-3" />
            <p className="text-sm">{dict?.admin?.loadingComplianceData || 'Loading compliance data...'}</p>
          </div>
        </div>
      ) : (
        <div className="flex gap-6 items-start">

          {/* Left — Quick links + summary */}
          <aside className="w-52 shrink-0 sticky top-6 space-y-4">
            {/* Progress */}
            <div className="bg-white border border-gray-300 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{dict?.admin?.progress || 'Progress'}</p>
              <div className="text-2xl font-bold text-gray-900 mb-1">{compliantCount}<span className="text-sm text-gray-400 font-normal"> / {totalCount}</span></div>
              <p className="text-xs text-gray-500 mb-3">{dict?.admin?.itemsCompliant || 'items compliant'}</p>
              <div className="w-full bg-gray-100 h-1.5">
                <div
                  className="h-1.5 bg-green-500 transition-all"
                  style={{ width: totalCount ? `${(compliantCount / totalCount) * 100}%` : '0%' }}
                />
              </div>
            </div>

            {/* Quick links */}
            <div className="bg-white border border-gray-300 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{dict?.admin?.quickLinks || 'Quick Links'}</p>
              <div className="space-y-1">
                {quickLinks.map(l => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="flex items-center justify-between px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                  >
                    <span className="truncate">{l.label}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          </aside>

          {/* Right — Compliance sections */}
          <div className="flex-1 min-w-0 space-y-4">
            {sections.map(section => (
              <div key={section.title} className="bg-white border border-gray-300 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{section.title}</h2>
                </div>
                <div className="divide-y divide-gray-100">
                  {section.items.map(item => (
                    <div
                      key={item.id}
                      className={`flex items-start gap-4 px-5 py-4 border-l-4 ${statusBorder(item.status)} ${statusBg(item.status)}`}
                    >
                      {statusIcon(item.status)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{item.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                        {item.daysUntilExpiry !== undefined && (
                          <p className={`text-xs mt-1 font-medium flex items-center gap-1 ${item.daysUntilExpiry < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                            <Clock className="w-3 h-3" />
                            {item.daysUntilExpiry < 0
                              ? (dict?.admin?.expiredDaysAgo || 'Expired {days} day(s) ago').replace('{days}', String(Math.abs(item.daysUntilExpiry)))
                              : (dict?.admin?.expiresInDays || 'Expires in {days} day(s)').replace('{days}', String(item.daysUntilExpiry))}
                          </p>
                        )}
                      </div>
                      {item.actionHref && item.status !== 'compliant' && item.status !== 'not_applicable' && (
                        <Link
                          href={item.actionHref}
                          className="flex items-center gap-1 text-xs text-brand hover:text-brand-hover whitespace-nowrap shrink-0 font-medium"
                        >
                          {item.actionLabel ?? (dict?.admin?.fix || 'Fix')} <ChevronRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
