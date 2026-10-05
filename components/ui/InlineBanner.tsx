'use client';

type BannerVariant = 'error' | 'warning' | 'info' | 'success';

// Win8 flat inline notes: white surface, token-colored border + text (no pastel fills).
const VARIANT_CLASS: Record<BannerVariant, string> = {
  error: 'bg-white text-win8-danger border-win8-danger',
  warning: 'bg-white text-win8-warning border-win8-warning',
  info: 'bg-brand-soft text-brand-navy border-brand',
  success: 'bg-white text-win8-success border-win8-success',
};

interface InlineBannerProps {
  variant: BannerVariant;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  onDismiss?: () => void;
  className?: string;
}

export default function InlineBanner({
  variant,
  message,
  onRetry,
  retryLabel = 'Retry',
  onDismiss,
  className = '',
}: InlineBannerProps) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 border text-sm ${VARIANT_CLASS[variant]} ${className}`}
      role={variant === 'error' ? 'alert' : 'status'}
    >
      <span className="font-medium min-w-0">{message}</span>
      <div className="flex items-center gap-2 flex-shrink-0">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-xs font-semibold text-brand hover:underline"
          >
            {retryLabel}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 opacity-70 hover:opacity-100"
            aria-label="Dismiss"
            title="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
