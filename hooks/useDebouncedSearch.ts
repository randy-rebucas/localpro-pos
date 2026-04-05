import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hook for debounced search functionality
 */
export function useDebouncedSearch(initialValue: string = '', delayMs: number = 300) {
  const [searchTerm, setSearchTerm] = useState(initialValue);
  const [debouncedValue, setDebouncedValue] = useState(initialValue);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(searchTerm);
    }, delayMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [searchTerm, delayMs]);

  const reset = useCallback(() => {
    setSearchTerm('');
    setDebouncedValue('');
  }, []);

  return { searchTerm, setSearchTerm, debouncedValue, reset };
}
