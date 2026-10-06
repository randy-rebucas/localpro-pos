'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { logger } from '@/lib/logger';
import { showToast } from '@/lib/toast';
import { usePermissions } from '@/hooks/usePermissions';

interface UploadedFile {
  id?: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: string;
}

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const MAX_SIZE = 10 * 1024 * 1024;

/** Read `error` from a failed response body without letting a parse failure mask it. */
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data?.error || fallback;
  } catch {
    return fallback;
  }
}

export default function FileUploadPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [viewingFile, setViewingFile] = useState<UploadedFile | null>(null);
  const [deletingFile, setDeletingFile] = useState<UploadedFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { canAccess } = usePermissions();
  // Deleting needs files.manage; uploading also works with products/settings access (see /api/upload).
  const canDeleteFiles = canAccess('files.manage');

  // fileUpload.* strings live in their own dictionary section.
  const fu = (dict as unknown as { fileUpload?: Record<string, string | undefined> } | null)?.fileUpload;

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const fetchUploadedFiles = useCallback(async () => {
    setLoadingFiles(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/upload?tenant=${tenant}`, { credentials: 'include' });
      if (!res.ok) {
        setLoadError(await readError(res, 'Failed to load files'));
        return;
      }
      const data = (await res.json()) as { success: boolean; data?: UploadedFile[]; error?: string };
      if (data.success) {
        setUploadedFiles(
          (data.data || []).map((file) => ({
            id: file.id,
            name: file.name,
            size: file.size,
            type: file.type,
            url: file.url,
            uploadedAt: file.uploadedAt,
          }))
        );
      } else {
        setLoadError(data.error || 'Failed to load files');
      }
    } catch (error) {
      logger.error('Error fetching files:', error);
      setLoadError('Failed to load files');
    } finally {
      setLoadingFiles(false);
    }
  }, [tenant]);

  useEffect(() => {
    fetchUploadedFiles();
  }, [fetchUploadedFiles]);

  // Escape closes whichever modal is open.
  useEffect(() => {
    if (!viewingFile && !deletingFile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (deletingFile && !deleting) setDeletingFile(null);
      else setViewingFile(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [viewingFile, deletingFile, deleting]);

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/upload?tenant=${tenant}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        // Surface the server's reason (size/type/quota) instead of a generic message.
        throw new Error(await readError(res, fu?.uploadFailed || 'Failed to upload file'));
      }

      const data = await res.json();
      const newFile: UploadedFile = {
        id: data.data.id,
        name: file.name,
        size: file.size,
        type: file.type,
        url: data.data.url || `/uploads/${tenant}/${file.name}`,
        uploadedAt: data.data.uploadedAt || new Date().toISOString(),
      };

      setUploadedFiles((prev) => [newFile, ...prev]);
      showToast.success((fu?.uploadedSuccessfully || '{name} uploaded successfully').replace('{name}', file.name));
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : (fu?.uploadFailed || 'Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  const handleFile = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      showToast.error(fu?.fileTypeNotAllowed || 'File type not allowed. Please upload an image, PDF, or spreadsheet.');
      return;
    }
    if (file.size > MAX_SIZE) {
      showToast.error(fu?.fileSizeExceeded || 'File size exceeds 10MB limit.');
      return;
    }
    await uploadFile(file);
  };

  const handleDrag = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Allow picking the same file again after an error.
    e.target.value = '';
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const s = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + s[i];
  };

  const formatDate = (dateString: string): string =>
    new Date(dateString).toLocaleString(lang === 'es' ? 'es-ES' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast.success(fu?.urlCopied || 'URL copied to clipboard');
    } catch {
      showToast.error(fu?.copyFailed || 'Could not copy to clipboard');
    }
  };

  const confirmDelete = async () => {
    if (!deletingFile?.id) {
      showToast.error(fu?.fileIdNotFound || 'File ID not found');
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/upload?id=${deletingFile.id}&tenant=${tenant}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(await readError(res, fu?.deleteFailed || 'Failed to delete file'));
      }
      setUploadedFiles((prev) => prev.filter((f) => f.id !== deletingFile.id));
      showToast.success(fu?.fileDeleted || 'File deleted successfully');
      setDeletingFile(null);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : (fu?.deleteFailed || 'Delete failed'));
    } finally {
      setDeleting(false);
    }
  };

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  const fileIcon = (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />
    </svg>
  );

  const renderFiles = () => {
    if (loadingFiles && uploadedFiles.length === 0) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{fu?.loadingFiles || 'Loading files…'}</p>
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{loadError}</p>
          <button
            type="button"
            onClick={() => fetchUploadedFiles()}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (uploadedFiles.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          <p>{fu?.noFilesYet || 'No files uploaded yet'}</p>
          <p className="text-sm mt-1">{fu?.uploadFirstFile || 'Upload your first file to get started'}</p>
        </div>
      );
    }

    const viewLabel = fu?.view || 'View';
    const copyLabel = fu?.copy || 'Copy URL';
    const deleteLabel = fu?.delete || 'Delete';

    return (
      <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{fu?.fileColumn || 'File'}</th>
              <th className="px-4 py-3 text-right font-medium">{fu?.sizeColumn || 'Size'}</th>
              <th className="px-4 py-3 text-left font-medium">{fu?.uploadedColumn || 'Uploaded'}</th>
              <th className="px-4 py-3 text-right font-medium">{dict.common?.actions || 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {uploadedFiles.map((file) => (
              <tr key={file.id || file.url} className="hover:bg-gray-100 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 shrink-0 bg-gray-100 border border-gray-300 flex items-center justify-center overflow-hidden text-gray-400">
                      {file.type.startsWith('image/') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={file.url} alt="" className="w-10 h-10 object-cover" />
                      ) : fileIcon}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 max-w-[280px] truncate" title={file.name}>{file.name}</p>
                      <p className="text-xs font-mono text-gray-400 max-w-[280px] truncate" title={file.url}>{file.url}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums text-gray-700">{formatFileSize(file.size)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">{formatDate(file.uploadedAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    <button type="button" onClick={() => setViewingFile(file)} title={viewLabel} aria-label={`${viewLabel}: ${file.name}`} className="inline-flex items-center justify-center p-2.5 text-white bg-brand hover:brightness-110 transition-[filter]">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                      </svg>
                    </button>
                    <button type="button" onClick={() => copyToClipboard(file.url)} title={copyLabel} aria-label={`${copyLabel}: ${file.name}`} className="inline-flex items-center justify-center p-2.5 text-white bg-brand-navy hover:brightness-110 transition-[filter]">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 8V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3M5 8h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
                      </svg>
                    </button>
                    {canDeleteFiles && (
                      <button type="button" onClick={() => setDeletingFile(file)} title={deleteLabel} aria-label={`${deleteLabel}: ${file.name}`} className="inline-flex items-center justify-center p-2.5 text-white bg-win8-danger hover:brightness-110 transition-[filter]">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12.1a2 2 0 0 1-2 1.9H9.7a2 2 0 0 1-2-1.9L7 7h10Z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={fu?.title || 'File Upload'}
          description={fu?.subtitle || 'Upload images, documents, and media files to your account. Max file size: 10MB.'}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-4">
            <section className="bg-white border border-gray-300">
              <div className="px-6 py-4 border-b border-gray-300">
                <h2 className="text-base font-bold text-gray-900">{fu?.uploadFile || 'Upload File'}</h2>
              </div>
              <div className="p-6">
                <label
                  htmlFor="file-upload"
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  className={`block w-full border-2 border-dashed p-8 text-center transition-colors ${
                    uploading ? 'cursor-wait border-gray-300 bg-gray-100' : dragActive ? 'cursor-pointer border-brand bg-brand-soft' : 'cursor-pointer border-gray-300 bg-gray-50 hover:border-brand'
                  }`}
                >
                  <input
                    type="file"
                    id="file-upload"
                    onChange={handleChange}
                    disabled={uploading}
                    className="sr-only"
                    accept="image/*,.pdf,.csv,.xls,.xlsx"
                  />
                  {uploading ? (
                    <>
                      <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
                      <p className="mt-3 text-sm font-medium text-gray-700">{fu?.uploadingFile || 'Uploading file…'}</p>
                    </>
                  ) : (
                    <>
                      <span className="mx-auto w-10 h-10 bg-brand text-white flex items-center justify-center">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M12 16V4m0 0L8 8m4-4 4 4" />
                        </svg>
                      </span>
                      <p className="mt-3 text-sm font-semibold text-gray-900">{fu?.dragAndDrop || 'Drag and drop your file here'}</p>
                      <p className="text-sm text-gray-500">{fu?.orClickToSelect || 'or click to select from your computer'}</p>
                      <p className="text-xs text-gray-400 mt-2">{fu?.supportedFormats || 'Supported: Images (PNG, JPG, GIF, WebP), PDF, CSV, Excel'}</p>
                    </>
                  )}
                </label>
              </div>
            </section>

            <section className="bg-white border border-gray-300 p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-3">{fu?.allowedFileTypes || 'Allowed File Types'}</h2>
              <dl className="divide-y divide-gray-200 text-sm">
                {[
                  [fu?.images || 'Images', fu?.imagesDesc || 'PNG, JPG, GIF, WebP - Perfect for logos, product photos, and branding'],
                  [fu?.documents || 'Documents', fu?.documentsDesc || 'PDF - For invoices, receipts, and reports'],
                  [fu?.spreadsheets || 'Spreadsheets', fu?.spreadsheetsDesc || 'CSV, XLS, XLSX - For data imports and exports'],
                  [fu?.sizeLimit || 'Size Limit', fu?.sizeLimitDesc || 'Maximum 10MB per file'],
                ].map(([title, desc]) => (
                  <div key={title} className="py-2">
                    <dt className="font-semibold text-gray-900">{title}</dt>
                    <dd className="text-gray-500">{desc}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          <div className="lg:col-span-2">{renderFiles()}</div>
        </div>
      </div>

      {deletingFile && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !deleting && setDeletingFile(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-file-title"
            className="bg-white border border-gray-300 w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-file-title" className="text-lg font-bold text-gray-900 mb-1">{fu?.deleteFileTitle || 'Delete File?'}</h2>
            <p className="text-sm text-gray-500 mb-4 break-all">
              <span className="font-medium text-gray-700">{deletingFile.name}</span>
            </p>
            <p className="text-sm text-gray-600 mb-4">
              {fu?.deleteFileConfirm || 'This action cannot be undone. The file will be permanently deleted from both storage and your account.'}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setDeletingFile(null)}
                disabled={deleting}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm hover:bg-gray-100 bg-white disabled:opacity-50 transition-colors"
              >
                {dict.common?.cancel || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 bg-win8-danger text-white text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition-[filter]"
              >
                {deleting ? (fu?.deleting || 'Deleting…') : (fu?.delete || 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingFile && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setViewingFile(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="view-file-title"
            className="bg-white border border-gray-300 max-w-4xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
              <div className="min-w-0">
                <h2 id="view-file-title" className="text-base font-semibold truncate">{viewingFile.name}</h2>
                <p className="text-xs text-white/70">{formatFileSize(viewingFile.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewingFile(null)}
                title={dict.common?.close || 'Close'}
                aria-label={dict.common?.close || 'Close'}
                className="text-white/70 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-auto">
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 text-xs font-mono bg-gray-100 border border-gray-300 px-3 py-2 text-gray-700 break-all">{viewingFile.url}</code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(viewingFile.url)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors whitespace-nowrap"
                >
                  {fu?.copy || 'Copy'}
                </button>
              </div>

              {viewingFile.type.startsWith('image/') ? (
                <div className="flex justify-center bg-gray-100 border border-gray-300 p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={viewingFile.url} alt={viewingFile.name} className="max-w-full max-h-[calc(90vh-220px)] object-contain" />
                </div>
              ) : viewingFile.type === 'application/pdf' ? (
                <iframe src={viewingFile.url} className="w-full h-[500px] border border-gray-300" title={viewingFile.name} />
              ) : (
                <p className="text-sm text-gray-400 italic text-center py-8">{fu?.previewNotAvailable || 'Preview not available for this file type'}</p>
              )}

              <div className="flex justify-end">
                <a
                  href={viewingFile.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0-4-4m4 4V4" />
                  </svg>
                  {viewingFile.type === 'application/pdf' ? (fu?.downloadPdf || 'Download PDF') : (fu?.downloadFile || 'Download File')}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
