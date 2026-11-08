import { describe, it, expect } from 'vitest';
import { parseTaxRuleInput } from '@/lib/tax-rule-input';

const CAT = '64b0000000000000000000c1';

describe('parseTaxRuleInput (create)', () => {
  it('fills defaults and trims', () => {
    const r = parseTaxRuleInput({ name: '  VAT ', rate: '12' }, false);
    expect(r).toEqual({
      ok: true,
      data: { name: 'VAT', rate: 12, label: 'Tax', appliesTo: 'all', categoryIds: [], productIds: [], region: {}, priority: 0, isActive: true },
    });
  });

  it('requires a name and a rate from 0 to 100', () => {
    expect(parseTaxRuleInput({ name: ' ', rate: 12 }, false)).toMatchObject({ ok: false, error: { key: 'validation.taxRuleNameRequired' } });
    for (const rate of [-1, 101, 'abc', '', null, undefined, Infinity]) {
      expect(parseTaxRuleInput({ name: 'VAT', rate }, false)).toMatchObject({ ok: false, error: { key: 'validation.taxRateRequired' } });
    }
  });

  it('rejects an unknown scope, a bad priority and malformed ids', () => {
    expect(parseTaxRuleInput({ name: 'A', rate: 1, appliesTo: 'everything' }, false)).toMatchObject({ ok: false, error: { key: 'validation.taxRuleScopeInvalid' } });
    expect(parseTaxRuleInput({ name: 'A', rate: 1, priority: -1 }, false)).toMatchObject({ ok: false, error: { key: 'validation.taxRulePriorityInvalid' } });
    expect(parseTaxRuleInput({ name: 'A', rate: 1, priority: 1.5 }, false)).toMatchObject({ ok: false });
    expect(parseTaxRuleInput({ name: 'A', rate: 1, categoryIds: ['x'] }, false)).toMatchObject({ ok: false, error: { key: 'validation.taxRuleIdsInvalid' } });
  });

  it('refuses a category rule with no categories, since it would never match', () => {
    expect(parseTaxRuleInput({ name: 'A', rate: 1, appliesTo: 'categories', categoryIds: [] }, false))
      .toMatchObject({ ok: false, error: { key: 'validation.taxRuleCategoriesRequired' } });
    expect(parseTaxRuleInput({ name: 'A', rate: 1, appliesTo: 'categories', categoryIds: [CAT, CAT] }, false))
      .toMatchObject({ ok: true, data: { categoryIds: [CAT] } });
  });

  it('keeps only filled region fields and de-duplicates zip codes', () => {
    const r = parseTaxRuleInput({ name: 'A', rate: 1, region: { country: ' PH ', state: '', zipCodes: ['1000', ' 1000', '', 2000] } }, false);
    expect(r).toMatchObject({ ok: true, data: { region: { country: 'PH', zipCodes: ['1000'] } } });
  });
});

describe('parseTaxRuleInput (update)', () => {
  it('returns only the fields sent', () => {
    expect(parseTaxRuleInput({ isActive: false }, true)).toEqual({ ok: true, data: { isActive: false } });
  });

  it('rejects a non-boolean isActive and a blank name', () => {
    expect(parseTaxRuleInput({ isActive: 'no' }, true)).toMatchObject({ ok: false });
    expect(parseTaxRuleInput({ name: '' }, true)).toMatchObject({ ok: false, error: { key: 'validation.taxRuleNameRequired' } });
  });

  it('clears a region when an empty one is sent', () => {
    expect(parseTaxRuleInput({ region: {} }, true)).toEqual({ ok: true, data: { region: {} } });
  });
});
