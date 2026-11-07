'use client';

const PULSE = 'animate-pulse motion-reduce:animate-none';

/** Holds the layout of the settings page: the function keys above the setup slip. */
export default function SettingsPageSkeleton() {
  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 xl:grid-cols-8">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="h-11 border border-white/15 bg-black/25" />
        ))}
      </div>
      <div className="mt-1 bg-paper-white px-4 py-6 sm:px-6 lg:px-8">
        <div className={`space-y-6 ${PULSE}`}>
          <div className="h-8 w-64 max-w-full bg-ink/10" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-11 bg-ink/10" />
            ))}
          </div>
          <div className="ml-auto h-11 w-40 bg-ink/10" />
        </div>
      </div>
      <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
    </div>
  );
}
