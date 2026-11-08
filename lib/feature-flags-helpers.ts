/* eslint-disable @typescript-eslint/no-explicit-any */
import { getBusinessTypeConfig } from '@/lib/business-types';

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

/**
 * What the app does when a flag was never saved. With a business type this is
 * that type's preset — the same fallback supportsFeature() and the Business
 * Type page use, so the two pages agree. Tables count as on when unset, because
 * the tables page and /api/tables only switch off on an explicit false.
 */
export const getFeatureFlagDefault = (flagKey: FeatureFlagKey, businessType?: string): boolean => {
  if (businessType && flagKey !== 'enableTableManagement') {
    const preset = (getBusinessTypeConfig(businessType).defaultFeatures as Record<string, boolean | undefined>)[flagKey];
    if (typeof preset === 'boolean') return preset;
  }
  const defaults: Record<FeatureFlagKey, boolean> = {
    enableInventory: true,
    enableCategories: true,
    enableDiscounts: false,
    enableLoyaltyProgram: false,
    enableCustomerManagement: false,
    enableBookingScheduling: false,
    enableTableManagement: true,
  };
  return defaults[flagKey];
};

export const getFeatureFlagLabel = (flagKey: string, dict: any): string => {
  const labelMap: Record<string, string> = {
    enableInventory: dict?.admin?.enableInventoryManagement || 'Enable Inventory Management',
    enableCategories: dict?.admin?.enableCategories || 'Enable Categories',
    enableDiscounts: dict?.admin?.enableDiscounts || 'Enable Discounts',
    enableLoyaltyProgram: dict?.admin?.enableLoyaltyProgram || 'Enable Loyalty Program',
    enableCustomerManagement: dict?.admin?.enableCustomerManagement || 'Enable Customer Management',
    enableBookingScheduling: dict?.admin?.enableBookingScheduling || 'Enable Booking & Scheduling',
    enableTableManagement: dict?.admin?.enableTableManagement || 'Enable Table Management',
  };
  return labelMap[flagKey] || flagKey;
};

export const getFeatureFlagDescription = (flagKey: string, dict: any): string => {
  const descriptionMap: Record<string, string> = {
    enableInventory: dict?.admin?.enableInventoryManagementDesc || 'Enable real-time stock tracking and inventory management',
    enableCategories: dict?.admin?.enableCategoriesDesc || 'Enable product categorization and organization',
    enableDiscounts: dict?.admin?.enableDiscountsDesc || 'Enable discount codes and promotional pricing',
    enableLoyaltyProgram: dict?.admin?.enableLoyaltyProgramDesc || 'Enable customer loyalty points and rewards system',
    enableCustomerManagement: dict?.admin?.enableCustomerManagementDesc || 'Enable customer profiles and history tracking',
    enableBookingScheduling: dict?.admin?.enableBookingSchedulingDesc || 'Enable appointment booking and scheduling',
    enableTableManagement: dict?.admin?.enableTableManagementDesc || 'Seat orders at numbered tables and see which are open, taken or waiting for the bill',
  };
  return descriptionMap[flagKey] || '';
};
