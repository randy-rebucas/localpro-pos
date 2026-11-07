'use client';

import type { ReactNode } from 'react';

const PULSE = 'animate-pulse motion-reduce:animate-none';

function SlipSkeleton({ children }: { children: ReactNode }) {
  return (
    <div>
      <div className="bg-paper-white px-4 py-4 sm:px-5">
        <div className={`space-y-4 ${PULSE}`}>{children}</div>
      </div>
      <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
    </div>
  );
}

/** Holds the layout of the profile page: two slips beside the staff card. */
export default function ProfileFormSkeleton() {
  return (
    <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
        <SlipSkeleton>
          <div className="h-7 w-56 bg-ink/10" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="h-11 bg-ink/10" />
            <div className="h-11 bg-ink/10" />
          </div>
          <div className="ml-auto h-11 w-40 bg-ink/10" />
        </SlipSkeleton>
        <SlipSkeleton>
          <div className="h-7 w-48 bg-ink/10" />
        </SlipSkeleton>
      </div>
      <div className="min-w-0 bg-paper-white lg:col-span-5">
        <div className="h-20 bg-brand" />
        <div className={`space-y-4 px-4 py-4 sm:px-5 ${PULSE}`}>
          <div className="h-9 w-2/3 bg-ink/10" />
          <div className="h-4 bg-ink/10" />
          <div className="h-4 bg-ink/10" />
          <div className="mx-auto h-56 w-56 bg-ink/10" />
        </div>
      </div>
    </div>
  );
}
