'use client';

export default function ProfileFormSkeleton() {
  return (
    <div className="bg-white border border-gray-300 overflow-hidden animate-pulse">
      <div className="p-5 sm:p-6 lg:p-8 space-y-8">
        <div>
          <div className="h-6 bg-gray-200 w-48 mb-5" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-12 bg-gray-200" />
            <div className="h-12 bg-gray-200" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200">
            <div className="h-12 bg-gray-200" />
            <div className="h-12 bg-gray-200" />
          </div>
          <div className="flex justify-end pt-4">
            <div className="h-12 bg-gray-200 w-36" />
          </div>
        </div>
        <div className="pt-8 border-t border-gray-200">
          <div className="h-6 bg-gray-200 w-40 mb-5" />
          <div className="h-24 bg-gray-100" />
        </div>
        <div className="pt-8 border-t border-gray-200">
          <div className="h-6 bg-gray-200 w-52 mb-2" />
          <div className="h-4 bg-gray-200 w-72 mb-5" />
          <div className="h-48 bg-gray-100 max-w-xs mx-auto" />
        </div>
      </div>
    </div>
  );
}
