'use client';

interface ProductsCatalogSkeletonProps {
  mode: 'grid' | 'list';
}

const PULSE = 'animate-pulse motion-reduce:animate-none';

export default function ProductsCatalogSkeleton({ mode }: ProductsCatalogSkeletonProps) {
  if (mode === 'list') {
    return (
      <div>
        <div className="divide-y divide-dashed divide-ink/20 bg-paper-white">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-2.5 ${PULSE}`}>
              <div className="h-10 w-10 shrink-0 bg-ink/10" />
              <div className="min-w-0 flex-1">
                <div className="mb-2 h-4 w-1/3 bg-ink/10" />
                <div className="h-3 w-1/2 bg-ink/10" />
              </div>
              <div className="h-5 w-20 bg-ink/10" />
              <div className="hidden h-7 w-24 bg-ink/10 md:block" />
            </div>
          ))}
        </div>
        <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className={`bg-paper-white ${PULSE}`}>
          <div className="h-36 bg-ink/10" />
          <div className="p-3 sm:p-4">
            <div className="mb-2 h-5 w-3/4 bg-ink/10" />
            <div className="mb-4 h-3 w-2/3 bg-ink/10" />
            <div className="flex justify-between gap-2 border-t border-dashed border-ink/30 pt-3">
              <div className="h-6 w-20 bg-ink/10" />
              <div className="h-6 w-14 bg-ink/10" />
            </div>
          </div>
          <div className="h-11 border-t border-ink/25" />
        </div>
      ))}
    </div>
  );
}
