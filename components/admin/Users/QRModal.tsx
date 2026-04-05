'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import { getRegenerateQRConfirmMessage } from '@/lib/users-helpers';
import { useQrCode } from '@/hooks/useQrCode';
import { useConfirm } from '@/lib/confirm';
import { type User } from '@/hooks/useUsersList';

interface QRModalProps {
  user: User;
  onClose: () => void;
  onRegenerate: () => void;
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function QRModal({ user, onClose, onRegenerate, dict }: QRModalProps) {
  const { qrData, loading, regenerating, error, fetchQRCode, regenerateQRCode } =
    useQrCode(user._id);
  const { confirm, Dialog } = useConfirm();

  useEffect(() => {
    fetchQRCode((error) => toast.error(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user._id]);

  const handleRegenerate = async () => {
    if (!dict) return;

    const { title, message } = getRegenerateQRConfirmMessage(dict);
    const confirmed = await confirm(title, message, { variant: 'warning' });
    if (!confirmed) return;

    await regenerateQRCode(
      () => {
        onRegenerate();
        toast.success('QR code regenerated successfully');
      },
      (error) => toast.error(error)
    );
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white border border-gray-300 p-6">
          <div className="text-center">
            <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">
              {dict?.admin?.loadingQRCode || 'Loading QR code...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      {Dialog}
      <div className="bg-white border border-gray-300 max-w-md w-full">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            QR Code for {user.name}
          </h2>
          {error && (
            <div className="bg-red-50 text-red-800 border border-red-300 p-3 mb-4">
              {error}
            </div>
          )}
          {qrData && (
            <div className="space-y-4">
              <div className="flex justify-center p-4 bg-gray-50 border border-gray-300">
                <QRCodeDisplay qrToken={qrData.qrToken} name={qrData.name} />
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="px-4 py-2 border border-orange-300 text-orange-700 hover:bg-orange-50 disabled:opacity-50 bg-white"
                >
                  {regenerating ? 'Regenerating...' : 'Regenerate QR Code'}
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 border border-blue-700"
                >
                  {dict.common?.close || 'Close'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
