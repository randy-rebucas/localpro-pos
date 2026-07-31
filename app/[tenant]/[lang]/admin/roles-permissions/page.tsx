'use client';

import { Fragment, useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { usePermissions } from '@/hooks/usePermissions';
import {
  PERMISSIONS,
  PERMISSION_SECTIONS,
  OVERRIDABLE_ROLES,
  roleAtLeast,
  type OverridableRole,
  type RolePermissionOverrides,
} from '@/lib/permissions';

const ROLE_LABEL: Record<OverridableRole, string> = {
  viewer: 'Viewer',
  cashier: 'Cashier',
  manager: 'Manager',
};

export default function RolesPermissionsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const { canAccess } = usePermissions();
  const canManage = canAccess('roles_permissions.manage');

  const [overrides, setOverrides] = useState<RolePermissionOverrides>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  const fetchOverrides = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tenants/${tenant}/role-permissions`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setOverrides(data.data.overrides || {});
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to load role permissions' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to load role permissions. Please check your connection.' });
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    fetchOverrides();
  }, [fetchOverrides]);

  const isChecked = (role: OverridableRole, key: string, defaultMinRole: string) => {
    const override = overrides[role]?.[key];
    if (typeof override === 'boolean') return override;
    return roleAtLeast(role, defaultMinRole);
  };

  const isOverridden = (role: OverridableRole, key: string) =>
    typeof overrides[role]?.[key] === 'boolean';

  const toggle = (role: OverridableRole, key: string, defaultMinRole: string) => {
    const current = isChecked(role, key, defaultMinRole);
    setOverrides((prev) => ({
      ...prev,
      [role]: { ...prev[role], [key]: !current },
    }));
    setDirty(true);
  };

  const resetToDefault = (role: OverridableRole, key: string) => {
    setOverrides((prev) => {
      const roleOverrides = { ...(prev[role] || {}) };
      delete roleOverrides[key];
      return { ...prev, [role]: roleOverrides };
    });
    setDirty(true);
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
        setMessage({ type: 'success', text: 'Role permissions saved successfully' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save role permissions' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save role permissions. Please check your connection.' });
    } finally {
      setSaving(false);
    }
  };

  const sections = Array.from(new Set(PERMISSIONS.map((p) => p.section)));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <div className="bg-red-50 border-2 border-red-300 p-6">
          <h2 className="text-lg font-bold text-red-800 mb-1">Access Restricted</h2>
          <p className="text-sm text-red-700">
            You don&apos;t have permission to manage roles and permissions. Contact an admin or owner.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 sm:px-6 py-6">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Roles & Permissions</h1>
          <p className="text-gray-600">
            Control which features viewer, cashier, and manager accounts can access. Owner, admin, and
            super admin accounts always have full access and cannot be restricted.
          </p>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 border ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border-green-300'
                : 'bg-red-50 text-red-800 border-red-300'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="mb-6 p-4 bg-brand-soft border-2 border-teal-300">
          <p className="text-sm text-brand-navy">
            Checked = that role can access the feature. Unchecked cells that differ from the default are
            marked <span className="font-semibold">(custom)</span> — click the small reset link to revert
            to the default for that role.
          </p>
        </div>

        <div className="bg-white border border-gray-300 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Feature
                </th>
                {OVERRIDABLE_ROLES.map((role) => (
                  <th
                    key={role}
                    className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                  >
                    {ROLE_LABEL[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {sections.map((section) => (
                <Fragment key={section}>
                  <tr className="bg-gray-50">
                    <td
                      colSpan={1 + OVERRIDABLE_ROLES.length}
                      className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide"
                    >
                      {PERMISSION_SECTIONS[section] || section}
                    </td>
                  </tr>
                  {PERMISSIONS.filter((p) => p.section === section).map((perm) => (
                    <tr key={perm.key} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{perm.label}</td>
                      {OVERRIDABLE_ROLES.map((role) => {
                        const checked = isChecked(role, perm.key, perm.defaultMinRole);
                        const overridden = isOverridden(role, perm.key);
                        return (
                          <td key={role} className="px-4 py-3 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <input
                                type="checkbox"
                                className="checkbox-win8 h-4 w-4 cursor-pointer"
                                checked={checked}
                                onChange={() => toggle(role, perm.key, perm.defaultMinRole)}
                              />
                              {overridden && (
                                <button
                                  type="button"
                                  onClick={() => resetToDefault(role, perm.key)}
                                  className="text-[10px] text-brand hover:text-brand-hover"
                                  title="Reset to default"
                                >
                                  (custom)
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-6 mt-8 border-t border-gray-200">
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="px-6 py-3 bg-brand text-white hover:bg-brand-hover font-semibold transition-all duration-200 border border-brand-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin h-5 w-5 border-b-2 border-white"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
