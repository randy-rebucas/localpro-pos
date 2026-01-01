'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { useAuth } from '@/contexts/AuthContext';
import QRCodeDisplay from '@/components/QRCodeDisplay';

interface User {
  _id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'manager' | 'cashier' | 'viewer';
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
  hasPIN?: boolean;
  qrToken?: string;
}

export default function UsersPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showPINModal, setShowPINModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const { user: currentUser } = useAuth();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchUsers();
  }, [lang, tenant]);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setUsers(data.data);
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: data.error || dict?.common?.failedToFetchUsers || 'Failed to fetch users' });
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      setMessage({ type: 'error', text: dict?.common?.failedToFetchUsers || 'Failed to fetch users' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!dict) return;
    if (!confirm(dict.common?.deleteUserConfirm || 'Are you sure you want to delete this user?')) return;
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: dict?.admin?.userDeletedSuccess || dict?.common?.userDeletedSuccess || 'User deleted successfully' });
        fetchUsers();
      } else {
        setMessage({ type: 'error', text: data.error || dict?.admin?.failedToDeleteUser || dict?.common?.failedToDeleteUser || 'Failed to delete user' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: dict?.admin?.failedToDeleteUser || dict?.common?.failedToDeleteUser || 'Failed to delete user' });
    }
  };

  const handleToggleUserStatus = async (user: User) => {
    try {
      const res = await fetch(`/api/users/${user._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `User ${!user.isActive ? (dict?.admin?.activated || 'activated') : (dict?.admin?.deactivated || 'deactivated')} ${dict?.admin?.successfully || 'successfully'}` });
        fetchUsers();
      } else {
        setMessage({ type: 'error', text: data.error || dict?.common?.failedToUpdateUser || 'Failed to update user' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: dict?.common?.failedToUpdateUser || 'Failed to update user' });
    }
  };

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {dict.admin?.users || 'Users'}
              </h1>
              <p className="text-gray-600">{dict.admin?.usersSubtitle || 'Manage system users and their permissions'}</p>
            </div>
            <button
              onClick={() => router.push(`/${tenant}/${lang}/admin`)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
            >
              {dict.common?.back || 'Back'}
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white border border-gray-300 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">{dict.admin?.users || 'Users'}</h2>
            <button
              onClick={() => {
                setEditingUser(null);
                setShowUserModal(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 font-medium border border-blue-700"
            >
              {dict.common?.add || 'Add'} {dict.admin?.user || 'User'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.name || 'Name'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.email || 'Email'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.role || 'Role'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.status || 'Status'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PIN/QR</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.common?.actions || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user._id}>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.name}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{user.email}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-semibold border border-blue-300 bg-blue-100 text-blue-800 capitalize">
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold border ${user.isActive ? 'bg-green-100 text-green-800 border-green-300' : 'bg-red-100 text-red-800 border-red-300'}`}>
                        {user.isActive ? (dict.admin?.active || 'Active') : (dict.admin?.inactive || 'Inactive')}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingUser(user);
                            setShowPINModal(true);
                          }}
                          className="text-purple-600 hover:text-purple-900 text-xs"
                          title={dict?.admin?.managePIN || 'Manage PIN'}
                        >
                          PIN
                        </button>
                        <button
                          onClick={() => {
                            setEditingUser(user);
                            setShowQRModal(true);
                          }}
                          className="text-indigo-600 hover:text-indigo-900 text-xs"
                          title={dict?.admin?.viewQRCode || 'View QR Code'}
                        >
                          QR
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingUser(user);
                            setShowUserModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          {dict.common?.edit || 'Edit'}
                        </button>
                        <button
                          onClick={() => handleToggleUserStatus(user)}
                          className={user.isActive ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'}
                        >
                          {user.isActive ? (dict.admin?.deactivate || 'Deactivate') : (dict.admin?.activate || 'Activate')}
                        </button>
                        {currentUser?._id !== user._id && (
                          <button
                            onClick={() => handleDeleteUser(user._id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            {dict.common?.delete || 'Delete'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && (
              <div className="text-center py-8 text-gray-500">{dict.common?.noResults || 'No users found'}</div>
            )}
          </div>
        </div>

        {showUserModal && (
          <UserModal
            user={editingUser}
            onClose={() => {
              setShowUserModal(false);
              setEditingUser(null);
            }}
            onSave={() => {
              fetchUsers();
              setShowUserModal(false);
              setEditingUser(null);
            }}
            dict={dict}
          />
        )}

        {showPINModal && editingUser && (
          <PINModal
            user={editingUser}
            onClose={() => {
              setShowPINModal(false);
              setEditingUser(null);
            }}
            onSave={() => {
              fetchUsers();
              setShowPINModal(false);
              setEditingUser(null);
            }}
            dict={dict}
          />
        )}

        {showQRModal && editingUser && (
          <QRModal
            user={editingUser}
            onClose={() => {
              setShowQRModal(false);
              setEditingUser(null);
            }}
            onRegenerate={() => {
              fetchUsers();
            }}
            dict={dict}
          />
        )}
      </div>
    </div>
  );
}

function UserModal({
  user,
  onClose,
  onSave,
  dict,
}: {
  user: User | null;
  onClose: () => void;
  onSave: () => void;
  dict: any;
}) {
  const [formData, setFormData] = useState({
    email: user?.email || '',
    name: user?.name || '',
    password: '',
    role: user?.role || 'cashier',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const url = user ? `/api/users/${user._id}` : '/api/users';
      const method = user ? 'PUT' : 'POST';
      const body: any = {
        email: formData.email,
        name: formData.name,
        role: formData.role,
      };
      if (!user || formData.password) {
        body.password = formData.password;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        onSave();
      } else {
        setError(data.error || 'Failed to save user');
      }
    } catch (error) {
      setError('Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {user ? (dict.admin?.editUser || 'Edit User') : (dict.admin?.addUser || 'Add User')}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.email || 'Email'}
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.name || 'Name'}
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.password || 'Password'} {user && '(leave blank to keep current)'}
              </label>
              <input
                type="password"
                required={!user}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.role || 'Role'}
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="viewer">Viewer</option>
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            {error && (
              <div className="bg-red-50 text-red-800 border border-red-300 p-3">
                {error}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white"
              >
                {dict.common?.cancel || 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 border border-blue-700"
              >
                {saving ? (dict.common?.loading || 'Saving...') : (dict.common?.save || 'Save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function PINModal({
  user,
  onClose,
  onSave,
  dict,
}: {
  user: User;
  onClose: () => void;
  onSave: () => void;
  dict: any;
}) {
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);

  const handleSetPIN = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!pin || !/^\d{4,8}$/.test(pin)) {
      setError('PIN must be 4-8 digits');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user._id}/pin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pin }),
      });

      const data = await res.json();
      if (data.success) {
        onSave();
      } else {
        setError(data.error || 'Failed to set PIN');
      }
    } catch (error) {
      setError('Failed to set PIN');
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePIN = async () => {
    if (!dict) return;
    if (!confirm(dict.common?.removePINConfirm || dict.admin?.removePINConfirm || 'Are you sure you want to remove the PIN for this user?')) return;
    
    setRemoving(true);
    setError('');
    try {
      const res = await fetch(`/api/users/${user._id}/pin`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        onSave();
      } else {
        setError(data.error || 'Failed to remove PIN');
      }
    } catch (error) {
      setError('Failed to remove PIN');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-md w-full">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Manage PIN for {user.name}
          </h2>
          <form onSubmit={handleSetPIN} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PIN (4-8 digits)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{4,8}"
                maxLength={8}
                value={pin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  if (value.length <= 8) setPin(value);
                }}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 text-center text-2xl font-mono tracking-widest bg-white"
                placeholder="0000"
                required
              />
            </div>
            {error && (
              <div className="bg-red-50 text-red-800 border border-red-300 p-3">
                {error}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={handleRemovePIN}
                disabled={removing}
                className="px-4 py-2 border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 bg-white"
              >
                {removing ? 'Removing...' : 'Remove PIN'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white"
              >
                {dict.common?.cancel || 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 border border-blue-700"
              >
                {saving ? 'Saving...' : 'Set PIN'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function QRModal({
  user,
  onClose,
  onRegenerate,
  dict,
}: {
  user: User;
  onClose: () => void;
  onRegenerate: () => void;
  dict: any;
}) {
  const [qrData, setQrData] = useState<{ qrToken: string; name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchQRCode();
  }, [user._id]);

  const fetchQRCode = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/users/${user._id}/qr-code`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setQrData(data.data);
      } else {
        setError(data.error || 'Failed to load QR code');
      }
    } catch (error) {
      setError('Failed to load QR code');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!dict) return;
    if (!confirm(dict.common?.regenerateQRConfirm || dict.admin?.regenerateQRConfirm || 'Are you sure you want to regenerate the QR code? The old QR code will no longer work.')) return;
    
    setRegenerating(true);
    setError('');
    try {
      const res = await fetch(`/api/users/${user._id}/qr-code`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setQrData({ ...qrData!, qrToken: data.data.qrToken });
        onRegenerate();
      } else {
        setError(data.error || 'Failed to regenerate QR code');
      }
    } catch (error) {
      setError('Failed to regenerate QR code');
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white border border-gray-300 p-6">
          <div className="text-center">
            <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading QR code...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
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

