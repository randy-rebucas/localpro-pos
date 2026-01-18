import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { isFeatureAllowed } from '@/lib/tenant';

interface FeatureGateProps {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function FeatureGate({ feature, children, fallback = null }: FeatureGateProps) {
  const { plan } = useTenantSettings();
  if (!plan || isFeatureAllowed(plan.key, feature)) {
    return <>{children}</>;
  }
  return fallback || (
    <div className="p-4 bg-yellow-50 border-2 border-yellow-300 text-yellow-800 rounded">
      This feature is not available on your current subscription plan.
    </div>
  );
}
