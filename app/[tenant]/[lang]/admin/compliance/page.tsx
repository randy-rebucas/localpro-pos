'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ShieldCheck, AlertTriangle, XCircle, CheckCircle, ChevronRight, Clock, Minus } from 'lucide-react';

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

function expiryStatus(dateStr: string | null | undefined, isPresent: boolean): ComplianceStatus {
  if (!isPresent) return 'missing';
  if (!dateStr) return 'compliant';
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (days < 0) return 'expired';
  if (days <= 30) return 'warning';
  return 'compliant';
}

function daysLeft(dateStr?: string | null) {
  if (!dateStr) return undefined;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function CompliancePage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;

  const [sections, setSections] = useState<ComplianceSection[]>([]);
  const [overallStatus, setOverallStatus] = useState<'compliant' | 'action_required' | 'critical'>('compliant');
  const [businessType, setBusinessType] = useState('');
  const [loading, setLoading] = useState(true);

  const buildDashboard = useCallback(async () => {
    try {
      // Fetch all compliance data in parallel
      const [birRes, permitsRes, subRes, restaurantRes, retailRes, laundryRes, serviceRes, pharmacyRes] = await Promise.all([
        fetch(`/api/tenants/${tenant}/bir-settings`),
        fetch(`/api/tenants/${tenant}/business-permits`),
        fetch('/api/subscription/status'),
        fetch(`/api/tenants/${tenant}/restaurant-compliance`),
        fetch(`/api/tenants/${tenant}/retail-compliance`),
        fetch(`/api/tenants/${tenant}/laundry-compliance`),
        fetch(`/api/tenants/${tenant}/service-compliance`),
        fetch(`/api/tenants/${tenant}/pharmacy-settings`),
      ]);

      const [birJson, permitsJson, subJson, restaurantJson, retailJson, laundryJson, serviceJson, pharmacyJson] = await Promise.all([
        birRes.json(), permitsRes.json(), subRes.json(),
        restaurantRes.json(), retailRes.json(), laundryRes.json(),
        serviceRes.json(), pharmacyRes.json(),
      ]);

      const bir = birJson.success ? birJson.data : {};
      const permits = permitsJson.success ? permitsJson.data : {};
      const sub = subJson.data ?? {};
      const restaurant = restaurantJson.success ? restaurantJson.data : {};
      const retail = retailJson.success ? retailJson.data : {};
      const laundry = laundryJson.success ? laundryJson.data : {};
      const service = serviceJson.success ? serviceJson.data : {};
      const pharmacy = pharmacyJson.success ? pharmacyJson.data : {};

      const bType = (sub.businessType as string) ?? '';
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
    } catch {
      toast.error('Failed to load compliance data');
    } finally {
      setLoading(false);
    }
  }, [tenant, lang]);

  useEffect(() => { buildDashboard(); }, [buildDashboard]);

  const overallBadge = {
    compliant: { label: 'All Compliant', cls: 'bg-green-50 text-green-800 border border-green-300' },
    action_required: { label: 'Action Required', cls: 'bg-amber-50 text-amber-800 border border-amber-300' },
    critical: { label: 'Attention Needed', cls: 'bg-red-50 text-red-800 border border-red-300' },
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

  return (
    <div className="px-4 sm:px-6 py-6">

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-brand flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Compliance Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">Your Philippine regulatory compliance status at a glance</p>
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
            <p className="text-sm">Loading compliance data...</p>
          </div>
        </div>
      ) : (
        <div className="flex gap-6 items-start">

          {/* Left — Quick links + summary */}
          <aside className="w-52 shrink-0 sticky top-6 space-y-4">
            {/* Progress */}
            <div className="bg-white border border-gray-300 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Progress</p>
              <div className="text-2xl font-bold text-gray-900 mb-1">{compliantCount}<span className="text-sm text-gray-400 font-normal"> / {totalCount}</span></div>
              <p className="text-xs text-gray-500 mb-3">items compliant</p>
              <div className="w-full bg-gray-100 h-1.5">
                <div
                  className="h-1.5 bg-green-500 transition-all"
                  style={{ width: totalCount ? `${(compliantCount / totalCount) * 100}%` : '0%' }}
                />
              </div>
            </div>

            {/* Quick links */}
            <div className="bg-white border border-gray-300 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick Links</p>
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
                              ? `Expired ${Math.abs(item.daysUntilExpiry)} day(s) ago`
                              : `Expires in ${item.daysUntilExpiry} day(s)`}
                          </p>
                        )}
                      </div>
                      {item.actionHref && item.status !== 'compliant' && item.status !== 'not_applicable' && (
                        <Link
                          href={item.actionHref}
                          className="flex items-center gap-1 text-xs text-brand hover:text-brand-hover whitespace-nowrap shrink-0 font-medium"
                        >
                          {item.actionLabel ?? 'Fix'} <ChevronRight className="w-3 h-3" />
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
