import { describe, it, expect } from 'vitest';
import { isTemplateSlot, slotVariables, unknownTemplateVariables } from '@/lib/notification-template-slots';

describe('notification template slots', () => {
  it('accepts only the slots the tenant schema has', () => {
    expect(isTemplateSlot('email', 'attendanceAlert')).toBe(true);
    expect(isTemplateSlot('sms', 'attendanceAlert')).toBe(false); // attendance alerts are email-only
    expect(isTemplateSlot('sms', 'lowStockAlert')).toBe(true);
    expect(isTemplateSlot('push', 'lowStockAlert')).toBe(false);
    expect(isTemplateSlot('email', '__proto__')).toBe(false);
    expect(isTemplateSlot('email', undefined)).toBe(false);
  });

  it('lists what the booking confirmation sender fills, not startTime/endTime', () => {
    const v = slotVariables('email', 'bookingConfirmation');
    expect(v.body).toEqual(expect.arrayContaining(['time', 'notes', 'companyName']));
    expect(v.body).not.toContain('startTime');
    expect(v.body).not.toContain('endTime');
    // The sender now renders the subject with the same variables as the body.
    expect(v.subject).toEqual(v.body);
    expect(slotVariables('email', 'bookingReminder').subject).toContain('customerName');
  });

  it('uses the body variables for the subject when the sender passes the same set', () => {
    expect(slotVariables('email', 'attendanceAlert').subject).toEqual(slotVariables('email', 'attendanceAlert').body);
  });

  it('flags variables a slot never fills, including inside {{#if}}', () => {
    const allowed = slotVariables('sms', 'bookingReminder').body;
    expect(unknownTemplateVariables('Hi {{customerName}} at {{startTime}} {{#if staffName}}with {{staffName}}{{/if}}', allowed))
      .toEqual(['startTime', 'staffName']);
    expect(unknownTemplateVariables('Hi {{customerName}}, see you {{date}} {{time}}', allowed)).toEqual([]);
  });
});
