'use client';

interface TransactionsCatalogSkeletonProps {
  mode: 'grid' | 'list';
}

export default function TransactionsCatalogSkeleton({ mode }: TransactionsCatalogSkeletonProps) {
  if (mode === 'list') {
    return (
      <div className="bg-white border border-gray-300 divide-y divide-gray-300">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="p-4 sm:p-5 lg:p-6 animate-pulse">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-4 sm:h-5 bg-gray-200 w-1/2 sm:w-1/3" />
                <div className="h-3 sm:h-4 bg-gray-200 w-1/3 sm:w-1/4" />
              </div>
              <div className="flex items-center gap-2 sm:gap-4">
                <div className="h-3 sm:h-4 bg-gray-200 w-16 sm:w-20" />
                <div className="h-3 sm:h-4 bg-gray-200 w-12 sm:w-16" />
                <div className="h-10 sm:h-9 bg-gray-200 w-20 sm:w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="bg-white border border-gray-300 rounded-lg p-4 sm:p-5 animate-pulse">
          <div className="h-4 bg-gray-200 w-2/3 mb-3" />
          <div className="h-5 bg-gray-200 w-1/2 mb-4" />
          <div className="h-4 bg-gray-200 w-full mb-2" />
          <div className="h-4 bg-gray-200 w-3/4 mb-4" />
          <div className="border-t border-gray-200 pt-4">
            <div className="h-6 bg-gray-200 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
