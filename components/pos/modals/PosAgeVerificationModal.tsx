'use client';

export interface PosAgeVerificationProduct {
  name: string;
}

export interface PosAgeVerificationModalProps {
  dictValue: (path: string, fallback?: string) => string;
  product: PosAgeVerificationProduct;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function PosAgeVerificationModal({
  dictValue,
  product,
  onCancel,
  onConfirm,
}: PosAgeVerificationModalProps) {
  return (
    <div className="fixed inset-0 bg-ink/70 z-50 flex items-center justify-center p-4">
      <div className="bg-paper-white text-ink w-full max-w-sm p-6 animate-fade-in">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="text-4xl text-ink">{dictValue('pos.ageVerificationTitle', 'Age Verification Required')}</h2>
          <span
            className="mk-stamp shrink-0 border-4 border-stamp px-2 py-1 font-display text-3xl font-extrabold leading-none text-stamp"
            aria-hidden
          >
            18+
          </span>
        </div>
        <div className="border-t border-dashed border-ink/30 pt-4">
          <p className="text-ink font-semibold mb-1">{product.name}</p>
          <p className="text-ink/70 text-sm mb-5">
            {dictValue('pos.ageVerificationIntro', 'This item may be an age-restricted product. Please verify the customer is')}{' '}
            <strong>{dictValue('pos.ageVerificationAge', '18 years of age or older')}</strong>{' '}
            {dictValue('pos.ageVerificationOutro', 'before proceeding.')}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3 min-h-[48px] border border-ink/25 text-ink hover:border-ink font-receipt text-xs font-medium uppercase transition-colors"
            >
              {dictValue('common.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="flex-1 px-2 py-3 min-h-[48px] bg-ink text-paper-white hover:bg-brand-navy font-receipt font-medium uppercase transition-colors text-xs"
            >
              {dictValue('pos.ageConfirmAdd', 'Confirmed — Add Item')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
