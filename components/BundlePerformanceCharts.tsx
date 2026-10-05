'use client';

import { memo } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { formatCurrency, formatNumber, getCurrencySymbol, getDefaultTenantSettings } from '@/lib/currency'; // eslint-disable-line @typescript-eslint/no-unused-vars
import Currency from '@/components/Currency';

interface BundleAnalytics {
  bundleId: string;
  bundleName: string;
  bundlePrice: number;
  totalSales: number;
  totalQuantity: number;
  transactionCount: number;
  averageOrderValue: number;
  averageQuantity: number;
  revenuePerUnit: number;
}

interface BundlePerformanceChartsProps {
  analytics: BundleAnalytics[];
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// Win8 token hexes: brand, success, accent, info, suspended, navy, warning, danger
const DEFAULT_COLORS = ['#35979c', '#0b7a44', '#7a3fc9', '#1e70bf', '#b35900', '#1e3a4c', '#8a6206', '#c0392b'];
const TOOLTIP_STYLE = { backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: 0 };

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number; payload: { fullName: string } }>; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-300 p-3">
        <p className="text-sm font-semibold text-gray-900 mb-1">{label || payload[0].payload.fullName}</p>
        {payload.map((entry, index: number) => (
          <p key={index} className="text-sm tabular-nums" style={{ color: entry.color }}>
            {entry.name}: <Currency amount={entry.value} />
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default memo(function BundlePerformanceCharts({ analytics, dict }: BundlePerformanceChartsProps) {
  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  const primaryColor = tenantSettings.primaryColor || '#35979c';
  const COLORS = [primaryColor, ...DEFAULT_COLORS.filter(c => c !== primaryColor)].slice(0, 8);

  // Prepare data for charts - limit to top 10 for readability
  const topBundles = analytics.slice(0, 10);

  // Bar chart data for sales by bundle
  const salesData = topBundles.map(bundle => ({
    name: bundle.bundleName.length > 15 ? bundle.bundleName.substring(0, 15) + '...' : bundle.bundleName,
    fullName: bundle.bundleName,
    sales: bundle.totalSales,
    quantity: bundle.totalQuantity,
    transactions: bundle.transactionCount,
  }));

  // Pie chart data for sales distribution (top 8 + others)
  const pieData = analytics.slice(0, 8).map(bundle => ({
    name: bundle.bundleName.length > 20 ? bundle.bundleName.substring(0, 20) + '...' : bundle.bundleName,
    fullName: bundle.bundleName,
    value: bundle.totalSales,
  }));

  // Add "Others" if there are more than 8 bundles
  if (analytics.length > 8) {
    const othersSales = analytics.slice(8).reduce((sum, bundle) => sum + bundle.totalSales, 0);
    pieData.push({
      name: dict.admin?.others || 'Others',
      fullName: dict.admin?.others || 'Others',
      value: othersSales,
    });
  }

  // Format currency for Y-axis
  const formatYAxisValue = (value: number) => {
    const rounded = Math.round(value);
    const numberFormat = {
      ...tenantSettings.numberFormat,
      decimalPlaces: 0,
    };
    const formatted = formatNumber(rounded, numberFormat);
    const symbol = tenantSettings.currencySymbol || getCurrencySymbol(tenantSettings.currency);
    if (tenantSettings.currencyPosition === 'after') {
      return `${formatted} ${symbol}`;
    }
    return `${symbol}${formatted}`;
  };


  if (!analytics || analytics.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Sales by Bundle - Bar Chart */}
      <div className="bg-white border border-gray-300 p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-4">
          {dict.admin?.salesByBundle || 'Sales by Bundle'}
        </h3>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={salesData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={100}
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <YAxis
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
              tickFormatter={formatYAxisValue}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="sales" fill={primaryColor} name={dict.admin?.totalSales || 'Total Sales'} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Quantity Sold by Bundle - Bar Chart */}
      <div className="bg-white border border-gray-300 p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-4">
          {dict.admin?.quantityByBundle || 'Quantity Sold by Bundle'}
        </h3>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={salesData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={100}
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <YAxis
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
            />
            <Legend />
            <Bar dataKey="quantity" fill={COLORS[1]} name={dict.admin?.quantity || 'Quantity'} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Sales Distribution - Pie Chart */}
      {pieData.length > 0 && (
        <div className="bg-white border border-gray-300 p-5 lg:col-span-2">
          <h3 className="text-sm font-bold text-gray-900 mb-4">
            {dict.admin?.salesDistribution || 'Sales Distribution'}
          </h3>
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                outerRadius={120}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value: any) => <Currency amount={value} />} // eslint-disable-line @typescript-eslint/no-explicit-any
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
});
