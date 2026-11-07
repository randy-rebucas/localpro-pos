'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

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
    bg: 'bg-paper-white border-brand hover:bg-brand-soft',
    dot: 'bg-brand',
    label: 'Open',
    selectable: true,
  },
  occupied: {
    bg: 'bg-paper border-stamp/60',
    dot: 'bg-stamp',
    label: 'Occupied',
    selectable: false,
  },
  'check-requested': {
    bg: 'bg-paper border-ink',
    dot: 'bg-ink',
    label: 'Check Requested',
    selectable: false,
  },
} as const;

export default function FloorMap({ tenant, selectedTableId, onSelectTable, onClose }: FloorMapProps) {
  const params = useParams();
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [tables, setTables] = useState<TableData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const d = dict?.components?.floorMap;
  const statusLabels: Record<keyof typeof STATUS_CONFIG, string> = {
    open: d?.statusOpen || 'Open',
    occupied: d?.statusOccupied || 'Occupied',
    'check-requested': d?.statusCheckRequested || 'Check Requested',
  };

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
      className="fixed inset-0 bg-ink/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-paper-white text-ink w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dashed border-ink/30">
          <div>
            <h2 className="text-3xl text-ink">{d?.title || 'Floor Map'}</h2>
            <p className="font-receipt text-xs text-ink/60 mt-1">{d?.selectTable || 'Select an available table'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-ink/50 hover:text-ink"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 pt-3 pb-1">
          {(Object.entries(STATUS_CONFIG) as Array<[keyof typeof STATUS_CONFIG, typeof STATUS_CONFIG[keyof typeof STATUS_CONFIG]]>).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-1.5 font-receipt text-xs text-ink/70">
              <span className={`w-2.5 h-2.5 ${cfg.dot}`} />
              {statusLabels[key]}
            </div>
          ))}
        </div>

        {/* Table grid */}
        <div className="p-5 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-ink/50 text-sm">{d?.loadingTables || 'Loading tables…'}</div>
          ) : tables.length === 0 ? (
            <div className="text-center py-8 text-ink/50 text-sm">
              {d?.noTablesConfigured || 'No tables configured. Add tables in the admin settings.'}
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
                    className={`relative flex flex-col items-center justify-center p-3 border-2 transition-colors min-h-[70px] ${cfg.bg} ${
                      isSelected ? 'ring-2 ring-brand ring-offset-1' : ''
                    } ${!cfg.selectable ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                    title={table.status === 'occupied' ? (d?.tableOccupied || 'Table occupied') : table.status === 'check-requested' ? (d?.checkRequested || 'Check requested') : (d?.clickToSelect || 'Click to select')}
                  >
                    <span className={`w-2.5 h-2.5 mb-1 ${cfg.dot}`} />
                    <span className="font-receipt font-semibold text-ink text-sm leading-none">{table.name}</span>
                    {table.capacity && (
                      <span className="font-receipt text-[10px] text-ink/60 mt-0.5">{table.capacity} {d?.seats || 'seats'}</span>
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
