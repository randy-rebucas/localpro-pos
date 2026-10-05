'use client';

import { useEffect, useId, useRef, useState } from 'react';

interface Win8DrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Panel max-width utility; defaults to `max-w-lg`. Use `max-w-2xl` for multi-column forms. */
  widthClass?: string;
  /**
   * Accessible name for the dialog. When omitted, the drawer labels itself
   * from the first `<h2>` inside it (the navy header title).
   */
  ariaLabel?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Win8Drawer({ open, onClose, children, widthClass = 'max-w-lg', ariaLabel }: Win8DrawerProps) {
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

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

  // Escape closes; remember and restore the element that opened the drawer.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  // Move focus into the panel once it's on screen, and label it from its header.
  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !mounted || !panel) return;
    if (!ariaLabel) {
      const heading = panel.querySelector('h2');
      if (heading) {
        if (!heading.id) heading.id = titleId;
        panel.setAttribute('aria-labelledby', heading.id);
      }
    }
    if (!panel.contains(document.activeElement)) panel.focus();
  }, [open, mounted, ariaLabel, titleId]);

  const trapTab = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter(el => el.offsetParent !== null || el === document.activeElement);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 bg-black/50 flex justify-end z-50 transition-opacity duration-200 ${entered ? 'opacity-100' : 'opacity-0'}`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onKeyDown={trapTab}
        className={`bg-white w-full ${widthClass} h-full flex flex-col transition-transform duration-[250ms] ease-out ${entered ? 'translate-x-0' : 'translate-x-full'}`}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
