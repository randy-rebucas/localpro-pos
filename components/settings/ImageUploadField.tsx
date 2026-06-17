'use client';

import { useRef, useState } from 'react';

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
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File too large. Maximum size is ${maxSizeMB}MB`);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/upload?tenant=${tenant}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload image');
      }

      onChange(data.data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-start gap-4">
        <div
          className={`${previewClassName} flex-shrink-0 border-2 border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden`}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={label} className="max-h-full max-w-full object-contain" />
          ) : (
            <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              className="px-4 py-2 text-sm font-medium text-brand bg-brand-soft hover:bg-brand-soft transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-teal-300 flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <div className="animate-spin h-4 w-4 border-b-2 border-brand"></div>
                  <span>Uploading...</span>
                </>
              ) : (
                <span>{value ? 'Replace' : 'Upload'} Image</span>
              )}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange('')}
                disabled={uploading}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors border border-red-200 disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-500">{helpText}</p>
          <p className="text-xs text-gray-400">
            Recommended: {recommendedSize} &middot; Max {maxSizeMB}MB &middot; PNG, JPG, WEBP, GIF, or ICO
          </p>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
