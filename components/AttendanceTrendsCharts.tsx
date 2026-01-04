'use client';

import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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
  dict: Record<string, unknown>;
}

export default function AttendanceTrendsCharts({ attendances, dict }: AttendanceTrendsChartsProps) {
  // Process data for daily hours chart
  const dailyHoursMap = new Map<string, number>();
  const dailyCountMap = new Map<string, number>();

  attendances.forEach(attendance => {
    if (attendance.totalHours) {
      const date = new Date(attendance.clockIn).toLocaleDateString();
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

  const formatHours = (value: number) => {
    const h = Math.floor(value);
    const m = Math.round((value - h) * 60);
    return `${h}h ${m}m`;
  };

  // CustomTooltip moved inline to avoid creating component during render

  return (
    <div className="space-y-6 mb-6">
      {/* Daily Hours Worked - Line Chart */}
      {dailyHoursData.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {dict.admin?.dailyHoursWorked || 'Daily Hours Worked'}
          </h3>
          <ResponsiveContainer width="100%" height={350}>
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
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-white border border-gray-300 rounded-lg p-3 shadow-lg">
                        <p className="font-semibold text-gray-900 mb-2">{label || (payload[0]?.payload as { fullName?: string })?.fullName}</p>
                        {payload.map((entry, index: number) => (
                          <p key={index} className="text-sm" style={{ color: entry.color }}>
                            {entry.name}: {entry.name?.toLowerCase().includes('hours') 
                              ? formatHours(entry.value as number)
                              : entry.value}
                          </p>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="hours"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 4 }}
                activeDot={{ r: 6 }}
                name={dict.admin?.totalHours || 'Total Hours'}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Daily Attendance Count - Bar Chart */}
      {dailyCountData.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {dict.admin?.dailyAttendanceCount || 'Daily Attendance Count'}
          </h3>
          <ResponsiveContainer width="100%" height={350}>
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
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}
              />
              <Legend />
              <Bar dataKey="count" fill="#10b981" name={dict.admin?.attendanceCount || 'Attendance Count'} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Hours by Employee - Bar Chart */}
      {employeeHoursData.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {dict.admin?.hoursByEmployee || 'Hours by Employee'}
          </h3>
          <ResponsiveContainer width="100%" height={350}>
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
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-white border border-gray-300 rounded-lg p-3 shadow-lg">
                        <p className="font-semibold text-gray-900 mb-2">{label || (payload[0]?.payload as { fullName?: string })?.fullName}</p>
                        {payload.map((entry, index: number) => (
                          <p key={index} className="text-sm" style={{ color: entry.color }}>
                            {entry.name}: {entry.name?.toLowerCase().includes('hours') 
                              ? formatHours(entry.value as number)
                              : entry.value}
                          </p>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend />
              <Bar dataKey="hours" fill="#8b5cf6" name={dict.admin?.totalHours || 'Total Hours'} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
