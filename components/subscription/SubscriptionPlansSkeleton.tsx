'use client';

export default function SubscriptionPlansSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch animate-pulse">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex flex-col h-full bg-white border border-gray-300 p-6">
          <div className="h-12 w-12 bg-gray-200 mb-4" />
          <div className="h-6 bg-gray-200 w-2/3 mb-2" />
          <div className="h-8 bg-gray-200 w-1/2 mb-6" />
          <div className="space-y-3 flex-1 mb-6">
            {[1, 2, 3, 4].map((j) => (
              <div key={j} className="h-4 bg-gray-100 w-full" />
            ))}
          </div>
          <div className="h-10 bg-gray-200 w-full" />
        </div>
      ))}
    </div>
  );
}
