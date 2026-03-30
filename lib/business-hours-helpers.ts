import type { ITenantSettings } from '@/models/Tenant';

export function hasValidBusinessHours(settings: ITenantSettings | null): boolean {
  if (!settings?.businessHours?.schedule) return false;

  const schedule = settings.businessHours.schedule;
  return Object.values(schedule).some((day) => day && day.enabled);
}

export function getBusinessDaysCount(settings: ITenantSettings | null): number {
  if (!settings?.businessHours?.schedule) return 0;

  const schedule = settings.businessHours.schedule;
  return Object.values(schedule).filter((day) => day && day.enabled).length;
}

export function formatTime(time: string | undefined): string {
  if (!time) return '-';

  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours, 10);
  const minute = parseInt(minutes, 10);

  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
}

export function getOperationsSummary(settings: ITenantSettings | null, dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!settings || !hasValidBusinessHours(settings)) {
    return dict?.admin?.noBusinessHours || 'Not configured';
  }

  const daysCount = getBusinessDaysCount(settings);
  return `${daysCount} ${dict?.admin?.daysPerWeek || 'days per week'}`;
}

export function getUpdateSuccessMessage(dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return dict?.admin?.businessHoursUpdated || 'Business hours updated successfully';
}

export function getUpdateErrorMessage(dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return dict?.admin?.updateBusinessHoursError || 'Failed to update business hours';
}
