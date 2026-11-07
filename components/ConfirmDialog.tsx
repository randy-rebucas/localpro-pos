'use client';

import { useEffect, useRef } from 'react';
import { marketingFontClasses } from '@/components/marketing/fonts';

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

  const warningPath = 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z';
  const variantStyles = {
    danger: { confirmButton: 'bg-stamp hover:brightness-110', iconClass: 'text-stamp', iconPath: warningPath },
    warning: { confirmButton: 'bg-ink hover:bg-brand-navy', iconClass: 'text-ink', iconPath: warningPath },
    info: {
      confirmButton: 'bg-ink hover:bg-brand-navy',
      iconClass: 'text-brand-hover',
      iconPath: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
  };

  const styles = variantStyles[variant];

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className={`${marketingFontClasses} m-auto w-full max-w-md bg-paper-white p-0 text-ink backdrop:bg-ink/60`}
    >
      <div className="p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0">
            <svg className={`w-6 h-6 ${styles.iconClass}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d={styles.iconPath} />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-3xl font-extrabold uppercase leading-none text-ink mb-2">{title}</h3>
            <p className="text-sm text-ink/70 whitespace-pre-line">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 border-t border-dashed border-ink/30 pt-4">
          <button
            onClick={handleCancel}
            className="px-4 py-2 border border-ink/25 bg-paper-white font-receipt text-xs font-medium uppercase text-ink hover:border-ink transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 font-receipt text-xs font-medium uppercase text-paper-white transition-colors ${styles.confirmButton}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </dialog>
  );
}
