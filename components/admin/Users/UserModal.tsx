'use client';

import { useUserForm, type User } from '@/hooks/useUserForm';
import { getRoleLabel, USER_ROLES } from '@/lib/users-helpers';

interface UserModalProps {
  user: User | null;
  onClose: () => void;
  onSave: () => void;
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function UserModal({ user, onClose, onSave, dict }: UserModalProps) {
  const { formData, setFormData, saving, error, handleSubmit: submitForm } =
    useUserForm(user);

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
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {user
              ? dict.admin?.editUser || 'Edit User'
              : dict.admin?.addUser || 'Add User'}
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
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
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
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.password || 'Password'}{' '}
                {user && '(leave blank to keep current)'}
              </label>
              <input
                type="password"
                required={!user}
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.role || 'Role'}
              </label>
              <select
                value={formData.role}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    role: e.target.value as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                  })
                }
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
                {saving
                  ? dict.common?.loading || 'Saving...'
                  : dict.common?.save || 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
