'use client';

const PULSE = 'animate-pulse motion-reduce:animate-none';

export default function ReportsTabSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`border border-ink/10 bg-paper-white p-4 ${PULSE}`}>
            <div className="mb-3 h-3 w-1/2 bg-ink/10" />
            <div className="h-8 w-3/4 bg-ink/10" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className={`h-80 border border-ink/10 bg-paper-white lg:col-span-8 ${PULSE}`} />
        <div className={`h-80 border border-ink/10 bg-paper-white lg:col-span-4 ${PULSE}`} />
      </div>
    </div>
  );
}
