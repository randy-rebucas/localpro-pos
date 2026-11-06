'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Unset means Turnstile is off: the widget renders nothing and forms submit as usual. */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptLoad: Promise<void> | undefined;

function loadScript() {
  scriptLoad ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoad = undefined;
      script.remove();
      reject(new Error('Turnstile script failed to load'));
    };
    document.head.appendChild(script);
  });
  return scriptLoad;
}

export interface TurnstileHandle {
  /** Tokens are single-use, so call this after any submit the server rejected. */
  reset: () => void;
}

interface TurnstileWidgetProps {
  action: 'signup' | 'login' | 'super_admin_login';
  language?: string;
  errorMessage: string;
  onToken: (token: string | null) => void;
}

const TurnstileWidget = forwardRef<TurnstileHandle, TurnstileWidgetProps>(function TurnstileWidget({ action, language, errorMessage, onToken }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const latestOnToken = useRef(onToken);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    latestOnToken.current = onToken;
  });

  useImperativeHandle(ref, () => ({
    reset() {
      latestOnToken.current(null);
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
    },
  }));

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(container.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          language: language ?? 'auto',
          theme: 'light',
          size: 'flexible',
          callback: (token: string) => {
            setFailed(false);
            latestOnToken.current(token);
          },
          'expired-callback': () => latestOnToken.current(null),
          'timeout-callback': () => latestOnToken.current(null),
          'error-callback': () => {
            setFailed(true);
            latestOnToken.current(null);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = undefined;
      latestOnToken.current(null);
    };
  }, [action, language]);

  if (!TURNSTILE_SITE_KEY) return null;

  return (
    <div>
      <div ref={container} />
      {failed && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {errorMessage}
        </p>
      )}
    </div>
  );
});

export default TurnstileWidget;
