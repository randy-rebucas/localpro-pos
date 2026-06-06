'use client';

import LoadingSpinner from '@/components/ui/LoadingSpinner';

type ScreenVariant = 'loading' | 'error' | 'empty' | 'no-session' | 'success';

const BACKGROUND: Record<ScreenVariant, string> = {
  loading: 'bg-gradient-to-br from-gray-900 to-gray-800',
  error: 'bg-gradient-to-br from-red-900 to-red-800',
  empty: 'bg-gradient-to-br from-gray-900 to-gray-800',
  'no-session': 'bg-gradient-to-br from-gray-900 to-gray-800',
  success: 'bg-gradient-to-br from-green-600 to-green-900',
};

interface CustomerDisplayScreenProps {
  variant: ScreenVariant;
  title: string;
  description?: string;
  sessionId?: string;
  onRetry?: () => void;
  retryLabel?: string;
  children?: React.ReactNode;
}

export default function CustomerDisplayScreen({
  variant,
  title,
  description,
  sessionId,
  onRetry,
  retryLabel = 'Retry',
  children,
}: CustomerDisplayScreenProps) {
  return (
    <div
      className={`w-screen h-screen flex items-center justify-center ${BACKGROUND[variant]}`}
      role={variant === 'error' || variant === 'no-session' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
    >
      <div className="text-center max-w-lg px-6">
        {variant === 'loading' && (
          <LoadingSpinner
            size="lg"
            label={title}
            color="#ffffff"
            className="[&_p]:text-white [&_p]:text-lg"
          />
        )}

        {variant === 'error' && (
          <svg
            className="mx-auto h-24 w-24 text-red-300 mb-6"
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
        )}

        {variant === 'empty' && (
          <svg
            className="mx-auto h-24 w-24 text-gray-600 mb-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        )}

        {variant === 'success' && (
          <svg
            className="mx-auto h-32 w-32 text-white mb-6 animate-bounce"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}

        {variant !== 'loading' && (
          <>
            <h1
              className={`font-bold text-white mb-4 ${
                variant === 'success' ? 'text-5xl' : variant === 'error' ? 'text-3xl' : 'text-4xl'
              }`}
            >
              {title}
            </h1>
            {description && (
              <p
                className={`text-lg mb-6 ${
                  variant === 'error'
                    ? 'text-red-200'
                    : variant === 'success'
                    ? 'text-green-100 text-2xl'
                    : 'text-gray-400 text-xl'
                }`}
              >
                {description}
              </p>
            )}
          </>
        )}

        {sessionId && variant === 'error' && (
          <p className="text-red-300 text-sm mb-4">Session ID: {sessionId.substring(0, 20)}...</p>
        )}

        {onRetry && variant === 'error' && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 px-6 py-3 bg-white text-red-700 font-bold rounded-lg hover:bg-red-50 transition-colors"
          >
            {retryLabel}
          </button>
        )}

        {children}
      </div>
    </div>
  );
}
