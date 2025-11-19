'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ChartDataPoint {
  date: string;
  sales: number;
  transactions: number;
}

interface SalesChartProps {
  data: ChartDataPoint[];
  dict: any;
}

export default function SalesChart({ data, dict }: SalesChartProps) {
  console.log('[SalesChart] Received data:', data);
  
  // Validate and ensure data is properly formatted
  const chartData = (data || []).map((item) => {
    const salesValue = typeof item.sales === 'number' ? item.sales : parseFloat(String(item.sales)) || 0;
    const transactionsValue = typeof item.transactions === 'number' ? item.transactions : parseInt(String(item.transactions)) || 0;
    return {
      date: String(item.date || ''),
      sales: salesValue,
      transactions: transactionsValue,
    };
  }).filter((item) => item.sales >= 0 && item.transactions >= 0); // Ensure valid numeric values

  console.log('[SalesChart] Processed chart data:', chartData);

  if (!chartData || chartData.length === 0) {
    return (
      <div className="w-full h-64 sm:h-80 lg:h-96 flex items-center justify-center">
        <div className="text-center">
          <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-gray-500 text-lg">No chart data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-64 sm:h-80 lg:h-96">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis 
            dataKey="date" 
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis 
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
            tickFormatter={(value) => `$${value.toFixed(0)}`}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#fff', 
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}
            formatter={(value: any) => {
              const numValue = typeof value === 'number' ? value : parseFloat(String(value));
              return `$${numValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }}
            labelFormatter={(label) => `${dict.dashboard?.date || 'Date'}: ${label}`}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="sales" 
            stroke="#2563eb" 
            strokeWidth={2}
            dot={{ fill: '#2563eb', r: 4 }}
            activeDot={{ r: 6 }}
            name={dict.dashboard?.totalSales || 'Total Sales'}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

