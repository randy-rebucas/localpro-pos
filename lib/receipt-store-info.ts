import type { ITenantSettings } from '@/types/tenant';

type StoreSettings = Pick<
  ITenantSettings,
  'address' | 'phone' | 'email' | 'logo' | 'registrationNumber'
  | 'receiptShowLogo' | 'receiptShowAddress' | 'receiptShowPhone' | 'receiptShowEmail'
>;

export interface ReceiptStoreInfo {
  address?: string;
  phone?: string;
  email?: string;
  logo?: string;
  registrationNumber?: string;
}

/**
 * The store details printed at the top of a receipt, following the receipt toggles in Settings.
 * An unset toggle keeps the old behaviour: logo, address and phone print, email does not.
 */
export function receiptStoreInfo(settings: Partial<StoreSettings> | null | undefined): ReceiptStoreInfo {
  if (!settings) return {};
  const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  const a = settings.address;
  const address = a
    ? clean([a.street, a.city, a.state, a.zipCode].map(clean).filter(Boolean).join(', '))
    : undefined;
  return {
    address: settings.receiptShowAddress !== false ? address : undefined,
    phone: settings.receiptShowPhone !== false ? clean(settings.phone) : undefined,
    email: settings.receiptShowEmail === true ? clean(settings.email) : undefined,
    logo: settings.receiptShowLogo !== false ? clean(settings.logo) : undefined,
    registrationNumber: clean(settings.registrationNumber),
  };
}
