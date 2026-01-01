'use client';

import { useState, useCallback } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';

/**
 * Custom confirmation hook to replace window.confirm()
 * Usage:
 * const confirm = useConfirm();
 * const result = await confirm('Title', 'Message');
 */

export function useConfirm() {
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
    resolve?: (value: boolean) => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
  });

  const confirm = useCallback(
    (
      title: string,
      message: string,
      options?: {
        confirmText?: string;
        cancelText?: string;
        variant?: 'danger' | 'warning' | 'info';
      }
    ): Promise<boolean> => {
      return new Promise((resolve) => {
        setDialogState({
          isOpen: true,
          title,
          message,
          confirmText: options?.confirmText,
          cancelText: options?.cancelText,
          variant: options?.variant || 'info',
          resolve,
        });
      });
    },
    []
  );

  const handleConfirm = useCallback(() => {
    dialogState.resolve?.(true);
    setDialogState((prev) => ({ ...prev, isOpen: false, resolve: undefined }));
  }, [dialogState]);

  const handleCancel = useCallback(() => {
    dialogState.resolve?.(false);
    setDialogState((prev) => ({ ...prev, isOpen: false, resolve: undefined }));
  }, [dialogState]);

  const Dialog = (
    <ConfirmDialog
      isOpen={dialogState.isOpen}
      title={dialogState.title}
      message={dialogState.message}
      confirmText={dialogState.confirmText}
      cancelText={dialogState.cancelText}
      variant={dialogState.variant}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, Dialog };
}
