import mongoose from 'mongoose';

export const TAX_RULE_SCOPES = ['all', 'products', 'services', 'categories'] as const;
export type TaxRuleScope = (typeof TAX_RULE_SCOPES)[number];

export interface TaxRuleInput {
  name?: string;
  rate?: number;
  label?: string;
  appliesTo?: TaxRuleScope;
  categoryIds?: string[];
  productIds?: string[];
  region?: { country?: string; state?: string; city?: string; zipCodes?: string[] };
  priority?: number;
  isActive?: boolean;
}

/** A rejected field: the validation dictionary key and its English fallback. */
export interface TaxRuleInputError {
  key: string;
  fallback: string;
}

const isId = (v: unknown): v is string => typeof v === 'string' && mongoose.Types.ObjectId.isValid(v);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Checks and cleans a tax rule body. With `partial` (PATCH) only the fields sent are
 * returned; otherwise name and rate are required. Category ownership is checked by the
 * route, since it needs the database.
 */
export function parseTaxRuleInput(
  body: unknown,
  partial: boolean
): { ok: true; data: TaxRuleInput } | { ok: false; error: TaxRuleInputError } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: { key: 'validation.invalidRequest', fallback: 'Invalid request' } };
  }
  const b = body as Record<string, unknown>;
  const has = (k: string) => b[k] !== undefined;
  const data: TaxRuleInput = {};
  const fail = (key: string, fallback: string) => ({ ok: false as const, error: { key, fallback } });

  if (!partial || has('name')) {
    const name = str(b.name, 100);
    if (!name) return fail('validation.taxRuleNameRequired', 'Tax rule name is required');
    data.name = name;
  }

  if (!partial || has('rate')) {
    const rate = typeof b.rate === 'string' && b.rate.trim() !== '' ? Number(b.rate) : b.rate;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 100) {
      return fail('validation.taxRateRequired', 'Tax rate must be between 0 and 100');
    }
    data.rate = Math.round(rate * 100) / 100;
  }

  if (has('label') || !partial) {
    // The model requires a label; fall back to the generic one rather than reject.
    data.label = str(b.label, 30) || 'Tax';
  }

  if (has('appliesTo') || !partial) {
    const scope = b.appliesTo ?? 'all';
    if (!TAX_RULE_SCOPES.includes(scope as TaxRuleScope)) {
      return fail('validation.taxRuleScopeInvalid', 'Choose what the tax rule applies to');
    }
    data.appliesTo = scope as TaxRuleScope;
  }

  for (const field of ['categoryIds', 'productIds'] as const) {
    if (has(field) || !partial) {
      const list = b[field] ?? [];
      if (!Array.isArray(list) || !list.every(isId)) {
        return fail('validation.taxRuleIdsInvalid', 'The tax rule lists an item that does not exist');
      }
      data[field] = [...new Set(list as string[])];
    }
  }

  // A category rule with no categories never matches a sale, so it would silently do nothing.
  if (data.appliesTo === 'categories' && data.categoryIds !== undefined && data.categoryIds.length === 0) {
    return fail('validation.taxRuleCategoriesRequired', 'Pick at least one category for this tax rule');
  }

  if (has('region') || !partial) {
    const r = b.region;
    if (r !== null && r !== undefined && (typeof r !== 'object' || Array.isArray(r))) {
      return fail('validation.invalidRequest', 'Invalid request');
    }
    const region = (r || {}) as Record<string, unknown>;
    const zips = Array.isArray(region.zipCodes)
      ? [...new Set(region.zipCodes.map((z) => str(z, 20)).filter(Boolean))].slice(0, 200)
      : [];
    data.region = {
      ...(str(region.country, 60) && { country: str(region.country, 60) }),
      ...(str(region.state, 60) && { state: str(region.state, 60) }),
      ...(str(region.city, 60) && { city: str(region.city, 60) }),
      ...(zips.length > 0 && { zipCodes: zips }),
    };
  }

  if (has('priority') || !partial) {
    const p = typeof b.priority === 'string' && b.priority.trim() !== '' ? Number(b.priority) : (b.priority ?? 0);
    if (typeof p !== 'number' || !Number.isInteger(p) || p < 0 || p > 1000) {
      return fail('validation.taxRulePriorityInvalid', 'Priority must be a whole number from 0 to 1000');
    }
    data.priority = p;
  }

  if (has('isActive')) {
    if (typeof b.isActive !== 'boolean') return fail('validation.invalidRequest', 'Invalid request');
    data.isActive = b.isActive;
  } else if (!partial) {
    data.isActive = true;
  }

  return { ok: true, data };
}
