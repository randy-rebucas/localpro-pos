'use client';

interface StaffMetric {
  staffId: string;
  name: string;
  email: string;
  role: string;
  revenue: number;
  transactions: number;
  totalDiscount: number;
  avgOrderValue: number;
  totalHours: number;
  daysWorked: number;
  revenuePerHour: number | null;
}

interface StaffPerformanceTableProps {
  data: StaffMetric[];
  currency?: string;
}

function fmt(value: number, currency = 'PHP') {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

export default function StaffPerformanceTable({ data, currency }: StaffPerformanceTableProps) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-gray-400">No staff performance data for this period.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
            <th className="px-4 py-2">Staff</th>
            <th className="px-4 py-2 text-right">Revenue</th>
            <th className="px-4 py-2 text-right">Transactions</th>
            <th className="px-4 py-2 text-right">Avg Order</th>
            <th className="px-4 py-2 text-right">Discounts</th>
            <th className="px-4 py-2 text-right">Hours</th>
            <th className="px-4 py-2 text-right">Rev/Hour</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((s) => (
            <tr key={s.staffId} className="hover:bg-gray-50">
              <td className="px-4 py-2">
                <p className="font-medium text-gray-900">{s.name}</p>
                <p className="text-xs text-gray-400 capitalize">{s.role}</p>
              </td>
              <td className="px-4 py-2 text-right font-medium text-green-600">{fmt(s.revenue, currency)}</td>
              <td className="px-4 py-2 text-right text-gray-700">{s.transactions}</td>
              <td className="px-4 py-2 text-right text-gray-700">{fmt(s.avgOrderValue, currency)}</td>
              <td className="px-4 py-2 text-right text-red-500">{fmt(s.totalDiscount, currency)}</td>
              <td className="px-4 py-2 text-right text-gray-600">
                {s.totalHours > 0 ? `${s.totalHours.toFixed(1)}h` : '—'}
              </td>
              <td className="px-4 py-2 text-right text-gray-600">
                {s.revenuePerHour ? fmt(s.revenuePerHour, currency) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
