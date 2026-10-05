'use client';

import { memo } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { formatDate } from '@/lib/formatting';

// Win8 token hexes (success, accent) for series fills; recharts needs literal colors.
const SUCCESS = '#0b7a44';
const ACCENT = '#7a3fc9';
const TOOLTIP_STYLE = { backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: 0 };
const PANEL = 'bg-white border border-gray-300 p-5';

const formatHours = (value: number) => {
  const h = Math.floor(value);
  const m = Math.round((value - h) * 60);
  return `${h}h ${m}m`;
};

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number; payload: { fullName: string } }>; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-300 p-3">
        <p className="text-sm font-semibold text-gray-900 mb-1">{label || payload[0].payload.fullName}</p>
        {payload.map((entry, index: number) => (
          <p key={index} className="text-sm tabular-nums" style={{ color: entry.color }}>
            {entry.name}: {entry.name.toLowerCase().includes('hours')
              ? formatHours(entry.value)
              : entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

interface Attendance {
  _id: string;
  userId: string | { _id: string; name: string; email: string };
  clockIn: string;
  clockOut?: string;
  totalHours?: number;
  createdAt: string;
}

interface AttendanceTrendsChartsProps {
  attendances: Attendance[];
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export default memo(function AttendanceTrendsCharts({ attendances, dict }: AttendanceTrendsChartsProps) {
  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  const primaryColor = tenantSettings.primaryColor || '#35979c';

  // Process data for daily hours chart
  const dailyHoursMap = new Map<string, number>();
  const dailyCountMap = new Map<string, number>();

  attendances.forEach(attendance => {
    if (attendance.totalHours) {
      const date = formatDate(new Date(attendance.clockIn), tenantSettings);
      const currentHours = dailyHoursMap.get(date) || 0;
      dailyHoursMap.set(date, currentHours + attendance.totalHours);
      
      const currentCount = dailyCountMap.get(date) || 0;
      dailyCountMap.set(date, currentCount + 1);
    }
  });

  // Convert to array and sort by date
  const dailyHoursData = Array.from(dailyHoursMap.entries())
    .map(([date, hours]) => ({
      date,
      hours: Math.round(hours * 10) / 10, // Round to 1 decimal
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const dailyCountData = Array.from(dailyCountMap.entries())
    .map(([date, count]) => ({
      date,
      count,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Process data for hours by employee
  const employeeHoursMap = new Map<string, { name: string; hours: number }>();

  attendances.forEach(attendance => {
    if (attendance.totalHours) {
      const userName = typeof attendance.userId === 'object' 
        ? attendance.userId.name 
        : 'Unknown';
      const userId = typeof attendance.userId === 'object' 
        ? attendance.userId._id 
        : attendance.userId;
      
      const existing = employeeHoursMap.get(userId);
      if (existing) {
        existing.hours += attendance.totalHours;
      } else {
        employeeHoursMap.set(userId, { name: userName, hours: attendance.totalHours });
      }
    }
  });

  const employeeHoursData = Array.from(employeeHoursMap.values())
    .map(emp => ({
      name: emp.name.length > 15 ? emp.name.substring(0, 15) + '...' : emp.name,
      fullName: emp.name,
      hours: Math.round(emp.hours * 10) / 10,
    }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 10); // Top 10 employees

  if (attendances.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Daily Hours Worked - Line Chart */}
      {dailyHoursData.length > 0 && (
        <div className={`${PANEL} lg:col-span-2`}>
          <h3 className="text-sm font-bold text-gray-900 mb-4">
            {dict.admin?.dailyHoursWorked || 'Daily Hours Worked'}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyHoursData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                angle={-45}
                textAnchor="end"
                height={80}
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <YAxis
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => `${value}h`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="hours"
                stroke={primaryColor}
                strokeWidth={2}
                dot={{ fill: primaryColor, r: 4 }}
                activeDot={{ r: 6 }}
                name={dict.admin?.totalHours || 'Total Hours'}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Daily Attendance Count - Bar Chart */}
      {dailyCountData.length > 0 && (
        <div className={PANEL}>
          <h3 className="text-sm font-bold text-gray-900 mb-4">
            {dict.admin?.dailyAttendanceCount || 'Daily Attendance Count'}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyCountData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                angle={-45}
                textAnchor="end"
                height={80}
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <YAxis
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend />
              <Bar dataKey="count" fill={SUCCESS} name={dict.admin?.attendanceCount || 'Attendance Count'} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Hours by Employee - Bar Chart */}
      {employeeHoursData.length > 0 && (
        <div className={PANEL}>
          <h3 className="text-sm font-bold text-gray-900 mb-4">
            {dict.admin?.hoursByEmployee || 'Hours by Employee'}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={employeeHoursData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="name"
                angle={-45}
                textAnchor="end"
                height={80}
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <YAxis
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => `${value}h`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="hours" fill={ACCENT} name={dict.admin?.totalHours || 'Total Hours'} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
});
