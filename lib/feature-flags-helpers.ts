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
    enableSuppliers: dict?.admin?.enableSuppliers || 'Suppliers & Purchasing',
    enableDelivery: dict?.admin?.enableDelivery || 'Pickup & Delivery',
    enableWorkOrders: dict?.admin?.enableWorkOrders || 'Job / Work Orders',
    enableLaundryOrders: dict?.admin?.enableLaundryOrders || 'Laundry Workflow',
    enableKitchenDisplay: dict?.admin?.enableKitchenDisplay || 'Kitchen Display (KDS)',
    enableEmployees: dict?.admin?.enableEmployees || 'Employees / Staff',
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
    enableSuppliers:
      dict?.admin?.enableSuppliersDesc || 'Enable supplier records and purchase orders',
    enableDelivery:
      dict?.admin?.enableDeliveryDesc || 'Enable pickup and delivery order handling',
    enableWorkOrders:
      dict?.admin?.enableWorkOrdersDesc || 'Enable job/work order tracking for service businesses',
    enableLaundryOrders:
      dict?.admin?.enableLaundryOrdersDesc || 'Enable laundry-specific order workflow (drop-off, tagging, pickup)',
    enableKitchenDisplay:
      dict?.admin?.enableKitchenDisplayDesc || 'Enable the kitchen display system (KDS) for food service',
    enableEmployees:
      dict?.admin?.enableEmployeesDesc || 'Enable employee/staff management features',
  };
  return descriptionMap[flagKey] || '';
};

// Every toggle here must have a matching default in every entry of
// BUSINESS_TYPE_CONFIGS.defaultFeatures (lib/business-types.ts) — that is
// the source of truth for which modules are on/off per business type.
// This list only controls which toggles the tenant admin UI exposes.
export const FEATURE_FLAGS = [
  'enableInventory',
  'enableCategories',
  'enableDiscounts',
  'enableLoyaltyProgram',
  'enableCustomerManagement',
  'enableBookingScheduling',
  'enableTableManagement',
  'enableSuppliers',
  'enableDelivery',
  'enableWorkOrders',
  'enableLaundryOrders',
  'enableKitchenDisplay',
  'enableEmployees',
  'enableExpenses',
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
    enableSuppliers: false,
    enableDelivery: false,
    enableWorkOrders: false,
    enableLaundryOrders: false,
    enableKitchenDisplay: false,
    enableEmployees: false,
    enableExpenses: false,
  };
  return defaults[flagKey];
};
