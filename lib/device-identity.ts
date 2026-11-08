/**
 * Client-side "which physical device is this browser" identity, used to tag
 * transactions with a registered Device (see models/Device.ts) for BIR
 * multi-terminal/BYOD compliance. Each browser/terminal is assigned a device
 * once via the admin Devices page; the assignment is local to that
 * browser (not synced across devices), matching how a physical terminal's
 * identity is a property of that specific machine.
 */
const storageKey = (tenant: string) => `pos_device_id_${tenant}`;

export function getAssignedDeviceId(tenant: string): string | null {
  if (typeof window === 'undefined') return null;
  // Storage can be blocked (private mode, site data off); treat that as "not assigned".
  try {
    return localStorage.getItem(storageKey(tenant));
  } catch {
    return null;
  }
}

export function setAssignedDeviceId(tenant: string, deviceId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (deviceId) {
      localStorage.setItem(storageKey(tenant), deviceId);
    } else {
      localStorage.removeItem(storageKey(tenant));
    }
  } catch {
    // Storage blocked: the assignment simply does not persist.
  }
}
