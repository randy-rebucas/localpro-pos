'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';

function CustomerDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { customer, guest, loading, isAuthenticated, isGuest, canAccess, logout } = useCustomerAuth();

  useEffect(() => {
    if (!loading && !canAccess) {
      router.push('/customer/login');
    }
  }, [loading, canAccess, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!canAccess) {
    return null;
  }

  const isGuestUser = isGuest && guest;
  const displayName = customer 
    ? `${customer.firstName} ${customer.lastName}` 
    : 'Guest';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Welcome{!isGuestUser ? `, ${customer?.firstName}!` : ''}!
              </h1>
              <p className="text-gray-600 mt-2">
                {isGuestUser ? 'Guest Mode - Browse products and services' : 'Customer Dashboard'}
              </p>
              {isGuestUser && (
                <div className="mt-2 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium inline-block">
                  Guest User
                </div>
              )}
            </div>
            <div className="flex gap-3">
              {isGuestUser && (
                <button
                  onClick={() => router.push(`/customer/login?tenant=${searchParams.get('tenant') || 'default'}`)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Sign In / Register
                </button>
              )}
              <button
                onClick={logout}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                {isGuestUser ? 'Exit Guest Mode' : 'Logout'}
              </button>
            </div>
          </div>

          {isGuestUser ? (
            /* Guest User View */
            <div className="space-y-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Guest Mode</h2>
                <p className="text-gray-700 mb-4">
                  You're browsing as a guest. Some features are limited:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 mb-4">
                  <li>Browse products and services</li>
                  <li>View business information</li>
                  <li>Limited functionality (no bookings or orders)</li>
                </ul>
                <button
                  onClick={() => router.push(`/customer/login?tenant=${searchParams.get('tenant') || 'default'}`)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Create Account or Sign In
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-blue-50 rounded-lg p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
                  <div className="space-y-3">
                    <button
                      onClick={() => router.push(`/customer/products?tenant=${searchParams.get('tenant') || 'default'}`)}
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-left"
                    >
                      Browse Products
                    </button>
                    <button
                      onClick={() => router.push(`/customer/services?tenant=${searchParams.get('tenant') || 'default'}`)}
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-left"
                    >
                      View Services
                    </button>
                  </div>
                </div>

                <div className="bg-green-50 rounded-lg p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Benefits of Creating an Account</h2>
                  <ul className="space-y-2 text-sm text-gray-700">
                    <li>✓ Make bookings and orders</li>
                    <li>✓ Track your purchase history</li>
                    <li>✓ Save addresses for faster checkout</li>
                    <li>✓ Receive order updates</li>
                    <li>✓ Access exclusive offers</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : customer ? (
            /* Authenticated Customer View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Customer Info Card */}
              <div className="bg-blue-50 rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h2>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-600">Name:</span>
                    <span className="ml-2 font-medium">
                      {customer.firstName} {customer.lastName}
                    </span>
                  </div>
                  {customer.email && (
                    <div>
                      <span className="text-gray-600">Email:</span>
                      <span className="ml-2 font-medium">{customer.email}</span>
                    </div>
                  )}
                  {customer.phone && (
                    <div>
                      <span className="text-gray-600">Phone:</span>
                      <span className="ml-2 font-medium">{customer.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Purchase History Card */}
              <div className="bg-green-50 rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Purchase History</h2>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-600">Total Spent:</span>
                    <span className="ml-2 font-medium text-green-700">
                      ${customer.totalSpent?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                  {customer.lastPurchaseDate && (
                    <div>
                      <span className="text-gray-600">Last Purchase:</span>
                      <span className="ml-2 font-medium">
                        {new Date(customer.lastPurchaseDate).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Account Status Card */}
              <div className="bg-purple-50 rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Status</h2>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-600">Status:</span>
                    <span className="ml-2 font-medium text-green-600">Active</span>
                  </div>
                  {customer.lastLogin && (
                    <div>
                      <span className="text-gray-600">Last Login:</span>
                      <span className="ml-2 font-medium">
                        {new Date(customer.lastLogin).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {/* Addresses Section - Only for authenticated customers */}
          {customer && customer.addresses && customer.addresses.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Saved Addresses</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {customer.addresses.map((address, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm space-y-1">
                      {address.street && <div>{address.street}</div>}
                      <div>
                        {address.city && <span>{address.city}, </span>}
                        {address.state && <span>{address.state} </span>}
                        {address.zipCode && <span>{address.zipCode}</span>}
                      </div>
                      {address.country && <div>{address.country}</div>}
                      {address.isDefault && (
                        <div className="text-blue-600 font-medium text-xs mt-2">Default Address</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags Section - Only for authenticated customers */}
          {customer && customer.tags && customer.tags.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Tags</h2>
              <div className="flex flex-wrap gap-2">
                {customer.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CustomerDashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <CustomerDashboardContent />
    </Suspense>
  );
}
