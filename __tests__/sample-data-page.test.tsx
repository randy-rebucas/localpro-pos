import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// next/navigation's useParams is globally mocked in __tests__/setup.ts.

const mockCanAccess = vi.fn();
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: (key: string) => mockCanAccess(key), isAlwaysAllowed: false }),
}));

vi.mock('@/app/[tenant]/[lang]/dictionaries-client', () => ({
  getDictionaryClient: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/contexts/TenantSettingsContext', () => ({
  useTenantSettings: () => ({ settings: { currency: 'PHP', currencySymbol: '₱' } }),
}));

const mockLoadPreview = vi.fn();
const mockInstall = vi.fn();
let managerState: Record<string, unknown>;
vi.mock('@/hooks/useSampleDataManager', () => ({
  useSampleDataManager: () => ({
    ...managerState,
    loadPreview: mockLoadPreview,
    installSampleData: mockInstall,
  }),
}));

import SampleDataPage from '@/app/[tenant]/[lang]/admin/sample-data/page';

const PREVIEW = {
  businessType: 'retail',
  preview: { categories: 3, products: 2, customers: 5, discounts: 1 },
  existing: { categories: 3, products: 0, customers: 0, discounts: 0 },
  sample: {
    categories: ['Snacks', 'Drinks', 'Household'],
    products: [
      { name: 'Potato Chips', price: 45, type: 'regular' },
      { name: 'Gift Wrap Service', price: 20, type: 'service' },
    ],
    discounts: [{ code: 'WELCOME10', name: 'Welcome', value: 10, type: 'percentage' }],
  },
};

describe('SampleDataPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAccess.mockReturnValue(true);
    mockInstall.mockResolvedValue({ success: true });
    managerState = { preview: PREVIEW, previewLoading: false, installing: false, message: null, installResults: null };
  });

  it('shows per-type counts, including already-installed types', async () => {
    render(<SampleDataPage />);
    await screen.findByRole('heading', { name: 'Install Sample Data' });

    expect(screen.getByText('already installed')).toBeInTheDocument(); // categories: 3 of 3 exist
    expect(screen.getByText('+5 new')).toBeInTheDocument();
    expect(screen.getByText('2 products across 3 categories')).toBeInTheDocument();
    expect(screen.getByText('This store already has data')).toBeInTheDocument();
  });

  it('installs the selected item types', async () => {
    render(<SampleDataPage />);
    await screen.findByRole('heading', { name: 'Install Sample Data' });

    fireEvent.click(screen.getByLabelText(/Customers/));
    fireEvent.click(screen.getByRole('button', { name: /Install Sample Data/i }));
    expect(mockInstall).toHaveBeenCalledWith(['categories', 'products', 'discounts']);
  });

  it('disables install when nothing is selected', async () => {
    render(<SampleDataPage />);
    await screen.findByRole('heading', { name: 'Install Sample Data' });

    for (const label of [/Categories/, /Products/, /Customers/, /Discounts/]) {
      fireEvent.click(screen.getByLabelText(label));
    }
    expect(screen.getByRole('button', { name: /Install Sample Data/i })).toBeDisabled();
    expect(screen.getByText('Select at least one item type to install')).toBeInTheDocument();
  });

  it('hides install and locks the checkboxes without sample_data.manage', async () => {
    mockCanAccess.mockReturnValue(false);
    render(<SampleDataPage />);
    await screen.findByRole('heading', { name: 'Install Sample Data' });

    expect(screen.queryByRole('button', { name: /Install Sample Data/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Products/)).toBeDisabled();
  });

  it('filters the product preview and shows an empty state', async () => {
    render(<SampleDataPage />);
    await screen.findByRole('heading', { name: 'Install Sample Data' });

    fireEvent.change(screen.getByLabelText('Search products'), { target: { value: 'zzz' } });
    expect(screen.getByText('No products match your search')).toBeInTheDocument();
  });

  it('offers a retry when the preview fails to load', async () => {
    managerState = { ...managerState, preview: null };
    render(<SampleDataPage />);
    await screen.findByText('Could not load preview.');

    mockLoadPreview.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockLoadPreview).toHaveBeenCalledTimes(1);
  });

  it('shows install results and the status message', async () => {
    managerState = {
      ...managerState,
      message: { type: 'success', text: 'Sample data installed successfully! 8 records added.' },
      installResults: { categories: 0, products: 2, customers: 5, discounts: 1 },
    };
    render(<SampleDataPage />);

    expect(await screen.findByRole('status')).toHaveTextContent('8 records added');
    expect(screen.getByText('Installation Results')).toBeInTheDocument();
  });
});
