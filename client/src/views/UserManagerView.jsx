import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserPlus, Shield, UserCheck, UserX, X, Users, AlertTriangle, KeyRound, Lock, CheckCircle2, Edit2, UserCog } from 'lucide-react';

export function UserManagerView() {
  const { authFetch, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create User Modal State
  const [showModal, setShowModal] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('CASHIER');

  // Edit User Modal State
  const [editModalUser, setEditModalUser] = useState(null);
  const [editUsername, setEditUsername] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState('CASHIER');
  const [editLoading, setEditLoading] = useState(false);

  // Reset Password Modal State
  const [resetModalUser, setResetModalUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [successToast, setSuccessToast] = useState('');

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!username || !password || !fullName) return;

    try {
      const res = await authFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          username: username.trim(),
          password: password,
          full_name: fullName.trim(),
          role: role
        })
      });

      if (res.ok) {
        setShowModal(false);
        setUsername('');
        setPassword('');
        setFullName('');
        setRole('CASHIER');
        setSuccessToast('Staff account created successfully!');
        setTimeout(() => setSuccessToast(''), 3000);
        loadUsers();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to create staff member');
      }
    } catch (err) {
      alert('Error creating user: ' + err.message);
    }
  };

  const openEditModal = (userItem) => {
    setEditModalUser(userItem);
    setEditUsername(userItem.username);
    setEditFullName(userItem.full_name);
    setEditRole(userItem.role);
  };

  const handleEditUserSubmit = async (e) => {
    e.preventDefault();
    if (!editModalUser || !editUsername.trim() || !editFullName.trim()) return;

    try {
      setEditLoading(true);
      const res = await authFetch(`/api/users/${editModalUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          username: editUsername.trim(),
          full_name: editFullName.trim(),
          role: editRole
        })
      });

      if (res.ok) {
        setEditModalUser(null);
        setSuccessToast(`Staff profile for "${editFullName.trim()}" updated successfully!`);
        setTimeout(() => setSuccessToast(''), 3000);
        loadUsers();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to update user profile');
      }
    } catch (err) {
      alert('Error updating user: ' + err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleToggleStatus = async (userItem) => {
    if (userItem.id === currentUser.id) {
      alert('You cannot deactivate your own account!');
      return;
    }

    const nextStatus = userItem.is_active === 1 ? 0 : 1;
    const actionName = nextStatus === 0 ? 'DEACTIVATE' : 'ACTIVATE';

    if (!confirm(`Are you sure you want to ${actionName} user "${userItem.username}"?`)) {
      return;
    }

    try {
      const res = await authFetch(`/api/users/${userItem.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: nextStatus })
      });

      if (res.ok) {
        setSuccessToast(`Staff status updated successfully`);
        setTimeout(() => setSuccessToast(''), 3000);
        loadUsers();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to update user status');
      }
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!resetModalUser || !newPassword || newPassword.length < 6) {
      alert('Please enter a valid password (at least 6 characters)');
      return;
    }

    try {
      setResetLoading(true);
      const res = await authFetch(`/api/users/${resetModalUser.id}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ new_password: newPassword.trim() })
      });

      if (res.ok) {
        setResetModalUser(null);
        setNewPassword('');
        setSuccessToast(`Password for ${resetModalUser.username} successfully updated!`);
        setTimeout(() => setSuccessToast(''), 3500);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to reset password');
      }
    } catch (err) {
      alert('Reset Password Error: ' + err.message);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      
      {/* Toast */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <span>Staff & User Management</span>
          </h2>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 transition-all self-start"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Staff Account</span>
        </button>
      </div>

      {/* Users List Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm font-semibold">Loading staff members...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5">Full Name</th>
                  <th className="px-5 py-3.5">Username</th>
                  <th className="px-5 py-3.5">Role</th>
                  <th className="px-5 py-3.5">Active Status</th>
                  <th className="px-5 py-3.5">Created Date</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const isSelf = u.id === currentUser.id;
                  const isActive = u.is_active === 1;

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-4 font-bold text-slate-900 flex items-center gap-2">
                        <span>{u.full_name}</span>
                        {isSelf && (
                          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded font-bold border border-blue-200">
                            (You)
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 font-mono text-slate-600">@{u.username}</td>
                      <td className="px-5 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          u.role === 'OWNER'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {u.role_name || u.role}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {isActive ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                          <span>{isActive ? 'ACTIVE' : 'DEACTIVATED'}</span>
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-500 font-medium">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4 text-right space-x-2">
                        {/* Edit User Button */}
                        <button
                          onClick={() => openEditModal(u)}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 border border-slate-200 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                          <span>Edit</span>
                        </button>

                        {/* Reset Password Button */}
                        <button
                          onClick={() => {
                            setResetModalUser(u);
                            setNewPassword('');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 border border-slate-200 transition-colors"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-blue-600" />
                          <span>Reset Password</span>
                        </button>

                        {/* Status Toggle Button */}
                        {!isSelf ? (
                          <button
                            onClick={() => handleToggleStatus(u)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1 ${
                              isActive
                                ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200'
                            }`}
                          >
                            {isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Owner</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-4">Create Staff Account</h3>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. cashier2"
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter login password"
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none font-medium"
                >
                  <option value="CASHIER">CASHIER (Billing POS only)</option>
                  <option value="MANAGER">MANAGER (Billing, voids, catalog, reports)</option>
                  <option value="OWNER">OWNER (Full access incl. users &amp; settings)</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md"
                >
                  Create Staff
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editModalUser && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setEditModalUser(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-blue-600 mb-2">
              <UserCog className="w-5 h-5" />
              <h3 className="text-lg font-bold text-slate-900">Edit Staff Profile</h3>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Update username, display name, and role permissions for <strong>{editModalUser.full_name}</strong>.
            </p>

            <form onSubmit={handleEditUserSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  placeholder="e.g. cashier2"
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Role Permission
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none font-medium"
                >
                  <option value="CASHIER">CASHIER (Billing POS only)</option>
                  <option value="MANAGER">MANAGER (Billing, voids, catalog, reports)</option>
                  <option value="OWNER">OWNER (Full access incl. users &amp; settings)</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={editLoading}
                  onClick={() => setEditModalUser(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>{editLoading ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetModalUser && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setResetModalUser(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-blue-600 mb-2">
              <KeyRound className="w-5 h-5" />
              <h3 className="text-lg font-bold text-slate-900">Reset Employee Password</h3>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Set a new secure password for <strong>{resetModalUser.full_name}</strong> (@{resetModalUser.username}).
            </p>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min 4 chars)"
                    className="w-full bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-slate-900 outline-none font-medium"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={resetLoading}
                  onClick={() => setResetModalUser(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{resetLoading ? 'Updating...' : 'Set New Password'}</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
