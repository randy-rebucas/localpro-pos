'use client';

import { useCallback, useState } from 'react';

export type CreditModalMode = 'add' | 'adjust' | 'refund';

export interface UseCreditsModalReturn {
  isOpen: boolean;
  mode: CreditModalMode;
  selectedCustomerId: string | null;
  openModal: (mode: CreditModalMode, customerId?: string) => void;
  closeModal: () => void;
  setMode: (mode: CreditModalMode) => void;
}

export function useCreditsModal(): UseCreditsModalReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<CreditModalMode>('add');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const openModal = useCallback((newMode: CreditModalMode, customerId?: string) => {
    setMode(newMode);
    if (customerId) setSelectedCustomerId(customerId);
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setSelectedCustomerId(null);
  }, []);

  const setModeAndOpen = useCallback((newMode: CreditModalMode) => {
    setMode(newMode);
  }, []);

  return {
    isOpen,
    mode,
    selectedCustomerId,
    openModal,
    closeModal,
    setMode: setModeAndOpen,
  };
}
