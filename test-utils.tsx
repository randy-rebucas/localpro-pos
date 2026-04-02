import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';

function AllProviders({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export { renderWithProviders };
export * from '@testing-library/react';
