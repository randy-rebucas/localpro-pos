'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Copy, Eye, FileText, FolderOpen, Trash2, UploadCloud } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  DARK_KEY, HINT, ICON, KEY, KEY_PRIMARY, LABEL, LedReadout, RegisterPage, ROW_KEY, Sheet, Strip,
} from '@/components/admin/register-ui';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirm } from '@/lib/confirm';
import { getDefaultTenantSettings } from '@/lib/currency';
import { formatDateTime } from '@/lib/formatting';
import { logger } from '@/lib/logger';

type AssetType = 'files' | 'products' | 'branding';
type Filter = 'all' | AssetType;

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  assetType: AssetType;
  uploadedAt: string;
}

type Dict = Record<string, Record<string, string | undefined> | undefined>;

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const MAX_SIZE = 10 * 1024 * 1024;
const ACCEPT = 'image/*,.pdf,.csv,.xls,.xlsx';

/** The server's message when it sent one (upload limit, storage not configured, ...), else the fallback. */
async function errorFrom(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string' && data.error) return data.error;
  } catch {
    // not JSON
  }
  return fallback;
}

export default function FileUploadPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Dict | null>(null);
  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  const { canAccess } = usePermissions();
  const { confirm, Dialog: ConfirmDialog } = useConfirm();

  const canProducts = canAccess('products.manage');
  const canBranding = canAccess('settings.manage');
  /** Who may see and delete each kind of asset (mirrors the upload API's rules). */
  const canManageType = useCallback(
    (type: AssetType) => (type === 'products' ? canProducts : type === 'branding' ? canBranding : canProducts || canBranding),
    [canProducts, canBranding]
  );

  const [filter, setFilter] = useState<Filter>('all');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [listError, setListError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<UploadedFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getDictionaryClient(lang).then((d) => setDict(d as unknown as Dict));
  }, [lang]);

  const t = useCallback((key: string, fallback: string) => dict?.fileUpload?.[key] || fallback, [dict]);

  // Read the dictionary through a ref so its arrival doesn't refetch the list
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const visibleTypes = useCallback(
    (f: Filter): AssetType[] => (f === 'all' ? (['files', 'products', 'branding'] as AssetType[]) : [f]).filter(canManageType),
    [canManageType]
  );

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      // One request per kind the user may see; a 403 on one kind just leaves it out
      const results = await Promise.all(
        visibleTypes(filter).map(async (type) => {
          const res = await fetch(`/api/upload?tenant=${encodeURIComponent(tenant)}&type=${type}`, { credentials: 'include' });
          if (res.status === 403) return { files: [] as UploadedFile[], error: '' };
          if (!res.ok) return { files: [] as UploadedFile[], error: await errorFrom(res, tRef.current('loadFailed', 'Could not load files')) };
          const data = (await res.json()) as { success: boolean; data?: Array<Omit<UploadedFile, 'assetType'> & { assetType?: AssetType }> };
          return {
            files: (data.data ?? []).map((file) => ({ ...file, assetType: file.assetType ?? type })),
            error: '',
          };
        })
      );
      const merged = results.flatMap((r) => r.files).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
      setFiles(merged);
      setListError(results.find((r) => r.error)?.error ?? '');
    } catch (error) {
      logger.error('Error fetching files:', error);
      setListError(tRef.current('loadFailed', 'Could not load files'));
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [tenant, filter, visibleTypes]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const formatFileSize = (bytes: number): string => {
    const units = [t('unitBytes', 'B'), t('unitKB', 'KB'), t('unitMB', 'MB'), t('unitGB', 'GB')];
    if (!bytes) return `0 ${units[0]}`;
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${units[i]}`;
  };

  const typeLabel = (type: AssetType) =>
    type === 'products' ? t('typeProducts', 'Product images') : type === 'branding' ? t('typeBranding', 'Branding') : t('typeFiles', 'Files');

  const uploadFile = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error(t('fileTypeNotAllowed', 'File type not allowed. Please upload an image, PDF, or spreadsheet.'));
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error(t('fileSizeExceeded', 'File size exceeds 10MB limit.'));
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'files'); // general library: 1pos/{slug}/files/
      const res = await fetch(`/api/upload?tenant=${encodeURIComponent(tenant)}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        toast.error(await errorFrom(res, t('uploadFailed', 'Upload failed')));
        return;
      }
      toast.success(t('uploadedSuccessfully', '{name} uploaded successfully').replace('{name}', file.name));
      await fetchFiles();
    } catch (error) {
      logger.error('Upload error:', error);
      toast.error(t('uploadFailed', 'Upload failed'));
    } finally {
      setUploading(false);
      // Clear the picker so choosing the same file again still fires onChange
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && !uploading) uploadFile(file);
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('urlCopied', 'URL copied to clipboard'));
    } catch {
      toast.error(t('copyFailed', 'Could not copy the URL'));
    }
  };

  const deleteFile = async (file: UploadedFile) => {
    if (busyId) return;
    const ok = await confirm(
      t('deleteFileTitleNamed', 'Delete {name}?').replace('{name}', file.name),
      t('deleteFileConfirm', 'This action cannot be undone. The file will be permanently deleted from both storage and your account.'),
      { variant: 'danger', confirmText: t('delete', 'Delete'), cancelText: dict?.common?.cancel || 'Cancel' }
    );
    if (!ok) return;

    setBusyId(file.id);
    try {
      const res = await fetch(`/api/upload?id=${encodeURIComponent(file.id)}&tenant=${encodeURIComponent(tenant)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        toast.error(await errorFrom(res, t('deleteFailed', 'Delete failed')));
        return;
      }
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      if (viewing?.id === file.id) setViewing(null);
      toast.success(t('fileDeleted', 'File deleted successfully'));
    } catch (error) {
      logger.error('Delete error:', error);
      toast.error(t('deleteFailed', 'Delete failed'));
    } finally {
      setBusyId(null);
    }
  };

  if (!dict || !loadedOnce) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const filters: Filter[] = ['all', ...(['files', 'products', 'branding'] as AssetType[]).filter(canManageType)];
  const closeLabel = dict.common?.close || 'Close';

  return (
    <RegisterPage
      tagNo="FU"
      tag={settings?.companyName}
      title={t('title', 'File Upload')}
      subtitle={t('subtitle', 'Upload images, documents, and media files to your account. Max file size: 10MB.')}
      side={<LedReadout value={files.length} label={t('filesCount', 'Files')} />}
    >
      {ConfirmDialog}

      {/* Which kind of asset to list */}
      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label={t('filterLabel', 'Show')}>
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`${DARK_KEY} ${filter === f ? 'border-[#8fe3d0] bg-white/10 text-paper-white' : ''}`}
          >
            {f === 'all' ? t('filterAll', 'All') : typeLabel(f)}
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Upload slip */}
        <div className="lg:col-span-1">
          <div className="bg-paper-white p-4 text-ink sm:p-5">
            <h2 className="text-3xl">{t('uploadFile', 'Upload File')}</h2>
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`mt-4 border-2 border-dashed p-6 text-center transition-colors ${dragActive ? 'border-brand-hover bg-brand-soft' : 'border-ink/30'}`}
            >
              <UploadCloud className="mx-auto mb-3 h-10 w-10 text-ink/40" strokeWidth={1.5} aria-hidden />
              <p className="font-receipt text-sm font-medium">{t('dragAndDrop', 'Drag and drop your file here')}</p>
              <p className="mt-1 font-receipt text-xs text-ink/60">{t('supportedFormats', 'Supported: Images (PNG, JPG, GIF, WebP), PDF, CSV, Excel')}</p>
              <input
                ref={fileInputRef}
                id="file-upload"
                type="file"
                className="sr-only"
                accept={ACCEPT}
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadFile(file);
                }}
              />
              <label htmlFor="file-upload" className={`${KEY_PRIMARY} mx-auto mt-4 w-fit cursor-pointer ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
                {uploading ? <LoadingSpinner size="sm" color="#fff" /> : <UploadCloud className={ICON} strokeWidth={1.75} aria-hidden />}
                {uploading ? t('uploadingFile', 'Uploading file...') : t('chooseFile', 'Choose file')}
              </label>
            </div>
            <p className={HINT}>{t('uploadGoesToFiles', 'Uploads here go to the general file library. Product images and the logo are uploaded from their own pages.')}</p>

            <dl className="mt-5 space-y-3 border-t border-dashed border-ink/30 pt-4 text-sm">
              {[
                [t('images', 'Images'), t('imagesDesc', 'PNG, JPG, GIF, WebP - Perfect for logos, product photos, and branding')],
                [t('documents', 'Documents'), t('documentsDesc', 'PDF - For invoices, receipts, and reports')],
                [t('spreadsheets', 'Spreadsheets'), t('spreadsheetsDesc', 'CSV, XLS, XLSX - For data imports and exports')],
                [t('sizeLimit', 'Size Limit'), t('sizeLimitDesc', 'Maximum 10MB per file')],
              ].map(([label, desc]) => (
                <div key={label}>
                  <dt className={LABEL}>{label}</dt>
                  <dd className="text-ink/70">{desc}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </div>

        {/* File list */}
        <div className="lg:col-span-2">
          {listError && <div className="mb-3"><Strip tone="error">{listError}</Strip></div>}
          {files.length === 0 ? (
            <div>
              <div className="bg-paper-white px-4 py-14 text-center text-ink">
                <FolderOpen className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
                <p className="font-receipt text-sm text-ink/60">{t('noFilesYet', 'No files uploaded yet')}</p>
                <p className="mt-1 font-receipt text-xs text-ink/50">{t('uploadFirstFile', 'Upload your first file to get started')}</p>
              </div>
              <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
            </div>
          ) : (
            <ul className={`space-y-3 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
              {files.map((file) => {
                const busy = busyId === file.id;
                const deletable = canManageType(file.assetType);
                return (
                  <li key={file.id} className="flex min-w-0 items-start gap-3 bg-paper-white p-3 text-ink">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden border border-ink/15 bg-paper">
                      {file.type.startsWith('image/') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={file.url} alt="" className="h-14 w-14 object-cover" />
                      ) : (
                        <FileText className="h-6 w-6 text-ink/40" strokeWidth={1.5} aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="break-all font-medium">{file.name}</p>
                      <p className="mt-0.5 flex flex-wrap gap-x-3 font-receipt text-xs text-ink/60">
                        <span className="uppercase">{typeLabel(file.assetType)}</span>
                        <span>{formatFileSize(file.size)}</span>
                        <span>{formatDateTime(file.uploadedAt, tenantSettings)}</span>
                      </p>
                      <code className="mt-2 block truncate border border-dashed border-ink/25 px-2 py-1 font-receipt text-xs text-ink/70" title={file.url}>
                        {file.url}
                      </code>
                    </div>
                    <div className="flex shrink-0 flex-col sm:flex-row">
                      <button type="button" onClick={() => copyUrl(file.url)} className={ROW_KEY} title={t('copy', 'Copy')} aria-label={`${t('copy', 'Copy')}: ${file.name}`}>
                        <Copy className={ICON} strokeWidth={1.75} aria-hidden />
                      </button>
                      <button type="button" onClick={() => setViewing(file)} className={ROW_KEY} title={t('view', 'View')} aria-label={`${t('view', 'View')}: ${file.name}`}>
                        <Eye className={ICON} strokeWidth={1.75} aria-hidden />
                      </button>
                      {deletable && (
                        <button
                          type="button"
                          onClick={() => deleteFile(file)}
                          disabled={busyId !== null}
                          aria-busy={busy}
                          className={`${ROW_KEY} hover:text-stamp disabled:opacity-40`}
                          title={t('delete', 'Delete')}
                          aria-label={`${t('delete', 'Delete')}: ${file.name}`}
                        >
                          {busy ? <LoadingSpinner size="sm" /> : <Trash2 className={ICON} strokeWidth={1.75} aria-hidden />}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {viewing && (
        <Sheet
          wide
          title={viewing.name}
          subtitle={<span className="font-receipt">{typeLabel(viewing.assetType)} · {formatFileSize(viewing.size)}</span>}
          onClose={() => setViewing(null)}
          closeLabel={closeLabel}
          footer={
            <>
              <button type="button" onClick={() => copyUrl(viewing.url)} className={KEY}>
                <Copy className={ICON} strokeWidth={1.75} aria-hidden />
                {t('copy', 'Copy')}
              </button>
              <a href={viewing.url} target="_blank" rel="noopener noreferrer" className={KEY_PRIMARY}>
                {viewing.type === 'application/pdf' ? t('downloadPdf', 'Download PDF') : t('downloadFile', 'Download File')}
              </a>
            </>
          }
        >
          <p className={LABEL}>{t('publicUrl', 'Public URL:')}</p>
          <code className="block break-all border border-dashed border-ink/25 px-2 py-1 font-receipt text-xs text-ink/70">{viewing.url}</code>
          <div className="mt-4">
            {viewing.type.startsWith('image/') ? (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={viewing.url} alt={viewing.name} className="max-h-[60dvh] max-w-full object-contain" />
              </div>
            ) : viewing.type === 'application/pdf' ? (
              <iframe src={viewing.url} className="h-[60dvh] w-full border border-ink/20" title={viewing.name} />
            ) : (
              <div className="py-8 text-center">
                <FileText className="mx-auto h-10 w-10 text-ink/30" strokeWidth={1.5} aria-hidden />
                <p className="mt-2 font-receipt text-sm text-ink/60">{t('previewNotAvailable', 'Preview not available for this file type')}</p>
              </div>
            )}
          </div>
        </Sheet>
      )}
    </RegisterPage>
  );
}
