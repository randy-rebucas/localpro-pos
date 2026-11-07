'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';

interface QRCodeDisplayProps {
  qrToken: string;
  name?: string;
  onRegenerate?: () => void;
  /** Drops the frame and uses the paper-slip keys, for use inside a slip or staff card. */
  embedded?: boolean;
}

const EMBEDDED_KEY = 'flex min-h-[44px] w-full items-center justify-center px-2 font-receipt text-xs font-medium uppercase transition-colors touch-manipulation';

export default function QRCodeDisplay({ qrToken, name, onRegenerate, embedded = false }: QRCodeDisplayProps) {
  const params = useParams();
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [copied, setCopied] = useState(false);
  const { settings } = useTenantSettings();
  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#35979c';

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(qrToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyLabel = copied
    ? (dict?.components?.qrCodeDisplay?.copied || '✓ Copied!')
    : (dict?.components?.qrCodeDisplay?.copyToken || 'Copy Token');
  const regenerateLabel = dict?.components?.qrCodeDisplay?.regenerateQRCode || 'Regenerate QR Code';
  const keepSecure = dict?.components?.qrCodeDisplay?.keepSecure || 'Keep this QR code secure. Anyone with access to it can log in as you.';
  const code = <QRCodeSVG value={qrToken} size={200} level="M" includeMargin={true} />;

  if (embedded) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="border-2 border-ink bg-white p-1">{code}</div>
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" onClick={copyToClipboard} className={`${EMBEDDED_KEY} bg-ink text-paper-white hover:bg-brand-navy`}>
            {copyLabel}
          </button>
          {onRegenerate && (
            <button type="button" onClick={onRegenerate} className={`${EMBEDDED_KEY} border border-ink/25 text-ink hover:border-ink`}>
              {regenerateLabel}
            </button>
          )}
        </div>
        <p className="text-xs text-ink/60">{keepSecure}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center space-y-4 p-6 bg-white border-2 border-gray-300">
      {name && (
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900">{name}</h3>
          <p className="text-sm text-gray-600">{dict?.components?.qrCodeDisplay?.scanQRCodeToLogin || 'Scan this QR code to log in'}</p>
        </div>
      )}
      
      <div className="p-4 bg-white border-2 border-gray-300">
        {code}
      </div>

      <div className="w-full space-y-2">
        <button
          onClick={copyToClipboard}
          className="w-full px-4 py-2 text-sm font-medium transition-colors border"
          style={{
            color: primaryColor,
            backgroundColor: `${primaryColor}10`,
            borderColor: primaryColor
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${primaryColor}20`; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = `${primaryColor}10`; }}
        >
          {copyLabel}
        </button>
        
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            className="w-full px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-300"
          >
            {regenerateLabel}
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500 text-center max-w-xs">
        {keepSecure}
      </p>
    </div>
  );
}

