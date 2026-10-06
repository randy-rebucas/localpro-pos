import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  BACKUP_COLLECTION_SPECS,
  EXCLUDED_TENANT_MODELS,
  RESET_ORDER,
  getMissingResetDependencies,
  withResetDependencies,
} from '@/lib/backup-reset-collections';

// ---------------------------------------------------------------------------
// Minimal prisma/schema.prisma parser: model names, scalar fields, relations.
// ---------------------------------------------------------------------------
interface Relation {
  field: string;
  target: string;
  fks: string[];
  optional: boolean;
  onDelete: string | null;
}
interface ModelInfo {
  name: string;
  fields: Set<string>;
  relations: Relation[];
}

function parseSchema(): Map<string, ModelInfo> {
  const src = readFileSync(resolve(__dirname, '../prisma/schema.prisma'), 'utf8');
  const models = new Map<string, ModelInfo>();
  const blockRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(src))) {
    const info: ModelInfo = { name: m[1], fields: new Set(), relations: [] };
    for (const raw of m[2].split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      const fm = /^(\w+)\s+(\w+)(\?|\[\])?/.exec(line);
      if (!fm) continue;
      info.fields.add(fm[1]);
      const rel = /@relation\(([^)]*)\)/.exec(line);
      const fks = rel && /fields:\s*\[([^\]]*)\]/.exec(rel[1]);
      if (rel && fks) {
        info.relations.push({
          field: fm[1],
          target: fm[2],
          fks: fks[1].split(',').map((s) => s.trim()),
          optional: fm[3] === '?',
          onDelete: /onDelete:\s*(\w+)/.exec(rel[1])?.[1] ?? null,
        });
      }
    }
    models.set(info.name, info);
  }
  return models;
}

const schema = parseSchema();

// model name -> owning collection key (top-level or via a child spec)
const owner = new Map<string, string>();
for (const spec of BACKUP_COLLECTION_SPECS) {
  owner.set(spec.model, spec.key);
  for (const child of spec.children || []) owner.set(child.model, spec.key);
}

describe('backup/reset collection registry', () => {
  it('parses the schema', () => {
    expect(schema.size).toBeGreaterThan(50);
    expect(schema.get('Product')?.fields.has('tenantId')).toBe(true);
  });

  it('references only real Prisma models and fields', () => {
    for (const spec of BACKUP_COLLECTION_SPECS) {
      expect(schema.has(spec.model), `${spec.key}: model ${spec.model}`).toBe(true);
      expect(schema.get(spec.model)!.fields.has('tenantId'), `${spec.model} must have tenantId`).toBe(true);
      for (const field of spec.stripOnRestore || []) {
        expect(schema.get(spec.model)!.fields.has(field), `${spec.model}.${field}`).toBe(true);
      }
      for (const child of spec.children || []) {
        const model = schema.get(child.model);
        expect(model, `${child.key}: model ${child.model}`).toBeDefined();
        const rel = model!.relations.find((r) => r.field === child.parentRelation);
        expect(rel, `${child.model}.${child.parentRelation}`).toBeDefined();
        expect(rel!.fks).toEqual([child.fk]);
        expect(rel!.onDelete, `${child.model}.${child.parentRelation} must cascade`).toBe('Cascade');
        expect(model!.fields.has('tenantId')).toBe(!!child.hasTenantId);
        const parentModel = child.parent === spec.key
          ? spec.model
          : spec.children!.find((c) => c.key === child.parent)?.model;
        expect(parentModel, `${child.key}: parent ${child.parent} must be declared earlier`).toBeDefined();
        expect(rel!.target).toBe(parentModel);
        // parent child must be declared before this one
        if (child.parent !== spec.key) {
          const idx = spec.children!.findIndex((c) => c.key === child.parent);
          expect(idx).toBeLessThan(spec.children!.indexOf(child));
        }
      }
    }
  });

  it('has unique keys and unique labels', () => {
    const keys = BACKUP_COLLECTION_SPECS.flatMap((s) => [s.key, ...(s.children || []).map((c) => c.key)]);
    expect(new Set(keys).size).toBe(keys.length);
    const labels = BACKUP_COLLECTION_SPECS.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('covers every tenant-scoped model (or excludes it with a reason)', () => {
    const uncovered = [...schema.values()]
      .filter((m) => m.fields.has('tenantId') || m.name === 'Tenant')
      .map((m) => m.name)
      .filter((name) => !owner.has(name) && !EXCLUDED_TENANT_MODELS[name]);
    expect(uncovered).toEqual([]);

    for (const name of Object.keys(EXCLUDED_TENANT_MODELS)) {
      expect(schema.has(name), `excluded model ${name} exists`).toBe(true);
      expect(owner.has(name), `${name} is both covered and excluded`).toBe(false);
    }
  });

  it('includes every cascade child table of a covered model', () => {
    const missing: string[] = [];
    for (const model of schema.values()) {
      if (owner.has(model.name) || EXCLUDED_TENANT_MODELS[model.name] || model.fields.has('tenantId')) continue;
      // A tenant-less table that is deleted with a covered parent holds that
      // tenant's data and would be lost from backups if not exported.
      const cascadesFromCovered = model.relations.some((r) => r.onDelete === 'Cascade' && owner.has(r.target));
      if (cascadesFromCovered) missing.push(model.name);
    }
    expect(missing).toEqual([]);
  });

  it('lists every collection exactly once in RESET_ORDER', () => {
    expect([...RESET_ORDER].sort()).toEqual(BACKUP_COLLECTION_SPECS.map((s) => s.key).sort());
  });

  it('orders RESET_ORDER so every table is deleted before the tables it references', () => {
    const pos = new Map(RESET_ORDER.map((k, i) => [k, i]));
    const violations: string[] = [];
    for (const spec of BACKUP_COLLECTION_SPECS) {
      const models = [spec.model, ...(spec.children || []).map((c) => c.model)];
      for (const modelName of models) {
        for (const rel of schema.get(modelName)!.relations) {
          const target = owner.get(rel.target);
          if (!target || target === spec.key) continue;
          if (modelName === spec.model && rel.fks.every((fk) => spec.stripOnRestore?.includes(fk))) continue;
          if (pos.get(spec.key)! > pos.get(target)!) {
            violations.push(`${spec.key} (${modelName}.${rel.field}) must come before ${target}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('declares blockedBy exactly for required, non-cascading references', () => {
    const expected = new Map<string, Set<string>>();
    for (const spec of BACKUP_COLLECTION_SPECS) {
      const models = [spec.model, ...(spec.children || []).map((c) => c.model)];
      for (const modelName of models) {
        for (const rel of schema.get(modelName)!.relations) {
          const target = owner.get(rel.target);
          if (!target || target === spec.key) continue;
          if (rel.optional || rel.onDelete === 'Cascade' || rel.onDelete === 'SetNull') continue;
          if (!expected.has(target)) expected.set(target, new Set());
          expected.get(target)!.add(spec.key);
        }
      }
    }
    for (const spec of BACKUP_COLLECTION_SPECS) {
      expect(new Set(spec.blockedBy || []), `${spec.key}.blockedBy`).toEqual(expected.get(spec.key) || new Set());
    }
  });

  it('has no excluded model with a required reference that would block a reset', () => {
    const blockers: string[] = [];
    for (const name of Object.keys(EXCLUDED_TENANT_MODELS)) {
      for (const rel of schema.get(name)!.relations) {
        if (owner.has(rel.target) && !rel.optional && rel.onDelete !== 'Cascade') {
          blockers.push(`${name}.${rel.field} -> ${rel.target}`);
        }
      }
    }
    expect(blockers).toEqual([]);
  });
});

describe('reset dependency helpers', () => {
  it('reports unselected collections that block a reset', () => {
    expect(getMissingResetDependencies(['transactions'])).toEqual([
      { collection: 'transactions', missing: ['payments', 'kitchenTickets'] },
    ]);
    expect(getMissingResetDependencies(['transactions', 'payments', 'kitchenTickets'])).toEqual([]);
    expect(getMissingResetDependencies(['payments'])).toEqual([]);
  });

  it('adds required collections transitively', () => {
    const result = withResetDependencies(['suppliers']);
    expect(result).toEqual(expect.arrayContaining(['suppliers', 'purchaseOrders']));
    expect(getMissingResetDependencies(withResetDependencies(['products', 'branches', 'customers']))).toEqual([]);
  });
});
