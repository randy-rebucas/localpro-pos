import { describe, it, expect } from 'vitest';
import { serializeBooking, toAppBookingStatus, toDbBookingStatus } from '@/lib/booking-serializer';

describe('booking status mapping', () => {
  it('maps the Prisma enum member no_show to the app literal no-show and back', () => {
    expect(toAppBookingStatus('no_show')).toBe('no-show');
    expect(toDbBookingStatus('no-show')).toBe('no_show');
  });

  it('leaves the other statuses untouched', () => {
    for (const s of ['pending', 'confirmed', 'completed', 'cancelled']) {
      expect(toAppBookingStatus(s)).toBe(s);
      expect(toDbBookingStatus(s)).toBe(s);
    }
  });
});

describe('serializeBooking', () => {
  it('emits _id, the app status literal, and a populated staffId', () => {
    const out = serializeBooking({
      id: 'b1',
      staffId: 'u1',
      status: 'no_show',
      staff: { name: 'Ana', email: 'ana@example.com' },
      customerName: 'Jose',
    });
    expect(out._id).toBe('b1');
    expect(out.status).toBe('no-show');
    expect(out.staffId).toEqual({ _id: 'u1', name: 'Ana', email: 'ana@example.com' });
    expect('staff' in out).toBe(false);
  });

  it('leaves staffId undefined when unassigned', () => {
    const out = serializeBooking({ id: 'b2', staffId: null as string | null, status: 'pending', staff: null });
    expect(out.staffId).toBeUndefined();
    expect(out.status).toBe('pending');
  });
});
