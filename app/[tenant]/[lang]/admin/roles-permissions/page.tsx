'use client';

import { Fragment, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { usePermissions } from '@/hooks/usePermissions';
import { getDictionaryClient } from '../../dictionaries-client';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import {
  PERMISSION_FEATURES,
  PERMISSION_SECTIONS,
  PERMISSION_ACTIONS,
  OVERRIDABLE_ROLES,
  defaultPermission,
  type OverridableRole,
  type PermissionDef,
  type PermissionFeature,
  type RolePermissionOverrides,
} from '@/lib/permissions';

const SECTIONS = Array.from(new Set(PERMISSION_FEATURES.map((f) => f.section)));

/** Native checkbox with the indeterminate state (only settable via the DOM). */
function TriStateCheckbox({
  checked,
  indeterminate,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { indeterminate: boolean; 'data-custom'?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} {...rest} />;
}

export default function RolesPermissionsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { canAccess } = usePermissions();
  const canManage = canAccess('roles_permissions.manage');
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const ROLE_LABEL: Record<OverridableRole, string> = {
    viewer: dict?.admin?.roleLabelViewer || 'Viewer',
    cashier: dict?.admin?.roleLabelCashier || 'Cashier',
    manager: dict?.admin?.roleLabelManager || 'Manager',
  };

  const [overrides, setOverrides] = useState<RolePermissionOverrides>({});
  const [loading, setLoading] = useState(true);
  // Kept separate from `message`: when the load fails we must not render the
  // matrix, or Save would PUT an empty override set over the tenant's real one.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  // Read through a ref so the dictionary arriving doesn't recreate
  // fetchOverrides — that used to refetch and flash the spinner (dropping any
  // edits made in between) every time the page loaded.
  const dictRef = useRef(dict);
  useEffect(() => {
    dictRef.current = dict;
  }, [dict]);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const fetchOverrides = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/tenants/${tenant}/role-permissions`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setOverrides(data.data.overrides || {});
        setDirty(false);
      } else {
        setLoadError(data.error || dictRef.current?.admin?.failedToLoadRolePermissions || 'Failed to load role permissions');
      }
    } catch {
      setLoadError(dictRef.current?.admin?.failedToLoadRolePermissionsConnection || 'Failed to load role permissions. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    fetchOverrides();
  }, [fetchOverrides]);

  // Overrides from the API are already expressed in current action keys (see
  // normalizeOverrides), so a cell is: locked → always on, else override, else default.
  const isChecked = (role: OverridableRole, def: PermissionDef) => {
    if (def.locked) return true;
    const override = overrides[role]?.[def.key];
    return typeof override === 'boolean' ? override : defaultPermission(role, def);
  };

  const isOverridden = (role: OverridableRole, def: PermissionDef) =>
    !def.locked && typeof overrides[role]?.[def.key] === 'boolean';

  /**
   * Apply several cell changes for one role at once. A value equal to the
   * role's default drops the override instead of storing a redundant one, so
   * the cell stops being marked custom.
   */
  const applyChanges = (role: OverridableRole, changes: Array<[PermissionDef, boolean]>) => {
    setOverrides((prev) => {
      const roleOverrides = { ...(prev[role] || {}) };
      for (const [def, value] of changes) {
        if (def.locked) continue;
        if (value === defaultPermission(role, def)) delete roleOverrides[def.key];
        else roleOverrides[def.key] = value;
      }
      return { ...prev, [role]: roleOverrides };
    });
    setDirty(true);
  };

  const editable = (feature: PermissionFeature) => feature.actions.filter((a) => !a.locked);
  const viewAction = (feature: PermissionFeature) => feature.actions.find((a) => a.action === 'view' && !a.locked);

  /**
   * Toggle one action. Keeps each feature consistent: revoking View revokes the
   * feature's other actions (they're useless without seeing the data), and
   * granting any other action grants View.
   */
  const toggleAction = (role: OverridableRole, feature: PermissionFeature, def: PermissionDef) => {
    const next = !isChecked(role, def);
    const changes: Array<[PermissionDef, boolean]> = [[def, next]];
    const view = viewAction(feature);
    if (def.action === 'view' && !next) {
      for (const other of editable(feature)) if (other !== def) changes.push([other, false]);
    } else if (def.action !== 'view' && next && view && !isChecked(role, view)) {
      changes.push([view, true]);
    }
    applyChanges(role, changes);
  };

  /** Feature checkbox: grant every action, or — when all are already granted — revoke them all. */
  const toggleFeature = (role: OverridableRole, feature: PermissionFeature) => {
    const actions = editable(feature);
    const allOn = actions.every((a) => isChecked(role, a));
    applyChanges(role, actions.map((a) => [a, !allOn] as [PermissionDef, boolean]));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tenants/${tenant}/role-permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ overrides }),
      });
      const data = await res.json();
      if (data.success) {
        setOverrides(data.data.overrides || {});
        setDirty(false);
        setMessage({ type: 'success', text: dict?.admin?.rolePermissionsSaved || 'Role permissions saved successfully' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: data.error || dict?.admin?.failedToSaveRolePermissions || 'Failed to save role permissions' });
      }
    } catch {
      setMessage({ type: 'error', text: dict?.admin?.failedToSaveRolePermissionsConnection || 'Failed to save role permissions. Please check your connection.' });
    } finally {
      setSaving(false);
    }
  };

  // Dictionary first, then the English in lib/permissions.ts, so a newly added
  // feature/action still shows a name before its translation lands.
  const featureLabel = (feature: PermissionFeature) => dict?.permissions?.features?.[feature.id] || feature.label;
  const actionLabel = (def: PermissionDef) =>
    dict?.permissions?.actions?.[def.action] || PERMISSION_ACTIONS[def.action] || def.action;
  const sectionLabel = (section: string) =>
    dict?.permissions?.sections?.[section] || PERMISSION_SECTIONS[section] || section;
  const customSuffix = dict?.admin?.customLabel || '(custom)';
  const cellLabel = (role: OverridableRole, text: string) =>
    (dict?.admin?.rolePermissionCellLabel || '{role}: {feature}').replace('{role}', ROLE_LABEL[role]).replace('{feature}', text);

  const query = search.trim().toLowerCase();
  const visibleFeatures = useMemo(() => {
    if (!query) return PERMISSION_FEATURES;
    return PERMISSION_FEATURES.filter((f) => {
      const names = [
        dict?.permissions?.features?.[f.id] || f.label,
        ...f.actions.map((a) => dict?.permissions?.actions?.[a.action] || PERMISSION_ACTIONS[a.action] || a.action),
      ];
      return names.some((n) => String(n).toLowerCase().includes(query));
    });
  }, [query, dict]);

  const multiActionIds = PERMISSION_FEATURES.filter((f) => f.actions.length > 1).map((f) => f.id);
  const isExpanded = (feature: PermissionFeature) => Boolean(query) || expanded.has(feature.id);
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const overrideCount = OVERRIDABLE_ROLES.reduce(
    (sum, role) => sum + Object.values(overrides[role] || {}).filter((v) => typeof v === 'boolean').length,
    0
  );

  if (!dict || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict?.admin?.loadingRolePermissions || 'Loading role permissions…'}</p>
        </div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <div role="alert" className="bg-white border border-win8-danger p-6">
          <h2 className="text-base font-bold text-win8-danger">{dict?.admin?.accessRestricted || 'Access Restricted'}</h2>
          <p className="mt-1 text-sm text-gray-700">
            {dict?.admin?.accessRestrictedRolesPermissions || "You don't have permission to manage roles and permissions. Contact an admin or owner."}
          </p>
        </div>
      </div>
    );
  }

  const lockedTitle = dict?.admin?.permissionAlwaysAllowed || 'Always allowed — the POS needs this to sell.';
  const customTitle = dict?.admin?.customOverrideTitle || "Custom — differs from this role's default. Click to restore the default.";

  /** One action checkbox cell. */
  const actionCell = (role: OverridableRole, feature: PermissionFeature, def: PermissionDef, name: string) => {
    const overridden = isOverridden(role, def);
    return (
      <td key={role} className="px-4 py-2 text-center">
        {/* data-custom recolors the checkbox amber (globals.css); clicking it again restores the default. */}
        <input
          type="checkbox"
          className="checkbox-win8 cursor-pointer align-middle"
          checked={isChecked(role, def)}
          disabled={def.locked}
          data-custom={overridden ? 'true' : undefined}
          onChange={() => toggleAction(role, feature, def)}
          title={def.locked ? lockedTitle : overridden ? customTitle : undefined}
          aria-label={`${cellLabel(role, name)}${overridden ? ` ${customSuffix}` : ''}`}
        />
      </td>
    );
  };

  const renderFeature = (feature: PermissionFeature) => {
    const name = featureLabel(feature);

    // Single-action feature: one flat row, the action named beside the feature.
    if (feature.actions.length === 1) {
      const def = feature.actions[0];
      return (
        <tr key={feature.id} className="hover:bg-gray-100 transition-colors">
          <td className="px-4 py-2 text-gray-900">
            <span className="pl-7">{name}</span>
            <span className="ml-2 text-xs text-gray-400">{actionLabel(def)}</span>
          </td>
          {OVERRIDABLE_ROLES.map((role) => actionCell(role, feature, def, name))}
        </tr>
      );
    }

    const open = isExpanded(feature);
    const actions = editable(feature);
    const featureCustomCount = OVERRIDABLE_ROLES.reduce(
      (sum, role) => sum + actions.filter((a) => isOverridden(role, a)).length,
      0
    );
    const childrenId = `perm-${feature.id}-actions`;
    return (
      <Fragment key={feature.id}>
        <tr className="hover:bg-gray-100 transition-colors">
          <td className="px-4 py-2">
            <button
              type="button"
              onClick={() => toggleExpanded(feature.id)}
              aria-expanded={open}
              aria-controls={childrenId}
              className="inline-flex items-center gap-2 text-left text-gray-900 font-semibold hover:text-brand"
            >
              <svg
                className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
              </svg>
              {/* Explicit spaces: the parts are inline spans, so without them the
                  button's accessible name runs together ("Products5 actions"). */}
              {name}{' '}
              <span className="text-xs font-normal text-gray-400 tabular-nums">
                {(dict?.admin?.permissionActionsCount || '{count} actions').replace('{count}', String(feature.actions.length))}
              </span>{' '}
              {featureCustomCount > 0 && (
                <span className="px-1.5 py-0.5 text-xs font-semibold bg-win8-warning text-white tabular-nums">
                  {featureCustomCount}
                </span>
              )}
            </button>
          </td>
          {OVERRIDABLE_ROLES.map((role) => {
            const granted = actions.filter((a) => isChecked(role, a)).length;
            const anyCustom = actions.some((a) => isOverridden(role, a));
            return (
              <td key={role} className="px-4 py-2 text-center">
                <TriStateCheckbox
                  className="checkbox-win8 cursor-pointer align-middle"
                  checked={granted === actions.length}
                  indeterminate={granted > 0 && granted < actions.length}
                  data-custom={anyCustom ? 'true' : undefined}
                  onChange={() => toggleFeature(role, feature)}
                  aria-label={cellLabel(role, `${name} — ${dict?.admin?.allActions || 'all actions'}`)}
                />
              </td>
            );
          })}
        </tr>
        {open &&
          feature.actions.map((def, i) => (
            <tr key={def.key} id={i === 0 ? childrenId : undefined} className="bg-gray-50 hover:bg-gray-100 transition-colors">
              <td className="px-4 py-2 text-gray-700">
                <span className="pl-12 inline-flex items-center gap-2">
                  {actionLabel(def)}
                  {def.locked && (
                    <span className="px-1.5 py-0.5 text-xs font-semibold bg-gray-500 text-white" title={lockedTitle}>
                      {dict?.admin?.permissionLocked || 'Always on'}
                    </span>
                  )}
                </span>
              </td>
              {OVERRIDABLE_ROLES.map((role) => actionCell(role, feature, def, `${name} — ${actionLabel(def)}`))}
            </tr>
          ))}
      </Fragment>
    );
  };

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict?.admin?.rolesPermissionsTitle || 'Roles & Permissions'}
        description={dict?.admin?.rolesPermissionsDescription || 'Control which features viewer, cashier, and manager accounts can access. Owner, admin, and super admin accounts always have full access and cannot be restricted.'}
      />

      <div className="space-y-4">
        {loadError ? (
          <div className="text-center py-12 bg-white border border-gray-300 px-4">
            <p className="text-win8-danger text-sm font-medium">{loadError}</p>
            <button
              onClick={() => fetchOverrides()}
              className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
            >
              {dict?.common?.retry || 'Retry'}
            </button>
          </div>
        ) : (
          <>
            <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
              {dict?.admin?.rolesPermissionsCheckedBanner || "Expand a feature to grant its actions one by one; the feature's own checkbox grants or revokes them all. Amber boxes differ from the role's default — click one again to restore the default."}
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap bg-white border border-gray-300 p-3">
              <div className="relative">
                <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={dict?.admin?.searchPermissions || 'Search features or actions…'}
                  aria-label={dict?.admin?.searchPermissions || 'Search features or actions…'}
                  className="pl-8 pr-3 py-2 border border-gray-300 text-sm w-64"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setExpanded(new Set(multiActionIds))}
                  className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
                >
                  {dict?.admin?.expandAll || 'Expand all'}
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded(new Set())}
                  className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
                >
                  {dict?.admin?.collapseAll || 'Collapse all'}
                </button>
              </div>
            </div>

            <div className="border border-gray-300 bg-white">
              {visibleFeatures.length === 0 ? (
                <p className="text-center py-12 text-gray-400 text-sm">
                  {dict?.admin?.noPermissionsMatch || 'No features or actions match your search.'}
                </p>
              ) : (
                <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">{dict?.admin?.featureCol || 'Feature'}</th>
                        {OVERRIDABLE_ROLES.map((role) => (
                          <th key={role} className="px-4 py-3 text-center font-medium whitespace-nowrap w-32">
                            {ROLE_LABEL[role]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {SECTIONS.map((section) => {
                        const features = visibleFeatures.filter((f) => f.section === section);
                        if (features.length === 0) return null;
                        return (
                          <Fragment key={section}>
                            <tr className="bg-gray-100">
                              <td
                                colSpan={1 + OVERRIDABLE_ROLES.length}
                                className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                              >
                                {sectionLabel(section)}
                              </td>
                            </tr>
                            {features.map(renderFeature)}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="border-t border-gray-300 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap text-sm">
                  <span className="text-gray-500 tabular-nums">
                    {(dict?.admin?.customOverridesCount || '{count} custom override(s)').replace('{count}', overrideCount.toLocaleString())}
                  </span>
                  {message ? (
                    <span
                      role={message.type === 'error' ? 'alert' : 'status'}
                      className={`font-medium ${message.type === 'success' ? 'text-win8-success' : 'text-win8-danger'}`}
                    >
                      {message.text}
                    </span>
                  ) : dirty ? (
                    <span className="px-2 py-0.5 text-xs font-semibold bg-win8-warning text-white">
                      {dict?.admin?.unsavedChanges || 'Unsaved changes'}
                    </span>
                  ) : null}
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
                >
                  {saving ? (dict?.common?.saving || 'Saving…') : (dict?.admin?.saveChanges || 'Save Changes')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
