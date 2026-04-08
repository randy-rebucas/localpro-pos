'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminNavBar from '@/components/AdminNavBar';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { getDictionaryClient } from '../../dictionaries-client';
import { useAuth } from '@/contexts/AuthContext';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import { useConfirm } from '@/lib/confirm';
import { useUsersList, type User } from '@/hooks/useUsersList';
import { useUserForm } from '@/hooks/useUserForm';
import { useQrCode } from '@/hooks/useQrCode';
import {
  getRoleLabel,
  getStatusClasses,
  getStatusLabel,
  getToggleActionLabel,
  getToggleActionClasses,
  getDeleteConfirmMessage,
  getRegenerateQRConfirmMessage,
  USER_ROLES,
} from '@/lib/users-helpers';

export default function UsersPage() {
  const params = useParams();
  const router = useRouter(); // eslint-disable-line @typescript-eslint/no-unused-vars
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';

  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showUserModal, setShowUserModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const { user: currentUser } = useAuth();
  const { confirm, Dialog: ConfirmDialog } = useConfirm();
  const { users, loading, fetchUsers } = useUsersList();
  const { deleteUser, toggleUserStatus } = useUsersList();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchUsers((error) => toast.error(error));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  const handleDeleteUser = useCallback(
    async (userId: string) => {
      if (!dict) return;

      const { title, message } = getDeleteConfirmMessage(dict);
      const confirmed = await confirm(title, message, { variant: 'danger' });
      if (!confirmed) return;

      await deleteUser(
        userId,
        (message) => {
          toast.success(message);
        },
        (error) => toast.error(error)
      );
    },
    [dict, deleteUser, confirm]
  );

  const handleToggleUserStatus = useCallback(
    async (user: User) => {
      await toggleUserStatus(
        user,
        (message) => {
          toast.success(message);
        },
        (error) => toast.error(error)
      );
    },
    [toggleUserStatus]
  );

  if (!dict || loading) {
    return (
      <div className="bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50">
      {ConfirmDialog}
      <AdminNavBar />
      <div className="px-6 py-5">
        <div className="mb-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-1">
                {dict.admin?.users || 'Users'}
              </h1>
              <p className="text-gray-600">{dict.admin?.usersSubtitle || 'Manage system users and their permissions'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 p-5">
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">QR</th>
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
                        {getRoleLabel(user.role, dict)}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold border ${getStatusClasses(user.isActive)}`}>
                        {getStatusLabel(user.isActive, dict)}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
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
                          className={getToggleActionClasses(user.isActive)}
                        >
                          {getToggleActionLabel(user.isActive, dict)}
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
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const { formData, setFormData, saving, error, handleSubmit: submitForm } = useUserForm(user);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitForm(
      () => {
        onSave();
      },
      () => {
        // Error already displayed via toast from hook
      }
    );
  };

  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
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
                onChange={(e) => setFormData({ ...formData, role: e.target.value as any })} // eslint-disable-line @typescript-eslint/no-explicit-any
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {USER_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {getRoleLabel(role.value, dict)}
                  </option>
                ))}
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

function QRModal({
  user,
  onClose,
  onRegenerate,
  dict,
}: {
  user: User;
  onClose: () => void;
  onRegenerate: () => void;
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const { qrData, loading, regenerating, error, fetchQRCode, regenerateQRCode } = useQrCode(user._id);
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
        <div className="bg-white border border-gray-200 p-5">
          <div className="text-center">
            <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">{dict?.admin?.loadingQRCode || 'Loading QR code...'}</p>
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
          <h2 className="text-xl font-bold text-gray-900 mb-4">
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

