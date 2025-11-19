'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface QRCodeDisplayProps {
  qrToken: string;
  name?: string;
  onRegenerate?: () => void;
}

export default function QRCodeDisplay({ qrToken, name, onRegenerate }: QRCodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(qrToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center space-y-4 p-6 bg-white rounded-lg border-2 border-gray-200">
      {name && (
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900">{name}</h3>
          <p className="text-sm text-gray-600">Scan this QR code to log in</p>
        </div>
      )}
      
      <div className="p-4 bg-white rounded-lg border-2 border-gray-300">
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
          className="w-full px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
        >
          {copied ? '✓ Copied!' : 'Copy Token'}
        </button>
        
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            className="w-full px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Regenerate QR Code
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500 text-center max-w-xs">
        Keep this QR code secure. Anyone with access to it can log in as you.
      </p>
    </div>
  );
}

