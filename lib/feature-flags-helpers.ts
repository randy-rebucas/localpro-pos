/* eslint-disable @typescript-eslint/no-explicit-any */

export const getSaveSuccessMessage = (dict: any): string => {
  return dict?.admin?.featureFlagsSavedSuccess || 'Feature flags saved successfully!';
};

export const getSaveErrorMessage = (dict: any, statusCode?: number): string => {
  if (statusCode === 401 || statusCode === 403) {
    return dict?.settings?.unauthorized || 'Unauthorized. Please login with admin account.';
  }
  return dict?.admin?.failedToSaveFeatureFlags || 'Failed to save feature flags';
};

export const getConnectionErrorMessage = (dict: any): string => {
  return (
    dict?.admin?.failedToSaveFeatureFlagsConnection ||
    'Failed to save feature flags. Please check your connection.'
  );
};

export const getLoadErrorMessage = (dict: any): string => {
  return dict?.admin?.failedToLoadSettings || 'Unable to load tenant settings. Please check your connection and try again.';
};

export const getLoadConnectionErrorMessage = (dict: any): string => {
  return dict?.admin?.failedToLoadSettingsConnection || 'Failed to load settings. Please check your connection.';
};

export const getFeatureFlagLabel = (flagKey: string, dict: any): string => {
  const labelMap: Record<string, string> = {
    enableInventory: dict?.admin?.enableInventoryManagement || 'Enable Inventory Management',
    enableCategories: dict?.admin?.enableCategories || 'Enable Categories',
    enableDiscounts: dict?.admin?.enableDiscounts || 'Enable Discounts',
    enableLoyaltyProgram: dict?.admin?.enableLoyaltyProgram || 'Enable Loyalty Program',
    enableCustomerManagement:
      dict?.admin?.enableCustomerManagement || 'Enable Customer Management',
    enableBookingScheduling:
      dict?.admin?.enableBookingScheduling || 'Enable Booking & Scheduling',
    enableTableManagement:
      dict?.admin?.enableTableManagement || 'Enable Table Management',
    enableAttendance: dict?.admin?.enableAttendance || 'Attendance Tracking',
    enableExpenses: dict?.admin?.enableExpenses || 'Expense Management',
    enableMultiCurrency: dict?.admin?.enableMultiCurrency || 'Multi-Currency Support',
    enableBundling: dict?.admin?.enableBundling || 'Product Bundles',
    enableHardwareIntegration: dict?.admin?.enableHardwareIntegration || 'Hardware Integration',
    enableBIR: dict?.admin?.enableBIR || 'BIR Compliance',
  };
  return labelMap[flagKey] || flagKey;
};

export const getFeatureFlagDescription = (flagKey: string, dict: any): string => {
  const descriptionMap: Record<string, string> = {
    enableInventory: dict?.admin?.enableInventoryManagementDesc || 'Enable real-time stock tracking and inventory management',
    enableCategories: dict?.admin?.enableCategoriesDesc || 'Enable product categorization and organization',
    enableDiscounts: dict?.admin?.enableDiscountsDesc || 'Enable discount codes and promotional pricing',
    enableLoyaltyProgram:
      dict?.admin?.enableLoyaltyProgramDesc || 'Enable customer loyalty points and rewards system',
    enableCustomerManagement:
      dict?.admin?.enableCustomerManagementDesc || 'Enable customer profiles and history tracking',
    enableBookingScheduling:
      dict?.admin?.enableBookingSchedulingDesc ||
      'Enable appointment booking and scheduling features for salons, cleaners, and service businesses',
    enableTableManagement:
      dict?.admin?.enableTableManagementDesc ||
      'Enable table management for restaurants and service businesses',
  };
  return descriptionMap[flagKey] || '';
};

export const FEATURE_FLAGS = [
  'enableInventory',
  'enableCategories',
  'enableDiscounts',
  'enableLoyaltyProgram',
  'enableCustomerManagement',
  'enableBookingScheduling',
  'enableTableManagement',
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number];

export const getFeatureFlagDefault = (flagKey: FeatureFlagKey): boolean => {
  const defaults: Record<FeatureFlagKey, boolean> = {
    enableInventory: true,
    enableCategories: true,
    enableDiscounts: false,
    enableLoyaltyProgram: false,
    enableCustomerManagement: false,
    enableBookingScheduling: false,
    enableTableManagement: false,
  };
  return defaults[flagKey];
};
