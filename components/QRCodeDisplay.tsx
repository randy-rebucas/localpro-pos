'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

interface QRCodeDisplayProps {
  qrToken: string;
  name?: string;
  onRegenerate?: () => void;
}

export default function QRCodeDisplay({ qrToken, name, onRegenerate }: QRCodeDisplayProps) {
  const params = useParams();
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(qrToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center space-y-4 p-6 bg-white border-2 border-gray-300">
      {name && (
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900">{name}</h3>
          <p className="text-sm text-gray-600">{dict?.components?.qrCodeDisplay?.scanQRCodeToLogin || 'Scan this QR code to log in'}</p>
        </div>
      )}
      
      <div className="p-4 bg-white border-2 border-gray-300">
        <QRCodeSVG
          value={qrToken}
          size={200}
          level="M"
          includeMargin={true}
        />
      </div>

      <div className="w-full space-y-2">
        <button
          onClick={copyToClipboard}
          className="w-full px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors border border-blue-300"
        >
          {copied ? (dict?.components?.qrCodeDisplay?.copied || '✓ Copied!') : (dict?.components?.qrCodeDisplay?.copyToken || 'Copy Token')}
        </button>
        
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            className="w-full px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-300"
          >
            {dict?.components?.qrCodeDisplay?.regenerateQRCode || 'Regenerate QR Code'}
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500 text-center max-w-xs">
        {dict?.components?.qrCodeDisplay?.keepSecure || 'Keep this QR code secure. Anyone with access to it can log in as you.'}
      </p>
    </div>
  );
}

