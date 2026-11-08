'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Check, Lock, RotateCcw } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { useConfirm } from '@/lib/confirm';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { DARK_KEY, DARK_KEY_PRIMARY, ICON, LedReadout, RegisterPage, ROW_KEY, Strip } from '@/components/admin/register-ui';
import { getDictionaryClient } from '../../dictionaries-client';
import {
  PERMISSIONS,
  PERMISSION_SECTIONS,
  OVERRIDABLE_ROLES,
  canEditRoleOverrides,
  hasPermission,
  roleAtLeast,
  type OverridableRole,
  type PermissionDef,
  type RolePermissionOverrides,
} from '@/lib/permissions';

type Dict = Record<string, Record<string, string | undefined> | undefined>;

/** Dictionary key for a permission's label, e.g. `perm_cash_drawer_close`. */
const permKey = (key: string) => `perm_${key.replace(/\./g, '_')}`;

/** Compliance screens that belong to one business type, e.g. `pharmacy_compliance.manage`. */
const TYPE_COMPLIANCE = /^(restaurant|retail|laundry|service|pharmacy)_compliance\./;

/** Cells whose stored override differs between two sets. */
const countChanges = (a: RolePermissionOverrides, b: RolePermissionOverrides) => {
  let n = 0;
  for (const role of OVERRIDABLE_ROLES) {
    for (const p of PERMISSIONS) if (a[role]?.[p.key] !== b[role]?.[p.key]) n++;
  }
  return n;
};

export default function RolesPermissionsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { canAccess } = usePermissions();
  const { user } = useAuth();
  const { settings: tenantSettings, applySettings } = useTenantSettings();
  const editorRole = user?.role;
  const canManage = canAccess('roles_permissions.manage');
  const { confirm, Dialog: ConfirmDialog } = useConfirm();
  const [dict, setDict] = useState<Dict | null>(null);

  const [overrides, setOverrides] = useState<RolePermissionOverrides>({});
  const [saved, setSaved] = useState<RolePermissionOverrides>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    getDictionaryClient(lang).then((d) => setDict(d as unknown as Dict));
  }, [lang]);

  // Read the dictionary through a ref so its arrival does not refetch and overwrite unsaved changes.
  const dictRef = useRef(dict);
  useEffect(() => { dictRef.current = dict; }, [dict]);

  const a = (key: string, fallback: string) => dict?.admin?.[key] || fallback;

  const fetchOverrides = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/tenants/${tenant}/role-permissions`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const next = data.data.overrides || {};
        setOverrides(next);
        setSaved(next);
      } else {
        setLoadError(dictRef.current?.admin?.failedToLoadRolePermissions || 'Failed to load role permissions');
      }
    } catch {
      setLoadError(dictRef.current?.admin?.failedToLoadRolePermissionsConnection || 'Failed to load role permissions. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    // Without the permission the route answers 403; the page shows the restriction instead.
    if (canManage) fetchOverrides();
    else setLoading(false);
  }, [fetchOverrides, canManage]);

  const roleLabel = (role: OverridableRole) =>
    ({
      viewer: a('roleLabelViewer', 'Viewer'),
      cashier: a('roleLabelCashier', 'Cashier'),
      manager: a('roleLabelManager', 'Manager'),
    })[role];
  const permLabel = (p: PermissionDef) => a(permKey(p.key), p.label);
  const sectionLabel = (s: string) => a(`permSection_${s}`, PERMISSION_SECTIONS[s] || s);

  const isOn = (role: OverridableRole, p: PermissionDef) => hasPermission(role, p.key, overrides);
  const isCustom = (role: OverridableRole, key: string) => typeof overrides[role]?.[key] === 'boolean';
  /** Why this cell cannot be pressed, or null when it can. */
  const lockReason = (role: OverridableRole, p: PermissionDef): string | null => {
    if (!canEditRoleOverrides(editorRole, role)) return a('rpLockedRank', 'Only an admin or owner can change your own role or roles above it.');
    if (!isOn(role, p) && !hasPermission(role, p.key, saved) && !hasPermission(editorRole, p.key, saved)) return a('rpLockedGrant', 'You can only hand out access you have yourself.');
    return null;
  };

  const setCell = (role: OverridableRole, p: PermissionDef, value: boolean) => {
    setSaveError('');
    setOverrides((prev) => {
      const roleOverrides = { ...(prev[role] || {}) };
      // Back on the default: store nothing, so later default changes still reach this role.
      if (value === roleAtLeast(role, p.defaultMinRole)) delete roleOverrides[p.key];
      else roleOverrides[p.key] = value;
      return { ...prev, [role]: roleOverrides };
    });
  };

  const resetRow = (p: PermissionDef) => {
    setSaveError('');
    setOverrides((prev) => {
      const next = { ...prev };
      for (const role of OVERRIDABLE_ROLES) {
        if (!canEditRoleOverrides(editorRole, role) || !next[role]) continue;
        const roleOverrides = { ...next[role] };
        delete roleOverrides[p.key];
        next[role] = roleOverrides;
      }
      return next;
    });
  };

  const customCount = useMemo(
    () => OVERRIDABLE_ROLES.reduce((n, role) => n + Object.keys(overrides[role] || {}).filter((k) => PERMISSIONS.some((p) => p.key === k)).length, 0),
    [overrides]
  );
  const changeCount = countChanges(overrides, saved);
  const dirty = changeCount > 0;
  const editableCustom = OVERRIDABLE_ROLES.some((role) => canEditRoleOverrides(editorRole, role) && Object.keys(overrides[role] || {}).length > 0);

  const resetAll = async () => {
    const ok = await confirm(
      a('rpResetAllTitle', 'Back to the default access?'),
      a('rpResetAllMessage', 'Every custom cell you can change goes back to the default for its role. Nothing is saved until you press Save.'),
      { confirmText: a('rpResetAllConfirm', 'Reset'), cancelText: dict?.common?.cancel || 'Cancel', variant: 'warning' }
    );
    if (!ok) return;
    setSaveError('');
    setOverrides((prev) => {
      const next: RolePermissionOverrides = {};
      for (const role of OVERRIDABLE_ROLES) if (!canEditRoleOverrides(editorRole, role) && prev[role]) next[role] = prev[role];
      return next;
    });
  };

  const handleSave = async () => {
    if (saving || !dirty) return;
    setSaveError('');
    // Granting an admin-only permission to staff deserves a second look.
    const raised = OVERRIDABLE_ROLES.flatMap((role) =>
      PERMISSIONS.filter((p) => p.defaultMinRole === 'admin' || p.defaultMinRole === 'owner')
        .filter((p) => hasPermission(role, p.key, overrides) && !hasPermission(role, p.key, saved))
        .map((p) => `${roleLabel(role)}: ${permLabel(p)}`)
    );
    if (raised.length > 0) {
      const ok = await confirm(
        a('rpGrantAdminTitle', 'Give staff admin-only access?'),
        `${raised.join('\n')}\n\n${a('rpGrantAdminMessage', 'These are normally kept for admins and owners. Everyone with the role gets them the next time a page loads.')}`,
        { confirmText: a('rpGrantAdminConfirm', 'Give access'), cancelText: dict?.common?.cancel || 'Cancel', variant: 'warning' }
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenant}/role-permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ overrides }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const next = data.data.overrides || {};
        setOverrides(next);
        setSaved(next);
        // The sidebar and page gates read overrides from the tenant settings context.
        applySettings({ rolePermissionOverrides: next });
        toast.success(a('rolePermissionsSaved', 'Role permissions saved successfully'));
      } else {
        const text =
          data.code === 'forbidden_change'
            ? a('rpForbiddenChange', 'You can only change roles below your own and hand out access you have yourself.')
            : res.status === 429
              ? a('rpTooManyRequests', 'Too many saves in a row. Wait a minute and try again.')
              : a('failedToSaveRolePermissions', 'Failed to save role permissions');
        setSaveError(text);
        toast.error(text);
      }
    } catch {
      const text = a('failedToSaveRolePermissionsConnection', 'Failed to save role permissions. Please check your connection.');
      setSaveError(text);
      toast.error(text);
    } finally {
      setSaving(false);
    }
  };

  // Each business type has its own compliance screen; only this store's one (or one already customised) is worth a row.
  const businessType = tenantSettings?.businessType;
  const visiblePerms = PERMISSIONS.filter((p) => {
    const type = TYPE_COMPLIANCE.exec(p.key)?.[1];
    if (!type || type === businessType) return true;
    return OVERRIDABLE_ROLES.some((role) => typeof overrides[role]?.[p.key] === 'boolean');
  });
  const sections = Array.from(new Set(visiblePerms.map((p) => p.section)));
  const sectionNo = (i: number) => String(i + 1).padStart(2, '0');
  const sectionCustom = (section: string) =>
    visiblePerms.filter((p) => p.section === section).reduce((n, p) => n + OVERRIDABLE_ROLES.filter((role) => isCustom(role, p.key)).length, 0);

  // Show the spinner only for the first load, so refetches keep the page mounted.
  const [loadedOnce, setLoadedOnce] = useState(false);
  if (!loading && !loadedOnce) setLoadedOnce(true);

  if (!dict || !loadedOnce) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const header = {
    tagNo: 'RP',
    tag: tenantSettings?.companyName,
    title: a('rolesPermissionsTitle', 'Roles & Permissions'),
  };

  if (!canManage) {
    return (
      <RegisterPage {...header}>
        <div className="mt-6">
          <Strip tone="error">
            <strong className="block font-semibold">{a('accessRestricted', 'Access Restricted')}</strong>
            {a('accessRestrictedRolesPermissions', "You don't have permission to manage roles and permissions. Contact an admin or owner.")}
          </Strip>
        </div>
      </RegisterPage>
    );
  }

  const GRID = 'grid grid-cols-[minmax(0,1fr)_repeat(3,3rem)_2.75rem] items-center gap-x-1 sm:grid-cols-[minmax(0,1fr)_repeat(3,6.5rem)_2.75rem] sm:gap-x-2';

  return (
    <RegisterPage
      {...header}
      subtitle={a('rpSubtitle', 'Which screens viewers, cashiers and managers can open. Owners and admins always have every key.')}
      side={<LedReadout value={customCount} label={a('rpCustomCount', 'Custom')} />}
    >
      {ConfirmDialog}

      {loadError ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1"><Strip tone="error">{loadError}</Strip></div>
          <button type="button" onClick={fetchOverrides} className={DARK_KEY}>
            <RotateCcw className={ICON} strokeWidth={1.75} aria-hidden />
            {dict?.common?.retry || 'Retry'}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-receipt text-xs uppercase tracking-[0.08em] text-paper/70">
            <span className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center border border-paper-white/70 bg-ink text-paper-white"><Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /></span>
              {a('rpLegendOn', 'Can open')}
            </span>
            <span className="flex items-center gap-2">
              <span className="h-5 w-5 border border-ink/40 bg-white" />
              {a('rpLegendOff', 'Cannot')}
            </span>
            <span className="flex items-center gap-2">
              <span className="relative h-5 w-5 border border-ink/40 bg-white"><span className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 bg-stamp" /></span>
              {a('rpLegendCustom', 'Changed from default')}
            </span>
            {editableCustom && (
              <button type="button" onClick={resetAll} disabled={saving} className={`${DARK_KEY} ml-auto`}>
                <RotateCcw className={ICON} strokeWidth={1.75} aria-hidden />
                {a('rpResetAll', 'All back to default')}
              </button>
            )}
          </div>

          <nav aria-label={a('rpSectionsNav', 'Sections')} className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            {sections.map((section, i) => {
              const n = sectionCustom(section);
              return (
                <a key={section} href={`#rp-${section}`} className={`${DARK_KEY} shrink-0 whitespace-nowrap px-3`}>
                  <span className="text-[#8fe3d0]">{sectionNo(i)}</span>
                  {sectionLabel(section)}
                  {n > 0 && <span className="bg-stamp px-1.5 text-paper-white" title={a('rpCustomCount', 'Custom')}>{n}</span>}
                </a>
              );
            })}
          </nav>

          {!roleAtLeast(editorRole, 'admin') && (
            <div className="mt-4"><Strip tone="ok">{a('rpManagerNote', 'You can change roles below your own and hand out access you have. An admin or owner can change the rest.')}</Strip></div>
          )}

          <div className="mt-6 bg-paper-white text-ink">
            <div className={`${GRID} sticky top-14 z-[1] lg:top-0 border-b-4 border-ink bg-paper-white px-3 py-3 sm:px-5`}>
              <span className="font-receipt text-xs uppercase tracking-[0.08em] text-ink/60">{a('featureCol', 'Feature')}</span>
              {OVERRIDABLE_ROLES.map((role) => (
                <span key={role} className="truncate text-center font-display text-base font-bold uppercase leading-none sm:text-2xl" title={roleLabel(role)}>
                  {roleLabel(role)}
                </span>
              ))}
              <span aria-hidden />
            </div>
            {sections.map((section, i) => {
              const n = sectionCustom(section);
              return (
              <Fragment key={section}>
                <h3
                  id={`rp-${section}`}
                  className="flex scroll-mt-32 items-baseline gap-3 border-b border-dashed border-ink/25 bg-paper px-3 pb-2 pt-4 sm:px-5 lg:scroll-mt-20"
                >
                  <span className="font-receipt text-xs font-semibold text-brand-hover">{sectionNo(i)}</span>
                  <span className="font-display text-xl font-bold uppercase leading-none tracking-wide sm:text-2xl">{sectionLabel(section)}</span>
                  {n > 0 && (
                    <span className="ml-auto font-receipt text-xs uppercase tracking-[0.08em] text-stamp">
                      {a('rpSectionCustom', '{n} custom').replace('{n}', String(n))}
                    </span>
                  )}
                </h3>
                <ul className="divide-y divide-dashed divide-ink/20">
                  {visiblePerms.filter((p) => p.section === section).map((p) => {
                    const label = permLabel(p);
                    const rowCustom = OVERRIDABLE_ROLES.some((role) => isCustom(role, p.key) && canEditRoleOverrides(editorRole, role));
                    return (
                      <li key={p.key} className={`${GRID} px-3 py-1 sm:px-5`}>
                        <span className="py-2 text-sm leading-snug">{label}</span>
                        {OVERRIDABLE_ROLES.map((role) => {
                          const on = isOn(role, p);
                          const custom = isCustom(role, p.key);
                          const locked = lockReason(role, p);
                          return (
                            <div key={role} className="flex justify-center">
                              <button
                                type="button"
                                aria-pressed={on}
                                aria-label={`${roleLabel(role)}: ${label}`}
                                title={locked || (custom ? a('rpCustomTitle', 'Changed from default') : undefined)}
                                disabled={!!locked || saving}
                                onClick={() => setCell(role, p, !on)}
                                className={`group flex h-11 w-11 items-center justify-center touch-manipulation disabled:cursor-not-allowed ${locked ? 'opacity-45' : ''}`}
                              >
                                {/* A 20px box like the checkboxes on the other admin pages; the button keeps a 44px tap area. */}
                                <span
                                  className={`relative flex h-5 w-5 items-center justify-center border transition-colors ${
                                    on ? 'border-ink bg-ink text-paper-white' : 'border-ink/40 bg-white text-ink/50 group-enabled:group-hover:border-ink'
                                  }`}
                                >
                                  {locked && !on ? (
                                    <Lock className="h-3 w-3" strokeWidth={2} aria-hidden />
                                  ) : on ? (
                                    <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                                  ) : null}
                                  {custom && (
                                    <span aria-hidden className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 bg-stamp" />
                                  )}
                                </span>
                              </button>
                            </div>
                          );
                        })}
                        {rowCustom ? (
                          <button
                            type="button"
                            onClick={() => resetRow(p)}
                            disabled={saving}
                            className={ROW_KEY}
                            aria-label={a('rpResetRow', 'Reset {name} to default').replace('{name}', label)}
                            title={a('resetToDefaultTitle', 'Reset to default')}
                          >
                            <RotateCcw className={ICON} strokeWidth={1.75} aria-hidden />
                          </button>
                        ) : (
                          <span aria-hidden />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Fragment>
              );
            })}
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />

          <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-white/10 bg-brand-navy-deep/95 px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            {saveError ? (
              <div className="mr-auto min-w-0 flex-1"><Strip tone="error">{saveError}</Strip></div>
            ) : (
              dirty && (
                <span className="mr-auto font-receipt text-xs uppercase tracking-[0.08em] text-[#8fe3d0]">
                  {a('rpUnsavedCount', '{n} not saved').replace('{n}', String(changeCount))}
                </span>
              )
            )}
            {dirty && (
              <button type="button" onClick={() => { setOverrides(saved); setSaveError(''); }} disabled={saving} className={DARK_KEY}>
                {a('rpUndo', 'Undo')}
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className={`${DARK_KEY_PRIMARY} disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand`}
            >
              {saving ? dict?.common?.saving || 'Saving...' : a('saveChanges', 'Save Changes')}
            </button>
          </div>
        </>
      )}
    </RegisterPage>
  );
}
