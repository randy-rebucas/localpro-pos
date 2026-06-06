'use client';

export default function SettingsPageSkeleton() {
  return (
    <div className="bg-white border border-gray-300 overflow-hidden animate-pulse">
      <div className="border-b border-gray-200 flex gap-0 overflow-hidden">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 w-24 sm:w-28 bg-gray-100 flex-shrink-0 border-r border-gray-200" />
        ))}
      </div>
      <div className="p-5 sm:p-6 lg:p-8 space-y-8">
        <div>
          <div className="h-6 bg-gray-200 w-56 mb-5" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-12 bg-gray-200" />
            ))}
          </div>
        </div>
        <div>
          <div className="h-6 bg-gray-200 w-40 mb-5" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 bg-gray-200" />
            ))}
          </div>
        </div>
        <div className="flex justify-end pt-6 border-t border-gray-200">
          <div className="h-12 bg-gray-200 w-36" />
        </div>
      </div>
    </div>
  );
}
