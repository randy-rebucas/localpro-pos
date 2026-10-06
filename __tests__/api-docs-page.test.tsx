import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { existsSync } from 'fs';
import { resolve } from 'path';

// next/navigation's useParams is globally mocked in __tests__/setup.ts.
vi.mock('@/app/[tenant]/[lang]/dictionaries-client', () => ({
  getDictionaryClient: vi.fn().mockResolvedValue({}),
}));

import ApiDocsPage from '@/app/[tenant]/[lang]/admin/api-docs/page';

function endpointRows() {
  const table = screen.getByRole('table');
  return within(table).getAllByRole('row').filter((r) => within(r).queryAllByRole('cell').length === 3);
}

describe('ApiDocsPage', () => {
  it('only documents routes that exist with the methods they export', async () => {
    render(<ApiDocsPage />);
    await screen.findByRole('heading', { name: 'API Documentation' });

    const { readFileSync } = await import('fs');
    for (const row of endpointRows()) {
      const [methodCell, pathCell] = within(row).getAllByRole('cell');
      const method = methodCell.textContent!.trim();
      const routeDir = pathCell.textContent!.trim().replace(/^\/api\//, '').replace(/:id/g, '[id]');
      const file = resolve(__dirname, '../app/api', routeDir, 'route.ts');
      expect(existsSync(file), `${method} ${pathCell.textContent} -> ${file}`).toBe(true);
      expect(readFileSync(file, 'utf8'), `${method} ${pathCell.textContent}`).toMatch(
        new RegExp(`export (async )?function ${method}\\b`)
      );
    }
  });

  it('filters by method and search text', async () => {
    render(<ApiDocsPage />);
    await screen.findByRole('heading', { name: 'API Documentation' });
    const total = endpointRows().length;

    fireEvent.change(screen.getByLabelText('Filter by method'), { target: { value: 'DELETE' } });
    expect(endpointRows().every((r) => r.textContent!.startsWith('DELETE'))).toBe(true);
    expect(screen.getByText(`2 of ${total} endpoints`)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter by method'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Search path or description…'), { target: { value: 'low-stock' } });
    expect(endpointRows()).toHaveLength(1);
  });

  it('shows an empty state with a clear-filters action', async () => {
    render(<ApiDocsPage />);
    await screen.findByRole('heading', { name: 'API Documentation' });

    fireEvent.change(screen.getByLabelText('Search path or description…'), { target: { value: 'nothing-here' } });
    expect(screen.getByText('No endpoints match your filters.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows the real origin as the base URL', async () => {
    render(<ApiDocsPage />);
    await screen.findByRole('heading', { name: 'API Documentation' });
    expect(screen.getByText(`${window.location.origin}/api`)).toBeInTheDocument();
  });
});
