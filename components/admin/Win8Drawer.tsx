'use client';

import { useEffect, useState } from 'react';

interface Win8DrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function Win8Drawer({ open, onClose, children }: Win8DrawerProps) {
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);

  if (open && !mounted) setMounted(true);
  if (!open && entered) setEntered(false);

  useEffect(() => {
    if (!open) {
      const timeout = setTimeout(() => setMounted(false), 250);
      return () => clearTimeout(timeout);
    }
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 bg-black/50 flex justify-end z-50 transition-opacity duration-200 ${entered ? 'opacity-100' : 'opacity-0'}`}
      onClick={onClose}
    >
      <div
        className={`bg-white w-full max-w-lg h-full flex flex-col transition-transform duration-[250ms] ease-out ${entered ? 'translate-x-0' : 'translate-x-full'}`}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
