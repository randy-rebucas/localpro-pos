'use client';

const PULSE = 'animate-pulse motion-reduce:animate-none';

/** Holds the layout of the plan slips while plans load. */
export default function SubscriptionPlansSkeleton() {
  return (
    <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i}>
          <div className="bg-paper-white px-5 py-6">
            <div className={`space-y-4 ${PULSE}`}>
              <div className="h-8 w-2/3 bg-ink/10" />
              <div className="h-10 w-1/2 bg-ink/10" />
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="h-4 bg-ink/10" />
              ))}
              <div className="h-11 bg-ink/10" />
            </div>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </div>
      ))}
    </div>
  );
}
