import { afterEach, beforeAll, afterAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { cacheClear } from '@/lib/cache';

// Cleanup after each test
afterEach(() => {
  cleanup();
  // lib/cache.ts is module-level state — don't let cached lookups leak between tests
  cacheClear();
});

// next/font only works inside the Next compiler; under vitest its loaders are not functions.
// components/marketing/fonts.ts calls them at import time, and ConfirmDialog (so lib/confirm) imports it.
const fakeFont = () => ({ className: 'font-mock', variable: 'font-mock-var', style: { fontFamily: 'mock' } });
vi.mock('next/font/local', () => ({ default: fakeFont }));
// Name every Google font the app imports (vitest needs real exports); add new ones here.
vi.mock('next/font/google', () => ({ Doto: fakeFont, Hanken_Grotesk: fakeFont, IBM_Plex_Mono: fakeFont }));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  useParams: () => ({
    tenant: 'test-tenant',
    lang: 'en',
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/test',
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock fetch globally
global.fetch = vi.fn();

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
} as any;

// Suppress console errors in tests (optional)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: useLayoutEffect') ||
        args[0].includes('Warning: ReactDOM.render'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
