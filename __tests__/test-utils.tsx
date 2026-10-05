import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { AuthContext } from '@/contexts/AuthContext';
import { TenantSettingsContext } from '@/contexts/TenantSettingsContext';
import { SubscriptionContext } from '@/contexts/SubscriptionContext';
import { getDefaultTenantSettings } from '@/lib/currency';

type ContextValue<C> = C extends React.Context<infer T> ? NonNullable<T> : never;

interface MockUser {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'manager' | 'cashier' | 'viewer';
  tenantId: string;
}

interface MockTenantSettings {
  tenantId: string;
  currency: string;
  language: string;
  timezone: string;
}

interface MockSubscription {
  tenantId: string;
  plan: string;
  status: 'active' | 'inactive' | 'trial';
  features: Record<string, boolean>;
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  user?: Partial<MockUser>;
  tenantSettings?: Partial<MockTenantSettings>;
  subscription?: Partial<MockSubscription>;
}

const defaultMockUser: MockUser = {
  id: 'test-user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin',
  tenantId: 'test-tenant',
};

const defaultMockTenantSettings: MockTenantSettings = {
  tenantId: 'test-tenant',
  currency: 'USD',
  language: 'en',
  timezone: 'UTC',
};

const defaultMockSubscription: MockSubscription = {
  tenantId: 'test-tenant',
  plan: 'premium',
  status: 'active',
  features: {
    enableTableManagement: true,
    enableLoyalty: true,
    enableInventory: true,
  },
};

/**
 * Custom render function that provides all necessary contexts for testing
 */
function renderWithProviders(
  ui: ReactElement,
  {
    user = {},
    tenantSettings = {},
    subscription = {},
    ...renderOptions
  }: CustomRenderOptions = {}
) {
  const mockUser = { ...defaultMockUser, ...user };
  const mockTenantSettings = { ...defaultMockTenantSettings, ...tenantSettings };
  const mockSubscription = { ...defaultMockSubscription, ...subscription };

  const authValue: ContextValue<typeof AuthContext> = {
    user: { _id: mockUser.id, email: mockUser.email, name: mockUser.name, role: mockUser.role },
    isAuthenticated: true,
    loading: false,
    login: () => Promise.resolve({ success: true }),
    loginQR: () => Promise.resolve({ success: true }),
    logout: () => Promise.resolve(),
    hasRole: (roles: string[]) => roles.includes(mockUser.role),
  };

  const tenantSettingsValue: ContextValue<typeof TenantSettingsContext> = {
    settings: {
      ...getDefaultTenantSettings(),
      currency: mockTenantSettings.currency,
      language: mockTenantSettings.language === 'es' ? 'es' : 'en',
      timezone: mockTenantSettings.timezone,
    },
    loading: false,
    refreshSettings: async () => {},
  };

  const f = mockSubscription.features;
  const subscriptionValue: ContextValue<typeof SubscriptionContext> = {
    subscriptionStatus: {
      isActive: mockSubscription.status !== 'inactive',
      isTrial: mockSubscription.status === 'trial',
      isExpired: false,
      isTrialExpired: false,
      planName: mockSubscription.plan,
      limits: { maxUsers: 100, maxBranches: 10, maxProducts: 10000, maxTransactions: 100000 },
      features: {
        enableInventory: f.enableInventory ?? true,
        enableCategories: f.enableCategories ?? true,
        enableDiscounts: f.enableDiscounts ?? true,
        enableLoyaltyProgram: f.enableLoyalty ?? f.enableLoyaltyProgram ?? true,
        enableCustomerManagement: f.enableCustomerManagement ?? true,
        enableBookingScheduling: f.enableBookingScheduling ?? true,
        enableTableManagement: f.enableTableManagement ?? true,
        enableReports: f.enableReports ?? true,
        enableMultiBranch: f.enableMultiBranch ?? true,
        enableHardwareIntegration: f.enableHardwareIntegration ?? true,
        prioritySupport: f.prioritySupport ?? false,
        customIntegrations: f.customIntegrations ?? false,
        dedicatedAccountManager: f.dedicatedAccountManager ?? false,
      },
      usage: { currentUsers: 1, currentBranches: 1, currentProducts: 0, currentTransactions: 0 },
      billingCycle: 'monthly',
    },
    loading: false,
    refreshSubscription: async () => {},
  };

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <AuthContext.Provider value={authValue}>
        <TenantSettingsContext.Provider value={tenantSettingsValue}>
          <SubscriptionContext.Provider value={subscriptionValue}>
            {children}
          </SubscriptionContext.Provider>
        </TenantSettingsContext.Provider>
      </AuthContext.Provider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

export * from '@testing-library/react';
export { renderWithProviders };
