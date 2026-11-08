// No imports: this file is used by the client editor, and lib/notification-templates pulls in the Tenant model.

/**
 * The template slots in models/Tenant.ts settings.notificationTemplates, and the
 * variables each sender actually fills (lib/notifications.ts and
 * lib/automations/low-stock-alerts.ts). Anything else in a template prints as blank.
 */
export const TEMPLATE_SLOTS = {
  email: ['bookingConfirmation', 'bookingReminder', 'bookingCancellation', 'lowStockAlert', 'attendanceAlert'],
  // Attendance alerts are email-only (sendAttendanceNotification has no SMS path).
  sms: ['bookingConfirmation', 'bookingReminder', 'bookingCancellation', 'lowStockAlert'],
} as const;

export type TemplateType = keyof typeof TEMPLATE_SLOTS;
export type TemplateCategory = (typeof TEMPLATE_SLOTS)['email'][number];

interface SlotVariables {
  body: readonly string[];
  /** Variables filled in an email subject, when different from the body. */
  subject?: readonly string[];
}

const BOOKING_SMS = ['customerName', 'serviceName', 'date', 'time'] as const;
const CANCELLATION = ['customerName', 'serviceName', 'date', 'time', 'reason'] as const;
const LOW_STOCK = ['productName', 'sku', 'currentStock', 'threshold'] as const;

export const TEMPLATE_VARIABLES: { email: Record<TemplateCategory, SlotVariables>; sms: Record<(typeof TEMPLATE_SLOTS)['sms'][number], SlotVariables> } = {
  email: {
    bookingConfirmation: { body: ['customerName', 'serviceName', 'date', 'time', 'staffName', 'notes', 'companyName'] },
    bookingReminder: { body: ['customerName', 'serviceName', 'date', 'time', 'staffName', 'companyName'] },
    bookingCancellation: { body: CANCELLATION },
    lowStockAlert: { body: LOW_STOCK },
    attendanceAlert: { body: ['employeeName', 'clockInTime', 'expectedTime', 'hours'] },
  },
  sms: {
    bookingConfirmation: { body: BOOKING_SMS },
    bookingReminder: { body: BOOKING_SMS },
    bookingCancellation: { body: CANCELLATION },
    lowStockAlert: { body: LOW_STOCK },
  },
};

/** Low-stock templates are rendered once per product, then joined into one message. */
export const PER_PRODUCT_CATEGORIES: readonly TemplateCategory[] = ['lowStockAlert'];

export function isTemplateSlot(type: unknown, category: unknown): type is TemplateType {
  return typeof type === 'string' && type in TEMPLATE_SLOTS && typeof category === 'string'
    && (TEMPLATE_SLOTS[type as TemplateType] as readonly string[]).includes(category);
}

/** Variables a slot fills for its body and (email) subject. */
export function slotVariables(type: TemplateType, category: TemplateCategory): { body: readonly string[]; subject: readonly string[] } {
  const slot = (TEMPLATE_VARIABLES[type] as Record<string, SlotVariables>)[category];
  if (!slot) return { body: [], subject: [] };
  return { body: slot.body, subject: slot.subject ?? slot.body };
}

/** Variables used in `text` that the slot never fills, so they would print blank. */
export function unknownTemplateVariables(text: string, allowed: readonly string[]): string[] {
  const used = new Set<string>();
  for (const m of text.matchAll(/\{\{(?:#if\s+)?(\w+)\}\}/g)) used.add(m[1]);
  return [...used].filter((v) => !allowed.includes(v));
}

export const MAX_TEMPLATE_LENGTH = { email: 5000, sms: 640, subject: 200 } as const;
