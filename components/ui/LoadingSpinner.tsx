'use client';

const SIZE_CLASS = {
  sm: 'h-5 w-5 border-b-2',
  md: 'h-8 w-8 border-b-2',
  lg: 'h-12 w-12 border-b-2',
} as const;

interface LoadingSpinnerProps {
  size?: keyof typeof SIZE_CLASS;
  label?: string;
  color?: string;
  className?: string;
}

export default function LoadingSpinner({
  size = 'md',
  label,
  color,
  className = '',
}: LoadingSpinnerProps) {
  return (
    <div className={`text-center ${className}`}>
      <div
        className={`inline-block animate-spin rounded-full border-transparent ${SIZE_CLASS[size]} ${color ? '' : 'border-brand'}`}
        style={color ? { borderBottomColor: color } : undefined}
        role="status"
        aria-label={label || 'Loading'}
      />
      {label && <p className="mt-4 text-gray-600 text-sm">{label}</p>}
    </div>
  );
}
