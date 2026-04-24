'use client';

import { useEffect, useRef } from 'react';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';

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
  const { settings } = useTenantSettings();
  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#35979c';

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

  const variantStyles = {
    danger: {
      confirmButton: 'bg-red-600 hover:bg-red-700 border-red-700 text-white',
      icon: (
        <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    warning: {
      confirmButton: 'bg-yellow-600 hover:bg-yellow-700 border-yellow-700 text-white',
      icon: (
        <svg className="w-6 h-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    info: {
      confirmButton: 'text-white border',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: '#35979c' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  };

  const styles = variantStyles[variant];

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 backdrop:backdrop-blur-sm rounded-lg p-0 w-full max-w-md shadow-xl border border-gray-300"
    >
      <div className="bg-white rounded-lg p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0">
            {styles.icon}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
            <p className="text-sm text-gray-600 whitespace-pre-line">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={handleCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white rounded-md text-sm font-medium transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2.5 font-medium transition-colors border text-white"
            style={variant === 'info' ? {
              backgroundColor: primaryColor,
              borderColor: primaryColor,
            } : variant === 'warning' ? {
              backgroundColor: '#ca8a04',
              borderColor: '#ca8a04',
            } : {
              backgroundColor: '#dc2626',
              borderColor: '#dc2626',
            }}
            onMouseEnter={(e) => {
              if (variant === 'info') {
                e.currentTarget.style.backgroundColor = `${primaryColor}dd`;
              } else if (variant === 'warning') {
                e.currentTarget.style.backgroundColor = '#b45309';
              } else {
                e.currentTarget.style.backgroundColor = '#b91c1c';
              }
            }}
            onMouseLeave={(e) => {
              if (variant === 'info') {
                e.currentTarget.style.backgroundColor = primaryColor;
              } else if (variant === 'warning') {
                e.currentTarget.style.backgroundColor = '#ca8a04';
              } else {
                e.currentTarget.style.backgroundColor = '#dc2626';
              }
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </dialog>
  );
}
