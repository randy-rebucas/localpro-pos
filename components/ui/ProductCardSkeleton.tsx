'use client';

interface ProductCardSkeletonProps {
  count?: number;
  cardClassName?: string;
  gridClassName?: string;
  variant?: 'grid' | 'list';
}

export default function ProductCardSkeleton({
  count = 16,
  cardClassName = 'h-52',
  gridClassName = '',
  variant = 'grid',
}: ProductCardSkeletonProps) {
  return (
    <div className={gridClassName}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`relative overflow-hidden border border-gray-300 bg-gray-200 animate-pulse ${cardClassName}`}
        >
          {variant === 'list' ? (
            <div className="flex items-center gap-3 p-3 h-full">
              <div className="w-14 h-14 bg-gray-300 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-2.5 bg-gray-300 w-1/4" />
                <div className="h-3 bg-gray-300 w-3/4" />
                <div className="h-3 bg-gray-300 w-1/3" />
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col justify-between p-4">
              <div />
              <div className="space-y-2">
                <div className="h-3 bg-gray-300 w-3/4" />
                <div className="h-3 bg-gray-300 w-1/2" />
                <div className="h-4 bg-gray-300 w-full mt-3" />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
