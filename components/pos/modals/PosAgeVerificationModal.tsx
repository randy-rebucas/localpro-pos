'use client';

export interface PosAgeVerificationProduct {
  name: string;
}

export interface PosAgeVerificationModalProps {
  product: PosAgeVerificationProduct;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function PosAgeVerificationModal({
  product,
  onCancel,
  onConfirm,
}: PosAgeVerificationModalProps) {
  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border-2 border-red-500 w-full max-w-sm shadow-2xl animate-fade-in">
        <div className="bg-red-500 px-6 py-4 flex items-center gap-3">
          <svg className="w-7 h-7 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-lg font-bold text-white">Age Verification Required</h2>
        </div>
        <div className="px-6 py-5">
          <p className="text-gray-800 font-medium mb-1">{product.name}</p>
          <p className="text-gray-600 text-sm mb-5">
            This item may be an age-restricted product. Please verify the customer is <strong>18 years of age or older</strong> before proceeding.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3 min-h-[48px] border-2 border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="flex-1 py-3 min-h-[48px] bg-red-600 text-white hover:bg-red-700 font-semibold transition-colors border border-red-700"
            >
              Confirmed — Add Item
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
