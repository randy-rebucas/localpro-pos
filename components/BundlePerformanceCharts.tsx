'use client';

import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { formatCurrency, formatNumber, getCurrencySymbol, getDefaultTenantSettings } from '@/lib/currency';
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
  dict: any;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function BundlePerformanceCharts({ analytics, dict }: BundlePerformanceChartsProps) {
  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();

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

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-gray-300 rounded-lg p-3 shadow-lg">
          <p className="font-semibold text-gray-900 mb-2">{label || payload[0].payload.fullName}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: <Currency amount={entry.value} />
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (!analytics || analytics.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6 mb-6">
      {/* Sales by Bundle - Bar Chart */}
      <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
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
            <Bar dataKey="sales" fill="#3b82f6" name={dict.admin?.totalSales || 'Total Sales'} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Quantity Sold by Bundle - Bar Chart */}
      <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
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
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              }}
            />
            <Legend />
            <Bar dataKey="quantity" fill="#10b981" name={dict.admin?.quantity || 'Quantity'} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Sales Distribution - Pie Chart */}
      {pieData.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
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
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}
                formatter={(value: any) => <Currency amount={value} />}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
