'use client';

import { memo, useMemo, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { formatCurrency, formatNumber, getCurrencySymbol, getDefaultTenantSettings } from '@/lib/currency';

interface ChartDataPoint {
  date: string;
  sales: number;
  transactions: number;
}

interface SalesChartProps {
  data: ChartDataPoint[];
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export default memo(function SalesChart({ data, dict }: SalesChartProps) {
  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();

  const chartData = useMemo(() =>
    (data || []).map((item) => ({
      date: String(item.date || ''),
      sales: typeof item.sales === 'number' ? item.sales : parseFloat(String(item.sales)) || 0,
      transactions: typeof item.transactions === 'number' ? item.transactions : parseInt(String(item.transactions)) || 0,
    })).filter((item) => item.sales >= 0 && item.transactions >= 0),
    [data]
  );

  const formatYAxisValue = useCallback((value: number) => {
    const rounded = Math.round(value);
    const numberFormat = { ...tenantSettings.numberFormat, decimalPlaces: 0 };
    const formatted = formatNumber(rounded, numberFormat);
    const symbol = tenantSettings.currencySymbol || getCurrencySymbol(tenantSettings.currency);
    if (tenantSettings.currencyPosition === 'after') {
      return `${formatted} ${symbol}`;
    }
    return `${symbol}${formatted}`;
  }, [tenantSettings]);

  const tooltipFormatter = useCallback((value: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const numValue = typeof value === 'number' ? value : parseFloat(String(value));
    return formatCurrency(numValue, tenantSettings);
  }, [tenantSettings]);

  const labelFormatter = useCallback((label: string) =>
    `${dict.dashboard?.date || 'Date'}: ${label}`,
    [dict]
  );

  if (!chartData || chartData.length === 0) {
    return (
      <div className="w-full h-64 sm:h-80 lg:h-96 flex items-center justify-center">
        <div className="text-center">
          <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-gray-500 text-lg">{dict?.components?.salesChart?.noChartDataAvailable || 'No chart data available'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-64 sm:h-80 lg:h-96">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
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
            tickFormatter={formatYAxisValue}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '0px',
              boxShadow: 'none'
            }}
            formatter={tooltipFormatter}
            labelFormatter={labelFormatter}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="sales"
            stroke={tenantSettings.primaryColor || '#35979c'}
            strokeWidth={2}
            dot={{ fill: tenantSettings.primaryColor || '#35979c', r: 4 }}
            activeDot={{ r: 6 }}
            name={dict.dashboard?.totalSales || 'Total Sales'}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});
