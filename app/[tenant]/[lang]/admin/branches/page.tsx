'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { MapPin, Pencil, Plus, Power, Store } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { ReceiptRow } from '@/components/marketing/primitives';
import {
  ICON, DARK_KEY_PRIMARY, HINT, INPUT, KEY, KEY_PRIMARY, LABEL, ROW_KEY,
  LedReadout, RegisterPage, Sheet, Strip,
} from '@/components/admin/register-ui';
import { getDictionaryClient } from '../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirm } from '@/lib/confirm';
import { useBranchesList, type Branch } from '@/hooks/useBranchesList';
import { useBranchForm } from '@/hooks/useBranchForm';
import { useUsersList, type User } from '@/hooks/useUsersList';
import { getRoleLabel } from '@/lib/users-helpers';

type Manager = { _id: string; name: string; email: string };

const managerOf = (branch: Branch): Manager | null =>
  branch.managerId && typeof branch.managerId === 'object' ? branch.managerId : null;

/** The address as a receipt prints it: street on one line, the rest on the next. */
function addressLines(address: Branch['address']): string[] {
  if (!address) return [];
  const clean = (s?: string) => (s || '').trim();
  const second = [clean(address.city), clean(address.state), clean(address.zipCode)].filter(Boolean).join(', ');
  return [clean(address.street), second, clean(address.country)].filter(Boolean);
}

export default function BranchesPage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';

  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [sheetBranch, setSheetBranch] = useState<Branch | null | undefined>(undefined); // undefined: closed, null: new branch
  const [busyId, setBusyId] = useState<string | null>(null);

  const { settings } = useTenantSettings();
  const { canAccess } = usePermissions();
  const canManage = canAccess('branches.manage');
  // The user list needs users.manage; without it the manager picker only keeps the current manager.
  const canListUsers = canAccess('users.manage');
  const { confirm, Dialog: ConfirmDialog } = useConfirm();

  const { branches, loading, fetchBranches, toggleBranchStatus } = useBranchesList();
  const { users: staff, fetchUsers } = useUsersList();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchBranches((error) => toast.error(error));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (canManage && canListUsers) fetchUsers((error) => toast.error(error));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, canListUsers]);

  const t = useCallback((key: string, fallback: string) => dict?.admin?.[key] || fallback, [dict]);

  const handleToggle = async (branch: Branch) => {
    if (branch.isActive) {
      const ok = await confirm(
        t('deactivateBranchTitle', 'Deactivate {name}?').replace('{name}', branch.name),
        t('deactivateBranchWarning', 'It is taken off the register, device and inventory branch lists until you activate it again. Its past records are kept.'),
        { variant: 'warning', confirmText: t('deactivate', 'Deactivate'), cancelText: dict?.common?.cancel || 'Cancel' }
      );
      if (!ok) return;
    }
    setBusyId(branch._id);
    await toggleBranchStatus(
      branch._id,
      branch.isActive,
      () => toast.success(branch.isActive ? t('branchDeactivated', 'Branch deactivated') : t('branchActivated', 'Branch activated')),
      (error) => toast.error(error)
    );
    setBusyId(null);
  };

  // Show the spinner only for the first load, so refetches after a save keep the page (and any open sheet) mounted.
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

  const activeCount = branches.filter((b) => b.isActive).length;
  // Open branches first, then closed ones; the API already sorts by name.
  const ordered = [...branches].sort((a, b) => Number(b.isActive) - Number(a.isActive));
  const editLabel = dict.common?.edit || 'Edit';

  return (
    <RegisterPage
      tagNo="BR"
      tag={settings?.companyName}
      title={t('branches', 'Branches')}
      subtitle={t('branchesSubtitle', 'Manage store branches and locations')}
      side={<LedReadout value={`${activeCount}/${branches.length}`} label={t('activeNow', 'Active')} />}
    >
      {ConfirmDialog}

      {canManage && (
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={() => setSheetBranch(null)} className={DARK_KEY_PRIMARY}>
            <Plus className={ICON} strokeWidth={1.75} aria-hidden />
            {t('addBranch', 'Add Branch')}
          </button>
        </div>
      )}

      {branches.length === 0 ? (
        <div className="mt-6">
          <div className="bg-paper-white px-4 py-14 text-center text-ink">
            <Store className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
            <p className="font-receipt text-sm text-ink/60">{t('noBranchesYet', 'No branches yet')}</p>
            {canManage && (
              <button type="button" onClick={() => setSheetBranch(null)} className={`${KEY_PRIMARY} mx-auto mt-4`}>
                <Plus className={ICON} strokeWidth={1.75} aria-hidden />
                {t('addBranch', 'Add Branch')}
              </button>
            )}
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </div>
      ) : (
        <ul className={`mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          {ordered.map((branch) => {
            const manager = managerOf(branch);
            const lines = addressLines(branch.address);
            const busy = busyId === branch._id;
            const toggleLabel = branch.isActive ? t('deactivate', 'Deactivate') : t('activate', 'Activate');
            return (
              // Each branch prints like the head of its own receipt: name, address, contact, who runs it.
              <li key={branch._id} className={`flex min-w-0 flex-col text-ink ${branch.isActive ? '' : 'opacity-70'}`}>
                <div className={`flex flex-1 flex-col ${branch.isActive ? 'bg-paper-white' : 'bg-paper-white/80'}`}>
                  <div className={`flex items-center justify-between gap-2 px-4 py-1.5 font-receipt text-[11px] font-medium uppercase tracking-[0.08em] ${branch.isActive ? 'bg-brand text-ink' : 'bg-ink/10 text-ink/60'}`}>
                    <span>{branch.code ? `${t('code', 'Code')} ${branch.code}` : t('branch', 'Branch')}</span>
                    <span>{branch.isActive ? t('active', 'Active') : t('inactive', 'Inactive')}</span>
                  </div>
                  <div className="flex-1 px-4 pb-4 pt-3">
                    <h3 className="break-words font-display text-3xl font-bold uppercase leading-none sm:text-4xl">{branch.name}</h3>
                    {lines.length > 0 ? (
                      <address className="mt-2 flex gap-1.5 font-receipt text-xs not-italic leading-relaxed text-ink/70">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                        <span>{lines.map((l) => <span key={l} className="block break-words">{l}</span>)}</span>
                      </address>
                    ) : (
                      <p className="mt-2 font-receipt text-xs text-ink/40">{t('noAddress', 'No address on file')}</p>
                    )}
                    <div className="mt-3 space-y-1 border-t border-dashed border-ink/30 pt-3 font-receipt text-xs">
                      <ReceiptRow label={t('manager', 'Manager')} value={<span className="block max-w-[11rem] truncate sm:max-w-[14rem]" title={manager?.name}>{manager?.name || '—'}</span>} />
                      {branch.phone && <ReceiptRow label={t('phone', 'Phone')} value={branch.phone} />}
                      {branch.email && <ReceiptRow label={<span className="whitespace-nowrap">{t('email', 'Email')}</span>} value={<span className="block max-w-[11rem] truncate sm:max-w-[14rem]" title={branch.email}>{branch.email}</span>} />}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex justify-end border-t border-dashed border-ink/25">
                      <button type="button" disabled={busy} onClick={() => setSheetBranch(branch)} className={`${ROW_KEY} disabled:opacity-40`} aria-label={`${editLabel} ${branch.name}`} title={editLabel}>
                        <Pencil className={ICON} strokeWidth={1.75} aria-hidden />
                      </button>
                      {branch.isActive ? (
                        <button type="button" disabled={busy} onClick={() => handleToggle(branch)} className={`${ROW_KEY} hover:text-stamp disabled:opacity-40`} aria-label={`${toggleLabel} ${branch.name}`} title={toggleLabel}>
                          <Power className={ICON} strokeWidth={1.75} aria-hidden />
                        </button>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => handleToggle(branch)} className={`${ROW_KEY} w-auto gap-2 px-3 font-receipt text-xs uppercase disabled:opacity-40`} aria-label={`${toggleLabel} ${branch.name}`}>
                          <Power className={ICON} strokeWidth={1.75} aria-hidden />
                          {toggleLabel}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className={`mk-tear-b h-3 ${branch.isActive ? 'bg-paper-white' : 'bg-paper-white/80'}`} aria-hidden />
              </li>
            );
          })}
        </ul>
      )}

      {sheetBranch !== undefined && (
        <BranchSheet
          branch={sheetBranch}
          staff={staff}
          canListUsers={canListUsers}
          dict={dict}
          onClose={() => setSheetBranch(undefined)}
          onSaved={() => {
            setSheetBranch(undefined);
            fetchBranches();
          }}
        />
      )}
    </RegisterPage>
  );
}

/** Add a branch, or change its name, code, address, contact details or manager. */
function BranchSheet({ branch, staff, canListUsers, dict, onClose, onSaved }: {
  branch: Branch | null;
  staff: User[];
  canListUsers: boolean;
  dict: TranslationDict;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { formData, setFormData, submitting, error, handleSubmit } = useBranchForm(branch);
  const t = (key: string, fallback: string) => dict.admin?.[key] || fallback;
  const optional = dict.common?.optional || 'optional';

  // Active staff, plus the current manager even if they are inactive or the list could not be loaded.
  const current = branch ? managerOf(branch) : null;
  const choices: { _id: string; label: string }[] = staff
    .filter((u) => u.isActive)
    .map((u) => ({ _id: u._id, label: `${u.name} · ${getRoleLabel(u.role, dict)}` }));
  if (current && !choices.some((c) => c._id === current._id)) choices.unshift({ _id: current._id, label: current.name });

  const setAddress = (field: keyof NonNullable<Branch['address']>, value: string) =>
    setFormData({ ...formData, address: { ...(formData.address || {}), [field]: value } });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    await handleSubmit(() => {
      toast.success(branch ? t('branchUpdated', 'Branch updated') : t('branchCreated', 'Branch added'));
      onSaved();
    });
  };

  const addressFields: { key: keyof NonNullable<Branch['address']>; label: string; wide?: boolean; auto: string }[] = [
    { key: 'street', label: t('streetPlaceholder', 'Street'), wide: true, auto: 'address-line1' },
    { key: 'city', label: t('cityPlaceholder', 'City'), auto: 'address-level2' },
    { key: 'state', label: t('statePlaceholder', 'State'), auto: 'address-level1' },
    { key: 'zipCode', label: t('zipPlaceholder', 'ZIP Code'), auto: 'postal-code' },
    { key: 'country', label: t('countryPlaceholder', 'Country'), auto: 'country-name' },
  ];

  return (
    <Sheet
      wide
      title={branch ? t('editBranch', 'Edit Branch') : t('addBranch', 'Add Branch')}
      subtitle={branch?.name}
      onClose={onClose}
      closeLabel={dict.common?.close || 'Close'}
      footer={
        <>
          <button type="button" onClick={onClose} className={KEY}>{dict.common?.cancel || 'Cancel'}</button>
          <button type="submit" form="branch-form" disabled={submitting} className={KEY_PRIMARY}>
            {submitting ? (dict.common?.saving || 'Saving...') : (dict.common?.save || 'Save')}
          </button>
        </>
      }
    >
      <form id="branch-form" onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <div>
            <label htmlFor="branch-name" className={LABEL}>{t('name', 'Name')} *</label>
            <input id="branch-name" type="text" required autoFocus maxLength={100} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={INPUT} />
          </div>
          <div>
            <label htmlFor="branch-code" className={LABEL}>{t('code', 'Code')} ({optional})</label>
            <input
              id="branch-code"
              type="text"
              maxLength={20}
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              className={`${INPUT} font-receipt uppercase`}
              placeholder={t('branchCodePlaceholder', 'BR001')}
            />
          </div>
        </div>

        <fieldset>
          <legend className={LABEL}>{t('address', 'Address')} ({optional})</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {addressFields.map((f) => (
              <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
                <label htmlFor={`branch-${f.key}`} className="mb-0.5 block font-receipt text-[11px] uppercase tracking-[0.08em] text-ink/50">{f.label}</label>
                <input
                  id={`branch-${f.key}`}
                  type="text"
                  autoComplete={f.auto}
                  value={formData.address?.[f.key] || ''}
                  onChange={(e) => setAddress(f.key, e.target.value)}
                  className={INPUT}
                  placeholder={f.label}
                />
              </div>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="branch-phone" className={LABEL}>{t('phone', 'Phone')} ({optional})</label>
            <input id="branch-phone" type="tel" autoComplete="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className={`${INPUT} font-receipt`} />
          </div>
          <div>
            <label htmlFor="branch-email" className={LABEL}>{t('email', 'Email')} ({optional})</label>
            <input id="branch-email" type="email" autoComplete="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={`${INPUT} font-receipt`} />
          </div>
        </div>

        <div>
          <label htmlFor="branch-manager" className={LABEL}>{t('manager', 'Manager')} ({optional})</label>
          <select id="branch-manager" value={formData.managerId} onChange={(e) => setFormData({ ...formData, managerId: e.target.value })} className={INPUT}>
            <option value="">{t('noManager', 'No manager')}</option>
            {choices.map((c) => (
              <option key={c._id} value={c._id}>{c.label}</option>
            ))}
          </select>
          {!canListUsers && <p className={HINT}>{t('managerListRestricted', 'Only people who can manage users can pick from the staff list.')}</p>}
        </div>

        {error && <Strip tone="error">{error}</Strip>}
      </form>
    </Sheet>
  );
}
