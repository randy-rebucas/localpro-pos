import { describe, it, expect } from 'vitest';
import { PERMISSIONS, PERMISSION_FEATURES, PERMISSION_SECTIONS } from '@/lib/permissions';
import en from '@/app/[tenant]/[lang]/dictionaries/en.json';
import es from '@/app/[tenant]/[lang]/dictionaries/es.json';

// The roles & permissions tree reads names from dict.permissions.{sections,features,actions}
// and only falls back to the English in lib/permissions.ts. Adding a feature or
// action without its dictionary entries would silently show English on the Spanish site.
type PermissionDict = { sections?: Record<string, string>; features?: Record<string, string>; actions?: Record<string, string> };

describe.each([
  ['en', en],
  ['es', es],
] as const)('%s dictionary permissions section', (_lang, dict) => {
  const permissions = (dict as unknown as { permissions?: PermissionDict }).permissions;
  const featureIds = PERMISSION_FEATURES.map((f) => f.id);
  const actionIds = [...new Set(PERMISSIONS.map((p) => p.action))];

  it('names every permission section', () => {
    const missing = Object.keys(PERMISSION_SECTIONS).filter((s) => !permissions?.sections?.[s]?.trim());
    expect(missing).toEqual([]);
  });

  it('names every feature', () => {
    expect(featureIds.filter((id) => !permissions?.features?.[id]?.trim())).toEqual([]);
  });

  it('names every action used by a feature', () => {
    expect(actionIds.filter((a) => !permissions?.actions?.[a]?.trim())).toEqual([]);
  });

  it('has no stale feature or action names', () => {
    expect(Object.keys(permissions?.features || {}).filter((id) => !featureIds.includes(id))).toEqual([]);
    expect(Object.keys(permissions?.actions || {}).filter((a) => !actionIds.includes(a))).toEqual([]);
  });
});
