'use client';

import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

const WARNING_ICON = 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z';
const INFO_ICON = 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';

// Win8 flat variants: solid token fills, white text, brightness hover.
const VARIANT_STYLES = {
  danger: { confirm: 'bg-win8-danger hover:brightness-110 transition-[filter]', iconBg: 'bg-win8-danger', icon: WARNING_ICON },
  warning: { confirm: 'bg-win8-warning hover:brightness-110 transition-[filter]', iconBg: 'bg-win8-warning', icon: WARNING_ICON },
  info: { confirm: 'bg-brand hover:bg-brand-hover transition-colors', iconBg: 'bg-brand', icon: INFO_ICON },
} as const;

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'info',
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  const handleConfirm = () => {
    onConfirm();
    dialogRef.current?.close();
  };

  const handleCancel = () => {
    onCancel();
    dialogRef.current?.close();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      handleCancel();
    }
  };

  const styles = VARIANT_STYLES[variant];

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onCancel={(e) => {
        // Escape key: route through onCancel so the awaiting promise resolves.
        e.preventDefault();
        handleCancel();
      }}
      aria-labelledby="confirm-dialog-title"
      className="backdrop:bg-black/40 p-0 w-full max-w-md border border-gray-300 bg-white"
    >
      <div className="p-6">
        <div className="flex items-start gap-4 mb-4">
          <span className={`w-9 h-9 shrink-0 ${styles.iconBg} text-white flex items-center justify-center`} aria-hidden="true">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={styles.icon} />
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <h3 id="confirm-dialog-title" className="text-lg font-bold text-gray-900 mb-1">{title}</h3>
            <p className="text-sm text-gray-600 whitespace-pre-line">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`px-4 py-2 text-white text-sm font-semibold ${styles.confirm}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </dialog>
  );
}
