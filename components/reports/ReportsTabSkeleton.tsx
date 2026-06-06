'use client';

export default function ReportsTabSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-gray-100 border border-gray-200 p-5 sm:p-6 h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-gray-100 border border-gray-200 p-5 sm:p-6 h-80" />
        <div className="bg-gray-100 border border-gray-200 p-5 sm:p-6 h-80" />
      </div>
    </div>
  );
}
