'use client';

type EmptyIconPreset = 'cart' | 'products' | 'search' | 'savedCarts';

const ICON_PATHS: Record<EmptyIconPreset, string> = {
  cart: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
  products: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4',
  search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  savedCarts: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
};

interface EmptyStateProps {
  icon?: EmptyIconPreset;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  compact?: boolean;
  className?: string;
}

export default function EmptyState({
  icon = 'products',
  title,
  description,
  action,
  compact = false,
  className = '',
}: EmptyStateProps) {
  const py = compact ? 'py-8' : 'py-12';
  const iconSize = compact ? 'h-12 w-12' : 'h-16 w-16';

  return (
    <div className={`text-center ${py} ${className}`}>
      <svg
        className={`mx-auto ${iconSize} text-gray-300 mb-4`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={compact ? 1.5 : 2}
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS[icon]} />
      </svg>
      <p className={`text-gray-500 ${compact ? 'text-sm font-medium' : 'text-lg'}`}>{title}</p>
      {description && (
        <p className="text-gray-400 text-sm mt-1 max-w-sm mx-auto">{description}</p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 px-4 py-2 text-sm font-semibold text-brand border border-brand hover:bg-brand-soft transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
