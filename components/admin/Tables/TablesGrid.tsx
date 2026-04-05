'use client';

interface TableRow {
  _id: string;
  name: string;
  capacity?: number;
  status: 'open' | 'occupied' | 'check-requested';
  isActive: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-green-100 text-green-800' },
  occupied: { label: 'Occupied', cls: 'bg-red-100 text-red-800' },
  'check-requested': {
    label: 'Check Requested',
    cls: 'bg-yellow-100 text-yellow-800',
  },
};

interface TablesGridProps {
  tables: TableRow[];
  loading: boolean;
  showInactive: boolean;
  primaryColor: string;
  onShowInactiveChange: (show: boolean) => void;
  onAddClick: () => void;
  onEditClick: (table: TableRow) => void;
  onDeactivate: (table: TableRow) => Promise<void>;
  onReactivate: (table: TableRow) => Promise<void>;
  onResetStatus: (table: TableRow) => Promise<void>;
}

export function TablesGrid({
  tables,
  loading,
  showInactive,
  primaryColor,
  onShowInactiveChange,
  onAddClick,
  onEditClick,
  onDeactivate,
  onReactivate,
  onResetStatus,
}: TablesGridProps) {
  const activeTables = tables.filter((t) => t.isActive);
  const displayed = showInactive ? tables : activeTables;

  const gridItems = displayed.map((table) => {
    const statusCfg = STATUS_CONFIG[table.status] ?? STATUS_CONFIG.open;
    return (
      <div
        key={table._id}
        className={`bg-white border-2 p-4 transition ${
          table.isActive
            ? 'border-gray-200 hover:shadow-md'
            : 'border-dashed border-gray-200 opacity-60'
        }`}
      >
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-lg font-bold text-gray-900">{table.name}</h3>
          {table.isActive ? (
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.cls}`}
            >
              {statusCfg.label}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
              Inactive
            </span>
          )}
        </div>

        {table.capacity && (
          <p className="text-sm text-gray-500 mb-3">{table.capacity} seats</p>
        )}

        <div className="flex flex-wrap gap-2 mt-3">
          {table.isActive ? (
            <>
              {table.status !== 'open' && (
                <button
                  type="button"
                  onClick={() => onResetStatus(table)}
                  className="text-xs px-2 py-1 border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 transition"
                >
                  Reset to Open
                </button>
              )}
              <button
                type="button"
                onClick={() => onEditClick(table)}
                className="text-xs px-3 py-1 border hover:bg-gray-50 transition"
                style={{ borderColor: primaryColor, color: primaryColor }}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDeactivate(table)}
                className="text-xs px-3 py-1 border border-red-200 text-red-500 hover:bg-red-50 transition"
              >
                Deactivate
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onReactivate(table)}
              className="text-xs px-3 py-1 border border-green-300 text-green-600 hover:bg-green-50 transition"
            >
              Reactivate
            </button>
          )}
        </div>
      </div>
    );
  });

  return (
    <>
      {/* Header */}
      <div className="min-h-screen bg-gray-50">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">Tables</h1>
              <p className="text-gray-600">
                {activeTables.length} active table{activeTables.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => onShowInactiveChange(e.target.checked)}
                  className="rounded"
                />
                Show inactive
              </label>
              <button
                type="button"
                onClick={onAddClick}
                style={{ backgroundColor: primaryColor }}
                className="px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition"
              >
                + Add Table
              </button>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-16">
              <div
                className="inline-block animate-spin h-8 w-8 border-b-2"
                style={{
                  borderTopColor: primaryColor,
                  borderRightColor: primaryColor,
                  borderLeftColor: primaryColor,
                  borderBottomColor: 'transparent',
                }}
              />
            </div>
          )}

          {/* Grid of Cards */}
          {!loading && displayed.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-4">
                {gridItems}
              </div>

              {/* Status Legend */}
              <div className="flex flex-wrap gap-3 mt-4 text-xs text-gray-500">
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <span
                    key={key}
                    className={`px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}
                  >
                    {cfg.label}
                  </span>
                ))}
                <span className="ml-auto">
                  &ldquo;Reset to Open&rdquo; clears stuck occupied status
                </span>
              </div>
            </>
          )}

          {/* Empty State */}
          {!loading && displayed.length === 0 && (
            <div className="text-center py-16 bg-white border-2 border-gray-200">
              <svg
                className="w-12 h-12 mx-auto text-gray-300 mb-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 10h18M3 14h18M10 4v16M14 4v16"
                />
              </svg>
              <p className="text-gray-500 mb-4">No tables configured yet</p>
              <button
                type="button"
                onClick={onAddClick}
                style={{ backgroundColor: primaryColor }}
                className="px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition"
              >
                + Add Table
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
