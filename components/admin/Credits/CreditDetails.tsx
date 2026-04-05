'use client';

import Currency from '@/components/Currency';

interface Customer {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  creditBalance?: number;
}

interface CreditDetailsProps {
  selectedCustomer: Customer | null;
  creditHistory: Array<{
    _id: string;
    type: 'top_up' | 'usage' | 'refund' | 'adjustment';
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    reason?: string;
    transactionId?: string;
    createdBy?: string;
    createdAt: string;
  }>;
  loading: boolean;
  primaryColor: string;
  onAddCredit: () => void;
  onAdjustCredit: () => void;
  onRefundCredit: () => void;
}

export function CreditDetails({
  selectedCustomer,
  creditHistory,
  loading,
  primaryColor,
  onAddCredit,
  onAdjustCredit,
  onRefundCredit,
}: CreditDetailsProps) {
  if (!selectedCustomer) {
    return (
      <div className="bg-white border border-gray-300 p-12 text-center h-96 flex items-center justify-center">
        <div>
          <svg
            className="w-16 h-16 mx-auto text-gray-300 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-gray-600 font-medium text-lg">Select a customer</p>
          <p className="text-gray-500 text-sm mt-2">
            Choose from the list to view and manage their credits
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <div className="bg-white border border-gray-300 p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {selectedCustomer.firstName} {selectedCustomer.lastName}
          </h2>
          <div className="space-y-1 text-sm text-gray-600">
            {selectedCustomer.email && <div>Email: {selectedCustomer.email}</div>}
            {selectedCustomer.phone && <div>Phone: {selectedCustomer.phone}</div>}
          </div>
        </div>

        {/* Balance Box */}
        <div
          className="bg-gradient-to-r p-6 rounded-lg mb-6 text-white"
          style={{
            backgroundImage: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)`,
          }}
        >
          <div className="text-sm font-medium opacity-90">Current Credit Balance</div>
          <div className="text-4xl font-bold mt-2">
            <Currency amount={selectedCustomer.creditBalance || 0} />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={onAddCredit}
            className="px-4 py-3 border-2 text-sm font-semibold transition-colors rounded-md text-white"
            style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = `${primaryColor}dd`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = primaryColor;
            }}
          >
            + Add Credits
          </button>
          <button
            onClick={onAdjustCredit}
            className="px-4 py-3 border-2 border-gray-300 text-sm font-semibold transition-colors rounded-md text-gray-700 hover:bg-gray-50"
          >
            Adjust
          </button>
          <button
            onClick={onRefundCredit}
            className="px-4 py-3 border-2 border-red-300 text-sm font-semibold transition-colors rounded-md text-red-700 hover:bg-red-50"
          >
            Refund
          </button>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-white border border-gray-300 p-6 flex flex-col">
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          Credit Transaction History
        </h3>
        {loading ? (
          <div className="space-y-3 flex-1">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-4 bg-gray-50 rounded-lg space-y-2">
                <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3"></div>
                <div className="h-3 bg-gray-200 rounded animate-pulse w-1/3"></div>
                <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2"></div>
              </div>
            ))}
          </div>
        ) : creditHistory.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center text-gray-500 py-12">
            <div>
              <svg
                className="w-12 h-12 mx-auto text-gray-300 mb-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm font-medium mt-2">No transactions yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Credits will appear here after any transactions
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto flex-1">
            {creditHistory.map((transaction) => (
              <div
                key={transaction._id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                role="article"
                aria-label={`${transaction.type} of ${transaction.amount}`}
              >
                <div className="flex-1">
                  <div className="font-semibold text-gray-900 capitalize flex items-center gap-2">
                    {transaction.type === 'usage' || transaction.type === 'refund' ? (
                      <span className="inline-flex items-center justify-center w-6 h-6 bg-red-100 rounded-full">
                        <svg
                          className="w-4 h-4 text-red-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 14l-7 7m0 0l-7-7m7 7V3"
                          />
                        </svg>
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center w-6 h-6 bg-green-100 rounded-full">
                        <svg
                          className="w-4 h-4 text-green-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 10l7-7m0 0l7 7m-7-7v18"
                          />
                        </svg>
                      </span>
                    )}
                    {transaction.type.replace(/_/g, ' ')}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(transaction.createdAt).toLocaleDateString()} at{' '}
                    {new Date(transaction.createdAt).toLocaleTimeString()}
                  </div>
                  {transaction.reason && (
                    <div className="text-sm text-gray-600 mt-2 p-2 bg-gray-50 rounded">
                      {transaction.reason}
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <div
                    className={`text-lg font-bold ${
                      transaction.type === 'usage' || transaction.type === 'refund'
                        ? 'text-red-600'
                        : 'text-green-600'
                    }`}
                  >
                    {transaction.type === 'usage' || transaction.type === 'refund'
                      ? '−'
                      : '+'}
                    <Currency amount={transaction.amount} />
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Balance:
                    <br />
                    <Currency amount={transaction.balanceAfter} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
