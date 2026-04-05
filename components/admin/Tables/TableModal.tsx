'use client';

interface TableModalProps {
  isOpen: boolean;
  isEditing: boolean;
  formData: {
    name: string;
    capacity: string;
  };
  primaryColor: string;
  onFormDataChange: (field: 'name' | 'capacity', value: string) => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  onClose: () => void;
}

export function TableModal({
  isOpen,
  isEditing,
  formData,
  primaryColor,
  onFormDataChange,
  onSubmit,
  onClose,
}: TableModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-bold text-gray-900">
            {isEditing ? 'Edit Table' : 'Add Table'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Table Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => onFormDataChange('name', e.target.value)}
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              placeholder="e.g. T1, Table 5, Patio A"
              maxLength={50}
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Seating Capacity
            </label>
            <input
              type="number"
              value={formData.capacity}
              onChange={(e) => onFormDataChange('capacity', e.target.value)}
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              placeholder="e.g. 4"
              min={1}
              max={100}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-sm hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{ backgroundColor: primaryColor }}
              className="flex-1 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition"
            >
              {isEditing ? 'Update' : 'Add'} Table
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
