# React Component Testing Setup Guide

## Overview

This guide walks you through setting up component testing infrastructure for the 1POS system using **React Testing Library** and **jsdom** with Vitest.

## Installation

### 1. Install Required Dependencies

Run the following command to install all required packages for component testing:

```bash
pnpm add -D @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitejs/plugin-react
```

**What each package does:**
- `@testing-library/react` — React component testing utilities (render, screen, fireEvent, etc.)
- `@testing-library/jest-dom` — Custom matchers for DOM assertions (toBeInTheDocument, toHaveValue, etc.)
- `@testing-library/user-event` — Simulates real user interactions (typing, clicking, keyboard navigation)
- `jsdom` — JavaScript implementation of web standards (DOM, localStorage, etc.) for Node.js
- `@vitejs/plugin-react` — React support for Vite (already in use for build)

### 2. Update vitest.config.ts

The config has been updated to:
- Use `jsdom` environment for component tests
- Include `@vitejs/plugin-react` for JSX transformation
- Load setup file for test initialization
- Include both `.test.ts` and `.test.tsx` files

**Current config includes:**
```typescript
test: {
  globals: true,
  environment: 'jsdom',                    // ← For component tests
  include: ['__tests__/**/*.test.ts', '...'],
  setupFiles: ['__tests__/setup.ts'],      // ← Initializes mocks/context
}
```

### 3. Test Setup Files Created

#### `__tests__/setup.ts`
- Cleans up React components after each test
- Mocks Next.js navigation hooks (`useRouter`, `useParams`, etc.)
- Mocks Next.js `Link` component
- Sets up global `fetch` mock
- Configures localStorage mock
- Silences expected React warnings

#### `__tests__/test-utils.tsx`
- Exports `renderWithProviders()` function
- Wraps components with required contexts:
  - `AuthContext` — Provides user/auth data
  - `TenantSettingsContext` — Provides tenant settings (currency, language, timezone)
  - `SubscriptionContext` — Provides subscription/feature flag data
- Allows custom overrides for testing different scenarios
- Re-exports all `@testing-library/react` functions for convenience

**Usage example:**
```typescript
import { renderWithProviders, screen } from '@/__tests__/test-utils';

renderWithProviders(<TablesPage />, {
  user: { role: 'admin' },
  subscription: { features: { enableTableManagement: true } },
});

expect(screen.getByText('Table Management')).toBeInTheDocument();
```

## Component Test Files

### 1. `__tests__/components/tables-page.test.tsx`
Tests the full Table Management admin page component including:

**Rendering Tests:**
- ✅ Page renders with title and controls
- ✅ Empty state when no tables exist
- ✅ Tables list displays with data

**Add Table Modal Tests:**
- ✅ Modal opens when Add button clicked
- ✅ Name field validation (empty, max length)
- ✅ Capacity field validation (min 1, max 100)
- ✅ Form submission with valid data

**Edit Table Tests:**
- ✅ Edit modal opens with correct title
- ✅ Form prefills with current data
- ✅ Update submission

**Delete Table Tests:**
- ✅ Delete confirmation dialog appears
- ✅ Table deletes when confirmed
- ✅ Delete canceled when dismissed

**Error Handling:**
- ✅ API errors display properly
- ✅ Validation errors from API show

**Accessibility:**
- ✅ Proper heading hierarchy (h1)
- ✅ Keyboard navigation (Tab, Enter)

### 2. `__tests__/components/table-form-modal.test.tsx`
Tests the modal form component in isolation:

**Form Rendering:**
- ✅ Modal shows/hides based on prop
- ✅ Correct title (Add vs Edit mode)
- ✅ All form fields present
- ✅ Action buttons present

**Validation:**
- ✅ Required fields enforced
- ✅ Name max length (50 chars)
- ✅ Capacity min/max (1-100)

**Edit Mode:**
- ✅ Prefills all fields with initial data
- ✅ Button label changes to "Update"

**User Interactions:**
- ✅ Form submission calls onSubmit
- ✅ Cancel button closes modal
- ✅ Status dropdown works
- ✅ Loading state disables button

**Accessibility:**
- ✅ Dialog has proper aria attributes
- ✅ All inputs have labels
- ✅ Keyboard navigation works

## Running Tests

### Run All Tests (API + Component)
```bash
pnpm test
```

### Run Component Tests Only
```bash
pnpm test __tests__/components/
```

### Run Specific Test File
```bash
pnpm test __tests__/components/tables-page.test.tsx
```

### Watch Mode (re-run on file changes)
```bash
pnpm test:watch
```

### Generate Coverage Report
```bash
pnpm test:coverage
```

## Common Testing Patterns

### 1. Rendering a Component with Context

```typescript
import { renderWithProviders, screen } from '@/__tests__/test-utils';

test('should show admin features', () => {
  renderWithProviders(<TablesPage />, {
    user: { role: 'admin' },
    subscription: { features: { enableTableManagement: true } }
  });
  
  expect(screen.getByText('Table Management')).toBeInTheDocument();
});
```

### 2. Simulating User Input

```typescript
import userEvent from '@testing-library/user-event';

test('should submit form', async () => {
  const user = userEvent.setup();
  
  renderWithProviders(<TableFormModal isOpen={true} onSubmit={vi.fn()} />);
  
  const nameInput = screen.getByLabelText(/table name/i);
  await user.type(nameInput, 'New Table');
  await user.click(screen.getByRole('button', { name: /save/i }));
});
```

### 3. Mocking API Calls

```typescript
import { vi } from 'vitest';

beforeEach(() => {
  (global.fetch as any).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ success: true, data: [] })
  });
});
```

### 4. Waiting for Async Updates

```typescript
import { waitFor } from '@testing-library/react';

test('should load data', async () => {
  renderWithProviders(<TablesPage />);
  
  await waitFor(() => {
    expect(screen.getByText('Table 1')).toBeInTheDocument();
  });
});
```

### 5. Testing Error States

```typescript
test('should show error message', async () => {
  (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));
  
  renderWithProviders(<TablesPage />);
  
  await waitFor(() => {
    expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
  });
});
```

## Debugging Tests

### View Rendered DOM
```typescript
import { renderWithProviders, screen } from '@/__tests__/test-utils';

test('debug example', () => {
  const { debug } = renderWithProviders(<TablesPage />);
  debug(); // Prints the full DOM to console
});
```

### Check Element Queries
```typescript
// Find element and log it
const button = screen.getByRole('button', { name: /add/i });
console.log(button);

// List all buttons
screen.getAllByRole('button').forEach(btn => console.log(btn.textContent));
```

### Debug Query Results
```typescript
test('debug queries', () => {
  renderWithProviders(<TablesPage />);
  
  // This will explain why query failed and suggest alternatives
  screen.getByText('nonexistent text');
});
```

## Best Practices

### ✅ DO:
- Test user behavior, not implementation details
- Use semantic queries: `getByRole()`, `getByLabelText()`, `getByPlaceholderText()`
- Test accessibility (keyboard nav, screen reader)
- Mock API calls, not fetch implementation
- Use `userEvent` instead of `fireEvent` for interactions
- Test error and loading states

### ❌ DON'T:
- Test internal state directly
- Use `querySelector()` or DOM traversal
- Test component props in isolation
- Mock too deeply (mock APIs, not React internals)
- Use `fireEvent` for user actions
- Ignore accessibility concerns

## Writing New Component Tests

### Template for New Test File

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test-utils';
import MyComponent from '@/app/path/to/MyComponent';

// Mock external dependencies
vi.mock('next/navigation', () => ({...}));

describe('MyComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render component', () => {
      renderWithProviders(<MyComponent />);
      expect(screen.getByText(/expected text/i)).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should respond to clicks', async () => {
      const user = userEvent.setup();
      const onAction = vi.fn();
      
      renderWithProviders(<MyComponent onAction={onAction} />);
      
      await user.click(screen.getByRole('button'));
      
      expect(onAction).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should display errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Test error'));
      
      renderWithProviders(<MyComponent />);
      
      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();
      
      renderWithProviders(<MyComponent />);
      
      await user.tab();
      
      expect(screen.getByRole('button')).toHaveFocus();
    });
  });
});
```

## Troubleshooting

### Error: "Cannot find module '@testing-library/react'"
```bash
# Install missing package
pnpm add -D @testing-library/react
```

### Error: "environment is not defined"
Make sure `jsdom` is installed:
```bash
pnpm add -D jsdom
```

### Components not rendering in tests
Check that you're using `renderWithProviders()` instead of just `render()`:
```typescript
// ✗ Wrong
import { render } from '@testing-library/react';
render(<MyComponent />);

// ✓ Correct  
import { renderWithProviders } from '@/__tests__/test-utils';
renderWithProviders(<MyComponent />);
```

### Fetch mock not working
Make sure `beforeEach()` clears mocks:
```typescript
beforeEach(() => {
  vi.clearAllMocks();
  (global.fetch as any).mockClear();
});
```

### Timeout errors on async operations
Increase timeout or check that mocks are resolving:
```typescript
// Add timeout
await waitFor(() => {
  expect(...).toBeTruthy();
}, { timeout: 3000 });

// Check mock
expect(global.fetch).toHaveBeenCalled();
```

## Running Tests in CI/CD

The testing setup is ready for automated CI/CD pipelines:

```bash
# Run all tests with coverage
pnpm test:coverage

# Exit with code 1 if tests fail
pnpm test  # (built-in behavior)
```

## Next Steps

1. ✅ Installation dependencies installed
2. ✅ vitest.config.ts updated for jsdom
3. ✅ Test utilities and setup files created
4. ✅ Component test files created for Tables page
5. 📝 **Next**: Run tests and verify they pass
   ```bash
   pnpm test __tests__/components/
   ```
6. 📝 **Then**: Write tests for other components
7. 📝 **Optional**: Add E2E tests with Playwright

## Resources

- [React Testing Library Docs](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest Docs](https://vitest.dev/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [jsdom Docs](https://github.com/jsdom/jsdom)
