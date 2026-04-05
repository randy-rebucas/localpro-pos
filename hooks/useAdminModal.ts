import { useState, useCallback } from 'react';

/**
 * Generic modal state management hook for admin pages
 * Handles showing/hiding modals and managing selected/editing items
 */
export function useAdminModal<T>(initialItem: T | null = null) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<T | null>(initialItem);

  const open = useCallback((item: T | null = null) => {
    setSelectedItem(item);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setSelectedItem(null);
    setIsOpen(false);
  }, []);

  const toggle = useCallback((item: T | null = null) => {
    if (isOpen) {
      close();
    } else {
      open(item);
    }
  }, [isOpen, open, close]);

  return {
    isOpen,
    selectedItem,
    open,
    close,
    toggle,
    setSelectedItem,
  };
}
