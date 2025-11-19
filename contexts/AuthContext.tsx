'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface User {
  _id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'manager' | 'cashier' | 'viewer';
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, tenantSlug: string) => Promise<{ success: boolean; error?: string }>;
  loginPIN: (pin: string, tenantSlug: string) => Promise<{ success: boolean; error?: string }>;
  loginQR: (qrToken: string, tenantSlug: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  hasRole: (roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Check if user is authenticated on mount and route changes
  useEffect(() => {
    checkAuth();
  }, [pathname]);

  const checkAuth = async () => {
    try {
      // Check if we have a token in cookies
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string, tenantSlug: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, tenantSlug }),
      });

      const data = await res.json();
      if (data.success && data.data?.user) {
        setUser(data.data.user);
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Login failed' };
      }
    } catch (error: any) {
      return { success: false, error: error.message || 'Login failed' };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      router.push('/login');
    }
  };

  const loginPIN = async (pin: string, tenantSlug: string) => {
    try {
      const res = await fetch('/api/auth/login-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pin, tenantSlug }),
      });

      const data = await res.json();
      if (data.success && data.data?.user) {
        setUser(data.data.user);
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Login failed' };
      }
    } catch (error: any) {
      return { success: false, error: error.message || 'Login failed' };
    }
  };

  const loginQR = async (qrToken: string, tenantSlug: string) => {
    try {
      const res = await fetch('/api/auth/login-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ qrToken, tenantSlug }),
      });

      const data = await res.json();
      if (data.success && data.data?.user) {
        setUser(data.data.user);
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Login failed' };
      }
    } catch (error: any) {
      return { success: false, error: error.message || 'Login failed' };
    }
  };

  const hasRole = (roles: string[]): boolean => {
    if (!user) return false;
    const roleHierarchy: Record<string, number> = {
      viewer: 1,
      cashier: 2,
      manager: 3,
      admin: 4,
      owner: 5,
    };
    const userLevel = roleHierarchy[user.role] || 0;
    return roles.some(role => roleHierarchy[role] <= userLevel);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        loginPIN,
        loginQR,
        logout,
        isAuthenticated: !!user,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

