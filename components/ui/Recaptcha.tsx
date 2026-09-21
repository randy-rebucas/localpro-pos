'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import Script from 'next/script';

export const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

declare global {
  interface Window {
    grecaptcha?: {
      enterprise: {
        render: (container: HTMLElement, params: Record<string, unknown>) => number;
        reset: (widgetId?: number) => void;
        getResponse: (widgetId?: number) => string;
        ready: (callback: () => void) => void;
      };
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
 * Renders a reCAPTCHA checkbox widget. Uses enterprise.js/grecaptcha.enterprise
 * rather than the classic api.js/grecaptcha — the site key configured in this
 * project is an Enterprise key, and grecaptcha.render() from api.js does not
 * recognize Enterprise keys (the widget silently fails to render). Renders
 * nothing when NEXT_PUBLIC_RECAPTCHA_SITE_KEY is not configured, so forms
 * work unchanged in environments without reCAPTCHA set up.
 */
const Recaptcha = forwardRef<RecaptchaHandle, RecaptchaProps>(function Recaptcha({ onChange, className }, ref) {
  const [scriptReady, setScriptReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (window.grecaptcha?.enterprise && widgetId.current !== null) {
        window.grecaptcha.enterprise.reset(widgetId.current);
        onChange('');
      }
    },
  }));

  // The script tag is deduped by src, so onLoad only fires the first time it
  // loads on the page — if this component remounts later (e.g. a multi-step
  // form re-mounting this step), grecaptcha is already on window and onLoad
  // never fires again. Poll for it on mount so remounts still render.
  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY) return;
    if (window.grecaptcha?.enterprise) {
      setScriptReady(true);
      return;
    }
    const interval = setInterval(() => {
      if (window.grecaptcha?.enterprise) {
        setScriptReady(true);
        clearInterval(interval);
      }
    }, 200);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY || !scriptReady) return;
    if (!containerRef.current || widgetId.current !== null) return;
    if (!window.grecaptcha?.enterprise) return;

    window.grecaptcha.enterprise.ready(() => {
      if (!containerRef.current || widgetId.current !== null) return;
      widgetId.current = window.grecaptcha!.enterprise.render(containerRef.current, {
        sitekey: RECAPTCHA_SITE_KEY,
        callback: (token: string) => onChange(token),
        'expired-callback': () => onChange(''),
      });
    });
    // onChange is expected to be a stable setState updater from the caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptReady]);

  if (!RECAPTCHA_SITE_KEY) return null;

  return (
    <>
      <Script
        src="https://www.google.com/recaptcha/enterprise.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />
      <div className={className}>
        <div ref={containerRef} />
      </div>
    </>
  );
});

export default Recaptcha;
