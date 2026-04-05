'use client';

import Currency from '@/components/Currency';

interface Transaction {
  _id: string;
  receiptNumber?: string;
  items: Array<{
    product: string | { name: string };
    name: string;
    price: number;
    quantity: number;
    subtotal: number;
  }>;
  subtotal: number;
  discountCode?: string;
  discountAmount?: number;
  total: number;
  paymentMethod:
    | 'cash'
    | 'card'
    | 'digital'
    | 'tap_to_pay'
    | 'wallet'
    | 'qr_code'
    | 'bnpl'
    | 'credit';
  cashReceived?: number;
  change?: number;
  status: 'completed' | 'cancelled' | 'refunded';
  userId?: string | { name: string; email: string };
  notes?: string;
  createdAt: string;
}

interface TransactionDetailModalProps {
  transaction: Transaction;
  onClose: () => void;
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function TransactionDetailModal({
  transaction,
  onClose,
  dict,
}: TransactionDetailModalProps) {
  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">
              {dict.admin?.transactionDetails || 'Transaction Details'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">
                  {dict.admin?.receiptNumber || 'Receipt Number'}
                </label>
                <div className="text-lg font-mono">
                  {transaction.receiptNumber || '-'}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">
                  {dict.transactions?.date || dict.admin?.date || 'Date'}
                </label>
                <div className="text-lg">
                  {new Date(transaction.createdAt).toLocaleString()}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">
                  {dict.admin?.status || 'Status'}
                </label>
                <div>
                  <span
                    className={`px-2 py-1 text-xs font-semibold border ${
                      transaction.status === 'completed'
                        ? 'bg-green-100 text-green-800 border-green-300'
                        : transaction.status === 'refunded'
                          ? 'bg-orange-100 text-orange-800 border-orange-300'
                          : 'bg-red-100 text-red-800 border-red-300'
                    }`}
                  >
                    {transaction.status === 'completed'
                      ? dict.transactions?.completed ||
                        dict.admin?.completed ||
                        'completed'
                      : transaction.status === 'cancelled'
                        ? dict.transactions?.cancelled ||
                          dict.admin?.cancelled ||
                          'cancelled'
                        : transaction.status === 'refunded'
                          ? dict.transactions?.refunded || 'refunded'
                          : transaction.status}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">
                  {dict.transactions?.payment || 'Payment Method'}
                </label>
                <div className="text-lg capitalize">{transaction.paymentMethod}</div>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500 mb-2 block">
                {dict.transactions?.items || 'Items'}
              </label>
              <div className="border border-gray-300 divide-y">
                {transaction.items.map((item, idx) => (
                  <div key={idx} className="p-3 flex justify-between">
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-sm text-gray-500">
                        Qty: {item.quantity} × <Currency amount={item.price} />
                      </div>
                    </div>
                    <div className="font-medium">
                      <Currency amount={item.subtotal} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">
                  {dict.admin?.subtotal || 'Subtotal'}:
                </span>
                <span className="font-medium">
                  <Currency amount={transaction.subtotal} />
                </span>
              </div>
              {transaction.discountAmount && (
                <div className="flex justify-between text-red-600">
                  <span>Discount ({transaction.discountCode}):</span>
                  <span>
                    -<Currency amount={transaction.discountAmount} />
                  </span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Total:</span>
                <span>
                  <Currency amount={transaction.total} />
                </span>
              </div>
              {transaction.paymentMethod === 'cash' &&
                transaction.cashReceived && (
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Cash Received:</span>
                    <span>
                      <Currency amount={transaction.cashReceived} />
                    </span>
                  </div>
                )}
              {transaction.paymentMethod === 'cash' &&
                transaction.change !== undefined && (
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Change:</span>
                    <span>
                      <Currency amount={transaction.change} />
                    </span>
                  </div>
                )}
            </div>
            {transaction.notes && (
              <div>
                <label className="text-sm font-medium text-gray-500 mb-1 block">
                  Notes
                </label>
                <div className="p-3 bg-gray-50 border border-gray-300">
                  {transaction.notes}
                </div>
              </div>
            )}
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-400"
            >
              {dict.common?.close || 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
