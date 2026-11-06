import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockAggregate = vi.fn();
const mockTenantLean = vi.fn();

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/models/Transaction', () => ({ default: { aggregate: (...args: unknown[]) => mockAggregate(...args) } }));
vi.mock('@/models/Expense', () => ({ default: { aggregate: vi.fn().mockResolvedValue([]) } }));
vi.mock('@/models/Tenant', () => ({
  default: { findById: () => ({ select: () => ({ lean: mockTenantLean }) }) },
}));
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: vi.fn().mockResolvedValue({
    tenantId: '507f1f77bcf86cd799439011',
    user: { role: 'owner' },
  }),
  TenantAccessViolationError: class extends Error {},
  handleTenantAccessViolation: vi.fn(),
}));
vi.mock('@/lib/permissions-server', () => ({ hasTenantPermission: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

import { GET } from '@/app/api/transactions/stats/route';

async function pipelineFor(period: string) {
  const res = await GET(new NextRequest(`http://localhost/api/transactions/stats?period=${period}`));
  expect(res.status).toBe(200);
  return mockAggregate.mock.calls[0][0];
}

describe('transaction stats timezone', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-06T01:00:00Z')); // 9 AM on Nov 6 in Manila
    mockAggregate.mockReset();
    mockAggregate.mockReturnValue({
      option: vi.fn().mockResolvedValue([{ stats: [], paymentMethodStats: [], timeSeriesData: [] }]),
    });
    mockTenantLean.mockResolvedValue({ settings: { timezone: 'Asia/Manila' } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts today at the store's midnight", async () => {
    const pipeline = await pipelineFor('today');

    expect(pipeline[0].$match.createdAt.$gte.toISOString()).toBe('2026-11-05T16:00:00.000Z');
  });

  it("groups hours in the store's timezone", async () => {
    const pipeline = await pipelineFor('today');

    expect(pipeline[1].$facet.timeSeriesData[0].$group._id).toEqual({
      $hour: { date: '$createdAt', timezone: 'Asia/Manila' },
    });
  });

  it("groups days in the store's timezone", async () => {
    const pipeline = await pipelineFor('week');

    expect(pipeline[1].$facet.timeSeriesData[0].$group._id.day).toEqual({
      $dayOfMonth: { date: '$createdAt', timezone: 'Asia/Manila' },
    });
  });

  it('falls back to Manila when the store has no timezone set', async () => {
    mockTenantLean.mockResolvedValue({ settings: {} });

    const pipeline = await pipelineFor('today');

    expect(pipeline[0].$match.createdAt.$gte.toISOString()).toBe('2026-11-05T16:00:00.000Z');
  });
});
