'use client';

// Win8 five-dot spinner (globals.css `.win8-spinner`). It is em-sized and uses
// currentColor, so size is set via font-size and color via text color.
const SIZE_CLASS = {
  sm: 'text-xl win8-spinner-sm',
  md: 'text-2xl',
  lg: 'text-4xl',
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
      <span
        className={`win8-spinner ${SIZE_CLASS[size]} ${color ? '' : 'text-brand'}`}
        style={color ? { color } : undefined}
        role="status"
        aria-label={label || 'Loading'}
      >
        <span /><span /><span /><span /><span />
      </span>
      {label && <p className="mt-3 text-gray-400 text-sm">{label}</p>}
    </div>
  );
}
