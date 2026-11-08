'use client';

import { useRef, useState } from 'react';
import { normalizeImageUrl } from '@/lib/image-utils';

interface ImageUploadFieldProps {
  tenant: string;
  label: string;
  value: string;
  onChange: (url: string) => void;
  recommendedSize: string;
  helpText: string;
  previewClassName?: string;
  accept?: string;
  maxSizeMB?: number;
  /** Shown beside the size, so it can match a narrower `accept`. */
  formats?: string;
  labels?: Record<string, unknown>;
}

export default function ImageUploadField({
  tenant,
  label,
  value,
  onChange,
  recommendedSize,
  helpText,
  previewClassName = 'h-16 w-16',
  accept = 'image/png,image/jpeg,image/webp,image/gif,image/x-icon',
  maxSizeMB = 2,
  formats,
  labels,
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const previewFailed = Boolean(value) && failedUrl === value;

  const text = (key: string, fallback: string) => {
    const copy = labels?.[key];
    return typeof copy === 'string' ? copy : fallback;
  };

  const handleFile = async (file: File) => {
    setError(null);

    if (!file.type.startsWith('image/')) {
      setError(text('imageNotFile', 'Please select an image file'));
      return;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(text('imageTooLarge', 'File too large. Maximum size is {max}MB').replace('{max}', String(maxSizeMB)));
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'branding'); // Cloudinary folder 1pos/{slug}/branding/

      const res = await fetch(`/api/upload?tenant=${tenant}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || text('imageUploadFailed', 'Failed to upload image'));
      }

      onChange(data.data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : text('imageUploadFailed', 'Failed to upload image'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <label className="mb-1 block font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/70">{label}</label>
      <div className="flex items-start gap-4">
        <div
          className={`${previewClassName} flex-shrink-0 border-2 border-ink/25 bg-paper flex items-center justify-center overflow-hidden`}
        >
          {value && !previewFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={normalizeImageUrl(value)} alt={label} className="max-h-full max-w-full object-contain" onError={() => setFailedUrl(value)} />
          ) : (
            <svg className="w-6 h-6 text-ink/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="hidden"
            id={`upload-${label.replace(/\s+/g, '-')}`}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex min-h-[44px] items-center px-3 border border-ink/25 font-receipt text-xs font-medium uppercase text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? text('imageUploading', 'Uploading...') : value ? text('imageReplace', 'Replace Image') : text('imageUpload', 'Upload Image')}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange('')}
                disabled={uploading}
                className="flex min-h-[44px] items-center border border-stamp/40 px-3 font-receipt text-xs font-medium uppercase text-stamp transition-colors hover:border-stamp disabled:opacity-50"
              >
                {text('imageRemove', 'Remove')}
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-ink/60">{helpText}</p>
          <p className="text-xs text-ink/60">
            {text('imageRecommended', 'Recommended')}: {recommendedSize} &middot; {text('imageMaxSize', 'Max {max}MB').replace('{max}', String(maxSizeMB))} &middot; {formats || text('imageFormats', 'PNG, JPG, WEBP, GIF, or ICO')}
          </p>
          {previewFailed && <p className="mt-1 text-xs text-stamp">{text('imageLoadFailed', 'This image could not be loaded. Replace it or remove it.')}</p>}
          {error && <p className="mt-1 text-xs text-stamp">{error}</p>}
        </div>
      </div>
    </div>
  );
}
