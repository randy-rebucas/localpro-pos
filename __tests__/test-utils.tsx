import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { AuthContext } from '@/contexts/AuthContext';
import { TenantSettingsContext } from '@/contexts/TenantSettingsContext';
import { SubscriptionContext } from '@/contexts/SubscriptionContext';

interface MockUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'staff' | 'manager';
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

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <AuthContext.Provider
        value={{
          user: mockUser as any,
          isAuthenticated: true,
          isLoading: false,
          logout: () => Promise.resolve(),
        }}
      >
        <TenantSettingsContext.Provider
          value={{
            tenantId: mockTenantSettings.tenantId,
            currency: mockTenantSettings.currency,
            language: mockTenantSettings.language,
            timezone: mockTenantSettings.timezone,
          } as any}
        >
          <SubscriptionContext.Provider
            value={{
              subscriptionStatus: {
                tenantId: mockSubscription.tenantId,
                plan: mockSubscription.plan,
                status: mockSubscription.status,
                features: mockSubscription.features,
              },
              isLoading: false,
              error: null,
              refreshSubscription: async () => {},
            } as any}
          >
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
