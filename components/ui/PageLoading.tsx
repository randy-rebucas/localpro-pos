'use client';

import LoadingSpinner from './LoadingSpinner';

interface PageLoadingProps {
  label?: string;
  color?: string;
  minHeight?: string;
}

export default function PageLoading({
  label = 'Loading...',
  color,
  minHeight = 'min-h-[50vh]',
}: PageLoadingProps) {
  return (
    <div className={`${minHeight} bg-gray-50 flex items-center justify-center`}>
      <LoadingSpinner size="md" label={label} color={color} />
    </div>
  );
}
