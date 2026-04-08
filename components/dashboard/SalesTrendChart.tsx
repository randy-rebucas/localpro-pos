'use client';

interface TrendPoint {
  date: string;
  revenue: number;
  transactions: number;
}

interface SalesTrendChartProps {
  data: TrendPoint[];
  currency?: string;
}

function formatCurrency(value: number, currency = 'PHP') {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export default function SalesTrendChart({ data, currency }: SalesTrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Sales Trend (Last 30 Days)</h3>
        <p className="text-sm text-gray-400">No trend data available.</p>
      </div>
    );
  }

  const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
  const chartHeight = 80;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Sales Trend (Last 30 Days)</h3>
      <div className="flex items-end gap-0.5 h-20 mt-2">
        {data.map((point, i) => {
          const heightPct = (point.revenue / maxRevenue) * chartHeight;
          return (
            <div
              key={i}
              className="flex-1 group relative"
              style={{ height: `${chartHeight}px`, display: 'flex', alignItems: 'flex-end' }}
            >
              <div
                className="w-full bg-blue-400 hover:bg-blue-600 rounded-t transition-colors cursor-default"
                style={{ height: `${Math.max(heightPct, 2)}px` }}
                title={`${point.date}: ${formatCurrency(point.revenue, currency)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs text-gray-400">{data[0]?.date?.slice(5)}</span>
        <span className="text-xs text-gray-400">{data[data.length - 1]?.date?.slice(5)}</span>
      </div>
    </div>
  );
}
