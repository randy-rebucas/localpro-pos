'use client';

interface TopProduct {
  _id: string;
  name: string;
  revenue: number;
  quantity: number;
}

interface TopProductsTableProps {
  products: TopProduct[];
  currency?: string;
}

function formatCurrency(value: number, currency = 'PHP') {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

export default function TopProductsTable({ products, currency }: TopProductsTableProps) {
  if (!products || products.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Products (This Month)</h3>
        <p className="text-sm text-gray-400">No sales data yet.</p>
      </div>
    );
  }

  const maxRevenue = products[0]?.revenue || 1;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Products (This Month)</h3>
      <div className="space-y-2">
        {products.map((p, i) => (
          <div key={p._id || i} className="flex items-center gap-3">
            <span className="text-xs text-gray-400 w-4">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-0.5">
                <p className="text-xs font-medium text-gray-800 truncate">{p.name}</p>
                <p className="text-xs text-gray-600 ml-2 shrink-0">
                  {formatCurrency(p.revenue, currency)}
                </p>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full"
                  style={{ width: `${(p.revenue / maxRevenue) * 100}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-gray-400 shrink-0">{p.quantity} sold</span>
          </div>
        ))}
      </div>
    </div>
  );
}
