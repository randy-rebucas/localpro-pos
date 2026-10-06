/* eslint-disable @typescript-eslint/no-explicit-any */
import type { HardwareConfig } from '@/lib/hardware';

export const hardwareConfigStorageKey = (tenant: string) => `hardware_config_${tenant}`;

export const isEmptyHardwareConfig = (config?: HardwareConfig | null): boolean =>
  !config || Object.keys(config).length === 0;

/** This browser's cached config (written by the admin Hardware page / settings modal), or null. */
export function readLocalHardwareConfig(tenant: string): HardwareConfig | null {
  try {
    const raw = localStorage.getItem(hardwareConfigStorageKey(tenant));
    return raw ? (JSON.parse(raw) as HardwareConfig) : null;
  } catch {
    return null;
  }
}

/**
 * Which hardware config a terminal should run with. The tenant-level config
 * saved on the admin Hardware page wins whenever one exists, so a save there
 * reaches every terminal; only `cashDrawer.direct` (per-device USB/serial
 * pairing, never stored server-side) is kept from this browser. Falls back to
 * the browser cache only when nothing has been saved server-side yet.
 */
export function resolveHardwareConfig(
  server?: HardwareConfig | null,
  local?: HardwareConfig | null
): HardwareConfig {
  if (isEmptyHardwareConfig(server)) return local ?? {};
  const resolved: HardwareConfig = { ...server };
  const localDirect = local?.cashDrawer?.direct;
  if (resolved.cashDrawer && !resolved.cashDrawer.direct && localDirect) {
    resolved.cashDrawer = { ...resolved.cashDrawer, direct: localDirect };
  }
  return resolved;
}

export const getSaveSuccessMessage = (dict: any): string => {
  return dict?.admin?.hardwareSettingsSavedSuccess || 'Hardware settings saved successfully!';
};

export const getSaveErrorMessage = (dict: any, statusCode?: number): string => {
  if (statusCode === 401 || statusCode === 403) {
    return dict?.settings?.unauthorized || 'Unauthorized. Please login with admin account.';
  }
  return dict?.admin?.failedToSaveHardwareSettings || 'Failed to save hardware settings';
};

export const getConnectionErrorMessage = (dict: any): string => {
  return (
    dict?.admin?.failedToSaveHardwareSettingsConnection ||
    'Failed to save hardware settings. Please check your connection.'
  );
};

export const getLoadErrorMessage = (dict: any): string => {
  return dict?.admin?.failedToLoadSettings || 'Unable to load tenant settings. Please check your connection and try again.';
};

export const getLoadConnectionErrorMessage = (dict: any): string => {
  return dict?.admin?.failedToLoadSettingsConnection || 'Failed to load settings. Please check your connection.';
};
