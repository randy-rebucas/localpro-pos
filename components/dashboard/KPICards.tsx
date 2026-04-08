'use client';

interface KPIData {
  today: {
    revenue: number;
    transactions: number;
    avgOrderValue: number;
    totalDiscount: number;
  };
  month: {
    revenue: number;
    transactions: number;
  };
  alerts: {
    lowStock: number;
    pendingBookings: number;
    activeStaff: number;
  };
}

interface KPICardsProps {
  data: KPIData;
  currency?: string;
}

function formatCurrency(value: number, currency = 'PHP') {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

function Card({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-4 shadow-sm`}>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function KPICards({ data, currency }: KPICardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card
        label="Today's Revenue"
        value={formatCurrency(data.today.revenue, currency)}
        sub={`${data.today.transactions} transactions`}
        color="text-green-600"
      />
      <Card
        label="Avg Order Value"
        value={formatCurrency(data.today.avgOrderValue, currency)}
        sub={`${formatCurrency(data.today.totalDiscount, currency)} discounted today`}
        color="text-blue-600"
      />
      <Card
        label="Month Revenue"
        value={formatCurrency(data.month.revenue, currency)}
        sub={`${data.month.transactions} transactions`}
        color="text-indigo-600"
      />
      <Card
        label="Alerts"
        value={String(data.alerts.lowStock)}
        sub={`low stock items · ${data.alerts.pendingBookings} pending bookings`}
        color={data.alerts.lowStock > 0 ? 'text-red-600' : 'text-gray-600'}
      />
    </div>
  );
}
