'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface Customer {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  addresses?: Array<{
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    isDefault?: boolean;
  }>;
  dateOfBirth?: Date;
  tags?: string[];
  totalSpent?: number;
  lastPurchaseDate?: Date;
  lastLogin?: Date;
}

interface Guest {
  guestId: string;
  tenantId: string;
  type: 'guest';
}

interface CustomerAuthContextType {
  customer: Customer | null;
  guest: Guest | null;
  loading: boolean;
  register: (email: string, password: string, firstName: string, lastName: string, phone?: string, tenantSlug?: string) => Promise<{ success: boolean; error?: string }>;
  login: (email: string, password: string, tenantSlug?: string) => Promise<{ success: boolean; error?: string }>;
  loginWithOTP: (phone: string, otp: string, firstName?: string, lastName?: string, tenantSlug?: string) => Promise<{ success: boolean; error?: string }>;
  sendOTP: (phone: string, tenantSlug?: string) => Promise<{ success: boolean; error?: string; retryAfter?: number }>;
  createGuestSession: (tenantSlug?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isGuest: boolean;
  canAccess: boolean; // Either authenticated or guest
}

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(undefined);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Check if customer or guest is authenticated on mount and route changes
  useEffect(() => {
    checkAuth();
  }, [pathname]);

  const checkAuth = async () => {
    try {
      // Check for authenticated customer first
      const customerRes = await fetch('/api/auth/customer/me', { credentials: 'include' });
      if (customerRes.ok) {
        const customerData = await customerRes.json();
        if (customerData.success && customerData.customer) {
          setCustomer(customerData.customer);
          setGuest(null); // Clear guest if customer is authenticated
          setLoading(false);
          return;
        }
      }

      // If no customer, check for guest session
      const guestRes = await fetch('/api/auth/guest/me', { credentials: 'include' });
      if (guestRes.ok) {
        const guestData = await guestRes.json();
        if (guestData.success && guestData.guest) {
          setGuest(guestData.guest);
          setCustomer(null);
          setLoading(false);
          return;
        }
      }

      // No customer or guest session
      setCustomer(null);
      setGuest(null);
    } catch (error) {
      console.error('Auth check failed:', error);
      setCustomer(null);
      setGuest(null);
    } finally {
      setLoading(false);
    }
  };

  const register = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phone?: string,
    tenantSlug?: string
  ) => {
    try {
      const res = await fetch('/api/auth/customer/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, firstName, lastName, phone, tenantSlug }),
      });

      const data = await res.json();
      if (data.success && data.data?.customer) {
        setCustomer(data.data.customer);
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Registration failed' };
      }
    } catch (error: any) {
      return { success: false, error: error.message || 'Registration failed' };
    }
  };

  const login = async (email: string, password: string, tenantSlug?: string) => {
    try {
      const res = await fetch('/api/auth/customer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, tenantSlug }),
      });

      const data = await res.json();
      if (data.success && data.data?.customer) {
        setCustomer(data.data.customer);
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Login failed' };
      }
    } catch (error: any) {
      return { success: false, error: error.message || 'Login failed' };
    }
  };

  const sendOTP = async (phone: string, tenantSlug?: string) => {
    try {
      const res = await fetch('/api/auth/customer/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone, tenantSlug }),
      });

      const data = await res.json();
      if (data.success) {
        return { success: true };
      } else {
        return { 
          success: false, 
          error: data.error || 'Failed to send OTP',
          retryAfter: data.retryAfter,
        };
      }
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to send OTP' };
    }
  };

  const loginWithOTP = async (
    phone: string,
    otp: string,
    firstName?: string,
    lastName?: string,
    tenantSlug?: string
  ) => {
    try {
      const res = await fetch('/api/auth/customer/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone, otp, firstName, lastName, tenantSlug }),
      });

      const data = await res.json();
      if (data.success && data.data?.customer) {
        setCustomer(data.data.customer);
        return { success: true };
      } else {
        return { success: false, error: data.error || 'OTP verification failed' };
      }
    } catch (error: any) {
      return { success: false, error: error.message || 'OTP verification failed' };
    }
  };

  const createGuestSession = async (tenantSlug?: string) => {
    try {
      const res = await fetch('/api/auth/guest/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tenantSlug }),
      });

      const data = await res.json();
      if (data.success && data.data) {
        setGuest({
          guestId: data.data.guestId,
          tenantId: data.data.tenantId,
          type: 'guest',
        });
        setCustomer(null); // Clear customer if creating guest session
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Failed to create guest session' };
      }
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to create guest session' };
    }
  };

  const logout = async () => {
    try {
      // Logout customer if authenticated
      if (customer) {
        await fetch('/api/auth/customer/logout', {
          method: 'POST',
          credentials: 'include',
        });
      }
      // Clear guest session cookie
      if (guest) {
        await fetch('/api/auth/guest/logout', {
          method: 'POST',
          credentials: 'include',
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setCustomer(null);
      setGuest(null);
      router.push('/customer/login');
    }
  };

  return (
    <CustomerAuthContext.Provider
      value={{
        customer,
        guest,
        loading,
        register,
        login,
        loginWithOTP,
        sendOTP,
        createGuestSession,
        logout,
        isAuthenticated: !!customer,
        isGuest: !!guest,
        canAccess: !!customer || !!guest,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const context = useContext(CustomerAuthContext);
  if (context === undefined) {
    throw new Error('useCustomerAuth must be used within a CustomerAuthProvider');
  }
  return context;
}
