'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, XCircle, CheckCircle, ChevronRight, Clock, Minus, type LucideIcon } from 'lucide-react';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
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

const STATUS_STYLE: Record<ComplianceStatus, { bg: string; icon: LucideIcon; dictKey: string; fallback: string }> = {
  compliant: { bg: 'bg-win8-success', icon: CheckCircle, dictKey: 'complianceStatusCompliant', fallback: 'Compliant' },
  warning: { bg: 'bg-win8-warning', icon: AlertTriangle, dictKey: 'complianceStatusWarning', fallback: 'Expiring Soon' },
  expired: { bg: 'bg-win8-danger', icon: XCircle, dictKey: 'complianceStatusExpired', fallback: 'Expired' },
  missing: { bg: 'bg-win8-danger', icon: XCircle, dictKey: 'complianceStatusMissing', fallback: 'Missing' },
  not_applicable: { bg: 'bg-gray-500', icon: Minus, dictKey: 'complianceStatusNotApplicable', fallback: 'N/A' },
};

const OVERALL_BADGE: Record<'compliant' | 'action_required' | 'critical', string> = {
  compliant: 'bg-win8-success text-white',
  action_required: 'bg-win8-warning text-white',
  critical: 'bg-win8-danger text-white',
};

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
  const [loadFailed, setLoadFailed] = useState(false);
  const { canAccess } = usePermissions();
  const canView = canAccess('compliance.view');

  const buildDashboard = useCallback(async () => {
    try {
      // Fetch all compliance data in parallel
      const [birRes, permitsRes, settingsRes, restaurantRes, retailRes, laundryRes, serviceRes, pharmacyRes] = await Promise.all([
        fetch(`/api/tenants/${tenant}/bir-settings`),
        fetch(`/api/tenants/${tenant}/business-permits`),
        fetch(`/api/tenants/${tenant}/settings`),
        fetch(`/api/tenants/${tenant}/restaurant-compliance`),
        fetch(`/api/tenants/${tenant}/retail-compliance`),
        fetch(`/api/tenants/${tenant}/laundry-compliance`),
        fetch(`/api/tenants/${tenant}/service-compliance`),
        fetch(`/api/tenants/${tenant}/pharmacy-settings`),
      ]);

      const [birJson, permitsJson, settingsJson, restaurantJson, retailJson, laundryJson, serviceJson, pharmacyJson] = await Promise.all([
        birRes.json(), permitsRes.json(), settingsRes.json(),
        restaurantRes.json(), retailRes.json(), laundryRes.json(),
        serviceRes.json(), pharmacyRes.json(),
      ]);

      const bir = birJson.success ? birJson.data : {};
      const permits = permitsJson.success ? permitsJson.data : {};
      const tenantSettings = settingsJson.success ? settingsJson.data : {};
      const restaurant = restaurantJson.success ? restaurantJson.data : {};
      const retail = retailJson.success ? retailJson.data : {};
      const laundry = laundryJson.success ? laundryJson.data : {};
      const service = serviceJson.success ? serviceJson.data : {};
      const pharmacy = pharmacyJson.success ? pharmacyJson.data : {};

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
      if (['restaurant', 'laundry', 'service', 'general'].includes(bType) || !bType) {
        permitsItems.push({
          id: 'sanitary_permit',
          label: 'Sanitary Permit',
          description: 'Issued by LGU Health Office — required for food and personal service businesses',
          status: expiryStatus(permits.sanitaryPermitExpiry, !!permits.sanitaryPermitNumber),
          daysUntilExpiry: daysLeft(permits.sanitaryPermitExpiry),
          actionLabel: 'Configure',
          actionHref: `${base()}/business-permits`,
        });
      }

      allSections.push({ title: 'Business Permits (LGU)', items: permitsItems });
      allItems.push(...permitsItems);

      // ── 3. Business-type-specific compliance ──
      if (bType === 'restaurant') {
        const restaurantItems: ComplianceItem[] = [
          {
            id: 'fda_fbl',
            label: 'FDA Food Business License (FBL)',
            description: 'Required for all food businesses under RA 10611 (Food Safety Act)',
            status: expiryStatus(restaurant.fdaFblExpiry, !!restaurant.fdaFoodBusinessLicense),
            daysUntilExpiry: daysLeft(restaurant.fdaFblExpiry),
            actionLabel: 'Configure',
            actionHref: `${base()}/restaurant-compliance`,
          },
          {
            id: 'food_safety_cert',
            label: 'Food Safety Certificate',
            description: 'Certificate of compliance with food safety management system',
            status: expiryStatus(restaurant.foodSafetyCertificateExpiry, !!restaurant.foodSafetyCertificateNumber),
            daysUntilExpiry: daysLeft(restaurant.foodSafetyCertificateExpiry),
            actionLabel: 'Configure',
            actionHref: `${base()}/restaurant-compliance`,
          },
          {
            id: 'food_handlers',
            label: 'Food Handlers Health Certificates',
            description: 'All food-handling staff must have valid health certificates (LGU Health Office)',
            status: restaurant.foodHandlersCertified ? expiryStatus(restaurant.healthCertificateExpiry, true) : 'missing',
            daysUntilExpiry: daysLeft(restaurant.healthCertificateExpiry),
            actionLabel: 'Configure',
            actionHref: `${base()}/restaurant-compliance`,
          },
          {
            id: 'kitchen_sanitation',
            label: 'Kitchen Sanitation Standards',
            description: 'Kitchen meets DOH/LGU sanitation requirements (RA 10611)',
            status: restaurant.kitchenSanitationCompliant ? 'compliant' : 'missing',
            actionLabel: 'Configure',
            actionHref: `${base()}/restaurant-compliance`,
          },
        ];
        allSections.push({ title: 'Restaurant / Food Service Compliance (RA 10611)', items: restaurantItems });
        allItems.push(...restaurantItems);
      }

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

      if (bType === 'laundry') {
        const laundryItems: ComplianceItem[] = [
          {
            id: 'ecc',
            label: 'Environmental Compliance Certificate (ECC)',
            description: 'Required for laundry businesses discharging wastewater — issued by DENR-EMB',
            status: expiryStatus(laundry.eccExpiry, !!laundry.environmentalComplianceCertificate),
            daysUntilExpiry: daysLeft(laundry.eccExpiry),
            actionLabel: 'Configure',
            actionHref: `${base()}/laundry-compliance`,
          },
          {
            id: 'wastewater_permit',
            label: 'Wastewater Discharge Permit',
            description: 'DENR Discharge Permit for effluent release to water bodies or sewage',
            status: expiryStatus(laundry.wastewaterPermitExpiry, !!laundry.wastewaterDischargePermit),
            daysUntilExpiry: daysLeft(laundry.wastewaterPermitExpiry),
            actionLabel: 'Configure',
            actionHref: `${base()}/laundry-compliance`,
          },
          {
            id: 'solid_waste',
            label: 'Solid Waste Management Plan (RA 9003)',
            description: 'Business has an ecological solid waste management program',
            status: laundry.solidWasteManagementPlan ? 'compliant' : 'missing',
            actionLabel: 'Configure',
            actionHref: `${base()}/laundry-compliance`,
          },
        ];
        allSections.push({ title: 'Laundry Service Compliance (DENR/EMB)', items: laundryItems });
        allItems.push(...laundryItems);
      }

      if (bType === 'service') {
        const licenseStatuses = (service.practitionerLicenses ?? []).map((l: { licenseExpiry?: string; prcNumber?: string }) =>
          expiryStatus(l.licenseExpiry, !!l.prcNumber)
        );
        const worstLicense = licenseStatuses.includes('expired') ? 'expired'
          : licenseStatuses.includes('warning') ? 'warning'
          : licenseStatuses.includes('missing') ? 'missing'
          : licenseStatuses.length === 0 ? 'missing' : 'compliant';

        const serviceItems: ComplianceItem[] = [
          {
            id: 'doh_accreditation',
            label: 'DOH Accreditation',
            description: 'Required for health-related service businesses (spa, massage, wellness)',
            status: expiryStatus(service.dohAccreditationExpiry, !!service.dohAccreditation),
            daysUntilExpiry: daysLeft(service.dohAccreditationExpiry),
            actionLabel: 'Configure',
            actionHref: `${base()}/service-compliance`,
          },
          {
            id: 'practitioner_licenses',
            label: `Practitioner PRC Licenses (${(service.practitionerLicenses ?? []).length} on file)`,
            description: 'All practitioners must hold valid PRC licenses for their profession',
            status: worstLicense as ComplianceStatus,
            actionLabel: 'Manage Licenses',
            actionHref: `${base()}/service-compliance`,
          },
        ];
        allSections.push({ title: 'Service Business Compliance (DOH/PRC)', items: serviceItems });
        allItems.push(...serviceItems);
      }

      if (bType === 'pharmacy') {
        const pharmacyItems: ComplianceItem[] = [
          {
            id: 'pharmacist_prc',
            label: 'Licensed Pharmacist (PRC)',
            description: 'A PRC-licensed pharmacist must be on duty at all times (RA 5921)',
            status: pharmacy.pharmacistPRCNumber ? 'compliant' : 'missing',
            actionLabel: 'Configure',
            actionHref: `${base()}/pharmacy-compliance`,
          },
          {
            id: 'fda_lto',
            label: 'FDA License to Operate (LTO)',
            description: 'Required FDA license for all retail pharmacies',
            status: expiryStatus(pharmacy.fdaLTOExpiryDate, !!pharmacy.fdaLTO),
            daysUntilExpiry: daysLeft(pharmacy.fdaLTOExpiryDate),
            actionLabel: 'Configure',
            actionHref: `${base()}/pharmacy-compliance`,
          },
        ];
        if (pharmacy.pdeaLicense !== undefined || pharmacy.pdeaLicenseExpiry) {
          pharmacyItems.push({
            id: 'pdea_license',
            label: 'PDEA License (Dangerous Drugs)',
            description: 'Required for dispensing Schedule 1 (dangerous) drugs',
            status: expiryStatus(pharmacy.pdeaLicenseExpiry, !!pharmacy.pdeaLicense),
            daysUntilExpiry: daysLeft(pharmacy.pdeaLicenseExpiry),
            actionLabel: 'Configure',
            actionHref: `${base()}/pharmacy-compliance`,
          });
        }
        pharmacyItems.push({
          id: 'expiry_tracking',
          label: 'Drug Expiry Tracking',
          description: 'Monitor expiry dates on all pharmaceutical products',
          status: pharmacy.trackExpiryDates !== false ? 'compliant' : 'missing',
          actionLabel: 'View Report',
          actionHref: `${base()}/expiry-tracking`,
        });
        allSections.push({ title: 'Pharmacy Compliance (FDA/DOH/PDEA — RA 5921)', items: pharmacyItems });
        allItems.push(...pharmacyItems);
      }

      const hasCritical = allItems.some(i => i.status === 'expired' || i.status === 'missing');
      const hasWarning = allItems.some(i => i.status === 'warning');
      setOverallStatus(hasCritical ? 'critical' : hasWarning ? 'action_required' : 'compliant');
      setSections(allSections);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [tenant, lang]);

  useEffect(() => { buildDashboard(); }, [buildDashboard]);

  const retryLoad = () => {
    setLoading(true);
    setLoadFailed(false);
    buildDashboard();
  };

  const overallLabel = {
    compliant: dict?.admin?.complianceAllCompliant || 'All Compliant',
    action_required: dict?.admin?.complianceActionRequired || 'Action Required',
    critical: dict?.admin?.complianceAttentionNeeded || 'Attention Needed',
  }[overallStatus];

  const quickLinks = [
    { label: 'Business Permits', href: `/${tenant}/${lang}/admin/business-permits` },
    { label: 'BIR Compliance', href: `/${tenant}/${lang}/admin/bir-compliance` },
    ...(businessType === 'restaurant' ? [{ label: 'Food Service Compliance', href: `/${tenant}/${lang}/admin/restaurant-compliance` }] : []),
    ...(businessType === 'retail' ? [{ label: 'Retail Compliance', href: `/${tenant}/${lang}/admin/retail-compliance` }] : []),
    ...(businessType === 'laundry' ? [{ label: 'Laundry Compliance', href: `/${tenant}/${lang}/admin/laundry-compliance` }] : []),
    ...(businessType === 'service' ? [{ label: 'Service Compliance', href: `/${tenant}/${lang}/admin/service-compliance` }] : []),
    ...(businessType === 'pharmacy' ? [
      { label: 'Pharmacy Compliance', href: `/${tenant}/${lang}/admin/pharmacy-compliance` },
      { label: 'Prescriptions', href: `/${tenant}/${lang}/admin/prescriptions` },
      { label: 'Expiry Tracking', href: `/${tenant}/${lang}/admin/expiry-tracking` },
    ] : []),
  ];

  const compliantCount = sections.flatMap(s => s.items).filter(i => i.status === 'compliant').length;
  const totalCount = sections.flatMap(s => s.items).length;

  const header = (
    <AdminPageHeader
      title={dict?.admin?.complianceDashboard || 'Compliance Dashboard'}
      description={dict?.admin?.complianceDashboardSubtitle || 'Your Philippine regulatory compliance status at a glance'}
      actions={!loading && !loadFailed && canView ? (
        <span className={`px-3 py-1.5 text-xs font-semibold ${OVERALL_BADGE[overallStatus]}`}>{overallLabel}</span>
      ) : undefined}
    />
  );

  if (!canView) {
    return (
      <div className="px-4 sm:px-6 py-6">
        {header}
        <div className="bg-white border border-win8-danger p-6">
          <h2 className="text-base font-bold text-win8-danger mb-1">{dict?.admin?.accessRestricted || 'Access Restricted'}</h2>
          <p className="text-sm text-gray-700">
            {dict?.admin?.accessRestrictedCompliance || "You don't have permission to view the compliance dashboard. Contact an admin or owner."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      {header}

      {loading ? (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict?.admin?.loadingComplianceData || 'Loading compliance data…'}</p>
        </div>
      ) : loadFailed ? (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{dict?.admin?.failedToLoadComplianceData || 'Failed to load compliance data'}</p>
          <button
            onClick={retryLoad}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict?.common?.retry || 'Retry'}
          </button>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 items-start">

          {/* Left — summary + quick links */}
          <aside className="w-full lg:w-56 shrink-0 lg:sticky lg:top-6 space-y-4">
            {/* Progress */}
            <div className="bg-white border border-gray-300 p-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{dict?.admin?.progress || 'Progress'}</p>
              <p className="text-3xl font-bold tabular-nums text-gray-900 mt-1.5">
                {compliantCount}<span className="text-sm text-gray-400 font-normal"> / {totalCount}</span>
              </p>
              <p className="text-xs text-gray-400 mt-1 mb-3">{dict?.admin?.itemsCompliant || 'items compliant'}</p>
              <div className="w-full bg-gray-100 h-2 overflow-hidden">
                <div
                  className="h-2 bg-win8-success transition-all"
                  style={{ width: totalCount ? `${(compliantCount / totalCount) * 100}%` : '0%' }}
                />
              </div>
            </div>

            {/* Quick links */}
            <div className="bg-white border border-gray-300">
              <p className="px-4 pt-4 pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">{dict?.admin?.quickLinks || 'Quick Links'}</p>
              <div className="divide-y divide-gray-200 border-t border-gray-200">
                {quickLinks.map(l => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="flex items-center justify-between gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-brand transition-colors"
                  >
                    <span className="truncate">{l.label}</span>
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </div>
          </aside>

          {/* Right — compliance sections */}
          <div className="w-full flex-1 min-w-0 space-y-6">
            {sections.map(section => (
              <section key={section.title} className="bg-white border border-gray-300">
                <div className="px-6 py-4 border-b border-gray-300">
                  <h2 className="text-base font-bold text-gray-900">{section.title}</h2>
                </div>
                <div className="divide-y divide-gray-200">
                  {section.items.map(item => {
                    const style = STATUS_STYLE[item.status];
                    const Icon = style.icon;
                    const expired = item.daysUntilExpiry !== undefined && item.daysUntilExpiry < 0;
                    const expiryColor = expired ? 'text-win8-danger' : item.status === 'warning' ? 'text-win8-warning' : 'text-gray-500';
                    return (
                      <div key={item.id} className="flex items-start gap-4 px-6 py-4">
                        <span className={`w-8 h-8 shrink-0 flex items-center justify-center text-white ${style.bg}`} aria-hidden="true">
                          <Icon className="w-4 h-4" />
                        </span>
                        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                              <span className={`px-2 py-0.5 text-xs font-semibold text-white ${style.bg}`}>
                                {dict?.admin?.[style.dictKey] || style.fallback}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                            {item.daysUntilExpiry !== undefined && (
                              <p className={`text-xs mt-1 font-semibold flex items-center gap-1 ${expiryColor}`}>
                                <Clock className="w-3 h-3" aria-hidden="true" />
                                {expired
                                  ? (dict?.admin?.expiredDaysAgo || 'Expired {days} day(s) ago').replace('{days}', String(Math.abs(item.daysUntilExpiry!)))
                                  : (dict?.admin?.expiresInDays || 'Expires in {days} day(s)').replace('{days}', String(item.daysUntilExpiry))}
                              </p>
                            )}
                          </div>
                          {item.actionHref && item.status !== 'compliant' && item.status !== 'not_applicable' && (
                            <Link
                              href={item.actionHref}
                              className="inline-flex items-center justify-center gap-1 self-start shrink-0 whitespace-nowrap px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
                            >
                              {item.actionLabel ?? (dict?.admin?.fix || 'Fix')}
                              <ChevronRight className="w-4 h-4" aria-hidden="true" />
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
