'use client';

interface TransactionsCatalogSkeletonProps {
  mode: 'grid' | 'list';
}

const PULSE = 'animate-pulse motion-reduce:animate-none';

export default function TransactionsCatalogSkeleton({ mode }: TransactionsCatalogSkeletonProps) {
  if (mode === 'list') {
    return (
      <div>
        <div className="divide-y divide-dashed divide-ink/20 bg-paper-white">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-2.5 ${PULSE}`}>
              <div className="min-w-0 flex-1">
                <div className="mb-2 h-4 w-1/3 bg-ink/10" />
                <div className="h-3 w-1/2 bg-ink/10" />
              </div>
              <div className="hidden h-6 w-24 bg-ink/10 md:block" />
              <div className="h-5 w-20 bg-ink/10" />
            </div>
          ))}
        </div>
        <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i}>
          <div className={`bg-paper-white ${PULSE}`}>
            <div className="p-4">
              <div className="mb-2 h-4 w-2/3 bg-ink/10" />
              <div className="mb-4 h-3 w-1/2 bg-ink/10" />
              <div className="space-y-2 border-y border-dashed border-ink/30 py-3">
                <div className="h-4 w-full bg-ink/10" />
                <div className="h-4 w-3/4 bg-ink/10" />
              </div>
              <div className="mt-3 h-6 w-full bg-ink/10" />
            </div>
            <div className="h-11 border-t border-ink/25" />
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </div>
      ))}
    </div>
  );
}
