'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import Script from 'next/script';

export const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

declare global {
  interface Window {
    grecaptcha?: {
      render: (container: HTMLElement, params: Record<string, unknown>) => number;
      reset: (widgetId?: number) => void;
      getResponse: (widgetId?: number) => string;
    };
  }
}

export interface RecaptchaHandle {
  reset: () => void;
}

interface RecaptchaProps {
  onChange: (token: string) => void;
  className?: string;
}

/**
 * Renders a Google reCAPTCHA v2 checkbox widget. Renders nothing when
 * NEXT_PUBLIC_RECAPTCHA_SITE_KEY is not configured, so forms work unchanged
 * in environments without reCAPTCHA set up.
 */
const Recaptcha = forwardRef<RecaptchaHandle, RecaptchaProps>(function Recaptcha({ onChange, className }, ref) {
  const [scriptReady, setScriptReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (window.grecaptcha && widgetId.current !== null) {
        window.grecaptcha.reset(widgetId.current);
        onChange('');
      }
    },
  }));

  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY || !scriptReady) return;
    if (!containerRef.current || widgetId.current !== null) return;
    if (!window.grecaptcha) return;

    widgetId.current = window.grecaptcha.render(containerRef.current, {
      sitekey: RECAPTCHA_SITE_KEY,
      callback: (token: string) => onChange(token),
      'expired-callback': () => onChange(''),
    });
    // onChange is expected to be a stable setState updater from the caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptReady]);

  if (!RECAPTCHA_SITE_KEY) return null;

  return (
    <>
      <Script
        src="https://www.google.com/recaptcha/api.js?render=explicit"
        onLoad={() => setScriptReady(true)}
      />
      <div className={className}>
        <div ref={containerRef} />
      </div>
    </>
  );
});

export default Recaptcha;
