'use client';

interface ProductsCatalogSkeletonProps {
  mode: 'grid' | 'list';
}

export default function ProductsCatalogSkeleton({ mode }: ProductsCatalogSkeletonProps) {
  if (mode === 'list') {
    return (
      <div className="bg-white border border-gray-300 divide-y divide-gray-300">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="p-4 sm:p-6 animate-pulse">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex-1">
                <div className="h-6 bg-gray-200 w-1/3 mb-2" />
                <div className="h-4 bg-gray-200 w-1/2 mb-2" />
                <div className="flex gap-4">
                  <div className="h-4 bg-gray-200 w-20" />
                  <div className="h-4 bg-gray-200 w-24" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-5 bg-gray-200 w-20" />
                <div className="h-6 bg-gray-200 w-16" />
                <div className="flex gap-2">
                  <div className="h-9 bg-gray-200 w-9" />
                  <div className="h-9 bg-gray-200 w-9" />
                  <div className="h-9 bg-gray-200 w-9" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="bg-white border border-gray-300 rounded-lg p-4 sm:p-5 animate-pulse">
          <div className="h-36 bg-gray-200 -mx-4 -mt-4 sm:-mx-5 sm:-mt-5 mb-3 rounded-t-lg" />
          <div className="h-6 bg-gray-200 w-3/4 mb-3" />
          <div className="h-4 bg-gray-200 w-full mb-2" />
          <div className="h-4 bg-gray-200 w-2/3 mb-4" />
          <div className="border-t border-gray-200 pt-4 mt-auto">
            <div className="flex justify-between mb-4">
              <div className="h-5 bg-gray-200 w-20" />
              <div className="h-6 bg-gray-200 w-16" />
            </div>
            <div className="flex gap-2">
              <div className="h-10 bg-gray-200 flex-1 rounded" />
              <div className="h-10 bg-gray-200 flex-1 rounded" />
              <div className="h-10 bg-gray-200 flex-1 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
