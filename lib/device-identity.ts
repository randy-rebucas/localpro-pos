/**
 * Client-side "which physical device is this browser" identity, used to tag
 * transactions with a registered Device (see models/Device.ts) for BIR
 * multi-terminal/BYOD compliance. Each browser/terminal is assigned a device
 * once via the Hardware Settings page; the assignment is local to that
 * browser (not synced across devices), matching how a physical terminal's
 * identity is a property of that specific machine.
 */
const storageKey = (tenant: string) => `pos_device_id_${tenant}`;

export function getAssignedDeviceId(tenant: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(storageKey(tenant));
}

export function setAssignedDeviceId(tenant: string, deviceId: string | null): void {
  if (typeof window === 'undefined') return;
  if (deviceId) {
    localStorage.setItem(storageKey(tenant), deviceId);
  } else {
    localStorage.removeItem(storageKey(tenant));
  }
}
