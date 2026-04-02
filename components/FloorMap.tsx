'use client';

import { useState, useEffect, useCallback } from 'react';

interface TableData {
  _id: string;
  name: string;
  capacity?: number;
  status: 'open' | 'occupied' | 'check-requested';
}

interface FloorMapProps {
  tenant: string;
  selectedTableId?: string;
  onSelectTable: (table: { _id: string; name: string }) => void;
  onClose: () => void;
}

const STATUS_CONFIG = {
  open: {
    bg: 'bg-green-50 border-green-400 hover:bg-green-100',
    dot: 'bg-green-500',
    label: 'Open',
    selectable: true,
  },
  occupied: {
    bg: 'bg-red-50 border-red-400',
    dot: 'bg-red-500',
    label: 'Occupied',
    selectable: false,
  },
  'check-requested': {
    bg: 'bg-yellow-50 border-yellow-400',
    dot: 'bg-yellow-500',
    label: 'Check Requested',
    selectable: false,
  },
} as const;

export default function FloorMap({ tenant, selectedTableId, onSelectTable, onClose }: FloorMapProps) {
  const [tables, setTables] = useState<TableData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTables = useCallback(async () => {
    try {
      const res = await fetch(`/api/tables?isActive=true&tenant=${tenant}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) setTables(data.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Floor Map</h2>
            <p className="text-xs text-gray-500">Select an available table</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Legend */}
        <div className="flex gap-4 px-5 pt-3 pb-1">
          {(Object.entries(STATUS_CONFIG) as Array<[keyof typeof STATUS_CONFIG, typeof STATUS_CONFIG[keyof typeof STATUS_CONFIG]]>).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </div>
          ))}
        </div>

        {/* Table grid */}
        <div className="p-5 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Loading tables…</div>
          ) : tables.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              No tables configured. Add tables in the admin settings.
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
              {tables.map((table) => {
                const cfg = STATUS_CONFIG[table.status];
                const isSelected = table._id === selectedTableId;
                return (
                  <button
                    key={table._id}
                    type="button"
                    disabled={!cfg.selectable && !isSelected}
                    onClick={() => cfg.selectable && onSelectTable({ _id: table._id, name: table.name })}
                    className={`relative flex flex-col items-center justify-center p-3 border-2 transition-all min-h-[70px] ${cfg.bg} ${
                      isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                    } ${!cfg.selectable ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
                    title={table.status === 'occupied' ? 'Table occupied' : table.status === 'check-requested' ? 'Check requested' : 'Click to select'}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full mb-1 ${cfg.dot}`} />
                    <span className="font-bold text-gray-800 text-sm leading-none">{table.name}</span>
                    {table.capacity && (
                      <span className="text-[10px] text-gray-400 mt-0.5">{table.capacity} seats</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
