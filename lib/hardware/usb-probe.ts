/**
 * Shared WebUSB probe helpers for printer connect and device detection.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type USBDeviceLike = any;

export type UsbProbeStatus = 'ready' | 'os_driver_claimed' | 'error';

export interface UsbProbeResult {
  status: UsbProbeStatus;
  message?: string;
}

export function isUsbAccessDeniedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('access denied') ||
    message.includes('unable to claim') ||
    message.includes('claim interface')
  );
}

/** User dismissed the WebUSB / Serial device picker, or no device was selected. */
export function isDevicePickerCancelled(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'NotFoundError' || error.name === 'AbortError';
  }
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('no device selected') || message.includes('user cancelled');
}

/**
 * Try open/claim on a USB device, then always close. Does not keep the device open.
 */
export async function probeUsbDevice(device: USBDeviceLike): Promise<UsbProbeResult> {
  try {
    await device.open();
    if (device.configuration === null) {
      await device.selectConfiguration(1);
    }
    await device.claimInterface(0);
    try {
      await device.releaseInterface(0);
    } catch {
      /* ignore */
    }
    await device.close();
    return { status: 'ready' };
  } catch (error) {
    try {
      if (device.opened) {
        await device.close();
      }
    } catch {
      /* ignore */
    }
    if (isUsbAccessDeniedError(error)) {
      return {
        status: 'os_driver_claimed',
        message: 'Device is claimed by the OS printer driver',
      };
    }
    const message = error instanceof Error ? error.message : 'USB probe failed';
    return { status: 'error', message };
  }
}
