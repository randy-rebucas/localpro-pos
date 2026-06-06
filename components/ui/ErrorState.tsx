'use client';

interface ErrorStateProps {
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
  className?: string;
}

export default function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = 'Retry',
  compact = false,
  className = '',
}: ErrorStateProps) {
  const py = compact ? 'py-8' : 'py-12';

  return (
    <div className={`text-center ${py} ${className}`} role="alert">
      <svg
        className={`mx-auto ${compact ? 'h-10 w-10' : 'h-14 w-14'} text-red-300 mb-4`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <p className={`text-gray-800 font-semibold ${compact ? 'text-sm' : 'text-lg'}`}>{title}</p>
      {description && (
        <p className="text-gray-500 text-sm mt-1 max-w-md mx-auto">{description}</p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors border border-red-700"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
