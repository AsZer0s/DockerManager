import React, { useState, useEffect } from 'react';
import {
  Users as UsersIcon,
  UserPlus,
  Trash2,
  Shield,
  User,
  Smartphone,
  Lock,
  X,
  Search,
  Server as ServerIcon // Added ServerIcon for permissions
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import ConfirmModal from '../components/ConfirmModal';
import { useApp } from '../hooks/useApp';
import { format } from 'date-fns'; // Import date-fns for date formatting

interface ServerData { // New interface for server data
  ID: number;
  name: string;
}

interface UserData {
  id: number; // Changed to lowercase 'id' to match backend JSON and useAuth interface
  username: string;
  role: string;
  telegram_id: number;
  last_login: string | null; // Add last_login field
}

const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { t } = useApp();
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userIdToDelete, setUserIdToDelete] = useState<number | null>(null);

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editTGID, setEditTGID] = useState('');
  const [editFormError, setEditFormError] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState('');

  // Permissions Modal State
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<UserData | null>(null);
  const [allServers, setAllServers] = useState<ServerData[]>([]);
  const [userServerPermissions, setUserServerPermissions] = useState<Record<number, string>>({}); // Map ServerID -> AccessLevel
  const [permissionsError, setPermissionsError] = useState('');

  // Form State
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [newTGID, setNewTGID] = useState('');
  const [formError, setFormError] = useState('');

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/users');
      setUsers(response.data);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditUser = (user: UserData) => {
    setEditingUser(user);
    setEditUsername(user.username);
    setEditRole(user.role);
    setEditTGID(user.telegram_id ? String(user.telegram_id) : '');
    setEditFormError('');
    setResetPassword('');
    setResetPasswordSuccess('');
    setShowEditModal(true);
  };

  const handleResetPassword = async () => {
    if (!editingUser || !resetPassword) return;
    setEditFormError('');
    setResetPasswordSuccess('');

    try {
      await api.put(`/users/${editingUser.id}/reset-password`, {
        new_password: resetPassword,
      });
      setResetPasswordSuccess(t('reset_password_success'));
      setResetPassword('');
    } catch (err: any) {
      setEditFormError(err.response?.data?.error || 'Failed to reset password');
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditFormError('');

    try {
      await api.put(`/users/${editingUser.id}`, {
        username: editUsername,
        role: editRole,
        telegram_id: editTGID ? parseInt(editTGID) : 0,
      });
      setShowEditModal(false);
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      setEditFormError(err.response?.data?.error || 'Failed to update user');
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    try {
      await api.post('/users', {
        username: newUsername,
        password: newPassword,
        role: newRole,
        telegram_id: newTGID ? parseInt(newTGID) : 0,
      });
      setShowAddModal(false);
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      setNewTGID('');
      fetchUsers();
    } catch (err: any) {
      setFormError(err.response?.data?.error || 'Failed to create user');
    }
  };

  const handleDeleteUser = (id: number) => {
    if (id === currentUser?.id) return;
    setUserIdToDelete(id);
    setDeleteModalOpen(true);
  };

  const confirmDeleteUser = async () => {
    if (!userIdToDelete) return;
    try {
      await api.delete(`/users/${userIdToDelete}`);
      setUserIdToDelete(null);
      setDeleteModalOpen(false);
      fetchUsers();
    } catch (err) {
      console.error('Failed to delete user:', err);
    }
  };

  const handleManagePermissions = async (user: UserData) => {
    if (user.role === 'admin') return; // Admins have all permissions
    setPermissionsUser(user);
    setPermissionsError('');
    try {
      const [serversRes, permissionsRes] = await Promise.all([
        api.get('/servers'),
        api.get(`/users/${user.id}/permissions`),
      ]);
      setAllServers(serversRes.data || []);

      const permissionsMap: Record<number, string> = {};
      (permissionsRes.data || []).forEach((p: any) => {
        permissionsMap[p.server_id] = p.access_level || 'read';
      });
      setUserServerPermissions(permissionsMap);
      setShowPermissionsModal(true);
    } catch (err) {
      console.error('Failed to fetch data for permissions:', err);
      setPermissionsError(t('no_servers_available'));
    }
  };

  const handlePermissionToggle = (serverID: number) => {
    setUserServerPermissions(prev => {
      const next = { ...prev };
      if (next[serverID]) {
        delete next[serverID];
      } else {
        next[serverID] = 'read'; // Default to read
      }
      return next;
    });
  };

  const handleAccessLevelChange = (serverID: number, level: string) => {
    setUserServerPermissions(prev => ({
      ...prev,
      [serverID]: level
    }));
  };

  const handleUpdatePermissions = async () => {
    if (!permissionsUser) return;
    try {
      const permissionsArray = Object.entries(userServerPermissions).map(([serverID, level]) => ({
        server_id: parseInt(serverID),
        access_level: level
      }));

      await api.put(`/users/${permissionsUser.id}/permissions`, {
        permissions: permissionsArray,
      });
      setShowPermissionsModal(false);
      setPermissionsUser(null);
    } catch (err: any) {
      setPermissionsError(err.response?.data?.error || t('failed_update_perms'));
    }
  };


  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">

      {/* Header Section */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800/50">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <UsersIcon className="w-6 h-6 text-emerald-400" />
            </div>
            {t('users')}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 ml-1">{t('user_mgmt_desc')}</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="group bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-zinc-950 font-bold py-2.5 px-5 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:-translate-y-0.5"
        >
          <UserPlus className="w-5 h-5 transition-transform group-hover:scale-110" />
          {t('add_new_user')}
        </button>
      </header>

      {/* Users Table Card */}
      <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-zinc-50 dark:bg-zinc-950/50 text-zinc-400 dark:text-zinc-500 text-xs uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800/50">{t('user_identity')}</th>
                <th className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800/50">{t('system_role')}</th>
                <th className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800/50">{t('tg_last_login')}</th>
                <th className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800/50 text-right">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/50">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-zinc-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                      <span className="text-sm">{t('loading_users')}</span>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-zinc-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <UsersIcon className="w-8 h-8 text-zinc-700" />
                      <p>{t('no_users_found')}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="group hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors duration-200">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-400 group-hover:border-emerald-500/30 group-hover:text-emerald-400 transition-colors shadow-sm">
                          <User className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="block font-medium text-zinc-900 dark:text-zinc-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors">
                            {user.username}
                          </span>
                          <span className="text-xs text-zinc-400 dark:text-zinc-500">ID: {user.id || (user as any).ID}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${user.role === 'admin'
                        ? 'bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-200 dark:border-purple-500/20'
                        : 'bg-zinc-100 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
                        }`}>
                        {user.role === 'admin' ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                        {user.role === 'admin' ? t('admin') : t('user')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5">
                        {user.telegram_id ? (
                          <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 font-mono text-xs bg-zinc-50 dark:bg-zinc-950/50 px-2 py-1 rounded w-fit border border-zinc-200 dark:border-zinc-800">
                            <Smartphone className="w-3 h-3 text-zinc-400 dark:text-zinc-500" />
                            {user.telegram_id}
                          </div>
                        ) : (
                          <span className="text-zinc-400 dark:text-zinc-600 text-xs italic">{t('no_tg_id')}</span>
                        )}
                        {user.last_login ? (
                          <span className="text-xs text-zinc-500">
                            {t('last_seen')}: {format(new Date(user.last_login), 'MMM d, yyyy HH:mm')}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-600 italic">{t('never_logged_in')}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEditUser(user)}
                        className="group/btn relative inline-flex items-center justify-center p-2 rounded-lg text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                        title={t('edit')}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                      </button>

                      {user.role !== 'admin' && (
                        <button
                          onClick={() => handleManagePermissions(user)}
                          className="group/btn relative inline-flex items-center justify-center p-2 rounded-lg text-zinc-500 hover:text-sky-400 hover:bg-sky-500/10 transition-all"
                          title={t('server_permissions')}
                        >
                          <ServerIcon className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        disabled={user.id === currentUser?.id}
                        className={`group/btn relative inline-flex items-center justify-center p-2 rounded-lg transition-all ${user.id === currentUser?.id
                          ? 'text-zinc-800 cursor-not-allowed opacity-30'
                          : 'text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10'
                          }`}
                        title={user.id === currentUser?.id ? t('cannot_delete_self') : t('delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal Overlay */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 ring-1 ring-black/5 dark:ring-white/10">

            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{t('add_new_user')}</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {formError && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-lg text-sm mb-6 flex items-start gap-2">
                  <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  {formError}
                </div>
              )}

              <form onSubmit={handleCreateUser} className="space-y-5">
                {/* Username Field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider ml-1">{t('username')}</label>
                  <div className="relative group">
                    <User className="absolute left-3 top-2.5 w-5 h-5 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      required
                      placeholder="jdoe"
                      className="w-full bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all shadow-sm"
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider ml-1">{t('password')}</label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-2.5 w-5 h-5 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="w-full bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all shadow-sm"
                    />
                  </div>
                </div>

                {/* Role Field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider ml-1">{t('role')}</label>
                  <div className="relative group">
                    <Shield className="absolute left-3 top-2.5 w-5 h-5 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all appearance-none cursor-pointer shadow-sm"
                    >
                      <option value="user">{t('user')}</option>
                      <option value="admin">{t('admin')}</option>
                    </select>
                    {/* Custom Arrow for Select */}
                    <div className="absolute right-3 top-3 pointer-events-none">
                      <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                  </div>
                </div>

                {/* Telegram ID Field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider ml-1">{t('tg_id_optional')}</label>
                  <div className="relative group">
                    <Smartphone className="absolute left-3 top-2.5 w-5 h-5 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                    <input
                      type="number"
                      value={newTGID}
                      onChange={(e) => setNewTGID(e.target.value)}
                      placeholder="e.g. 123456789"
                      className="w-full bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all shadow-sm"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-8 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors font-medium shadow-sm"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold py-2.5 px-4 rounded-xl transition-all shadow-lg shadow-emerald-500/20"
                  >
                    {t('create_user')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal Overlay */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 ring-1 ring-black/5 dark:ring-white/10">

            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{t('edit_user')}: {editingUser.username}</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {editFormError && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-lg text-sm mb-6 flex items-start gap-2">
                  <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  {editFormError}
                </div>
              )}

              <form onSubmit={handleUpdateUser} className="space-y-5">
                {/* Username Field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider ml-1">{t('username')}</label>
                  <div className="relative group">
                    <User className="absolute left-3 top-2.5 w-5 h-5 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                    <input
                      type="text"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      required
                      placeholder="username"
                      className="w-full bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all shadow-sm"
                    />
                  </div>
                </div>

                {/* Role Field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider ml-1">{t('role')}</label>
                  <div className="relative group">
                    <Shield className="absolute left-3 top-2.5 w-5 h-5 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all appearance-none cursor-pointer shadow-sm"
                    >
                      <option value="user">{t('user')}</option>
                      <option value="admin">{t('admin')}</option>
                    </select>
                    <div className="absolute right-3 top-3 pointer-events-none">
                      <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                  </div>
                </div>

                {/* Telegram ID Field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider ml-1">{t('tg_id_optional')}</label>
                  <div className="relative group">
                    <Smartphone className="absolute left-3 top-2.5 w-5 h-5 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                    <input
                      type="number"
                      value={editTGID}
                      onChange={(e) => setEditTGID(e.target.value)}
                      placeholder="e.g. 123456789"
                      className="w-full bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all shadow-sm"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-8 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors font-medium shadow-sm"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold py-2.5 px-4 rounded-xl transition-all shadow-lg shadow-emerald-500/20"
                  >
                    {t('update')}
                  </button>
                </div>
              </form>

              {/* Reset Password Section */}
              <div className="pt-6 mt-6 border-t border-zinc-200 dark:border-zinc-800">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-500" />
                  {t('reset_password')}
                </h3>
                <div className="flex gap-2">
                  <div className="relative group flex-1">
                    <Lock className="absolute left-3 top-2.5 w-5 h-5 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                    <input
                      type="password"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      placeholder={t('new_password')}
                      className="w-full bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all shadow-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={!resetPassword}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium py-2.5 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('reset')}
                  </button>
                </div>
                {resetPasswordSuccess && (
                  <p className="text-emerald-400 text-xs mt-2 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                    {resetPasswordSuccess}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={confirmDeleteUser}
        title={t('delete_user')}
        message={t('delete_user_confirm_msg')}
        confirmText={t('delete')}
        isDestructive={true}
      />

      {/* Permissions Modal */}
      {showPermissionsModal && permissionsUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300 ring-1 ring-black/5 dark:ring-white/10">

            {/* Modal Header */}
            <div className="px-8 py-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                  <Shield className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{t('server_permissions')}</h2>
                  <p className="text-sm text-zinc-500">{t('configure_access_for')} <span className="text-emerald-500 dark:text-emerald-400 font-medium">{permissionsUser.username}</span></p>
                </div>
              </div>
              <button
                onClick={() => setShowPermissionsModal(false)}
                className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-200 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {permissionsError && (
                <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
                  {permissionsError}
                </div>
              )}

              <div className="space-y-4">
                {allServers.length > 0 ? allServers.map(server => {
                  const isEnabled = !!userServerPermissions[server.ID];
                  const currentLevel = userServerPermissions[server.ID];

                  return (
                    <div
                      key={server.ID}
                      className={`group flex flex-col gap-4 p-4 rounded-2xl border transition-all duration-300 ${isEnabled
                        ? 'bg-emerald-500/[0.03] border-emerald-500/20 shadow-sm shadow-emerald-500/5'
                        : 'bg-zinc-50 dark:bg-zinc-800/20 border-zinc-200 dark:border-zinc-800/50 hover:border-zinc-300 dark:hover:border-zinc-700'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => handlePermissionToggle(server.ID)}>
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shadow-sm ${isEnabled
                            ? 'bg-emerald-500 border-emerald-500 text-zinc-950'
                            : 'bg-white dark:bg-zinc-950 border-zinc-300 dark:border-zinc-700 group-hover:border-zinc-400 dark:group-hover:border-zinc-500'
                            }`}>
                            {isEnabled && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                          </div>
                          <ServerIcon className={`w-5 h-5 transition-colors ${isEnabled ? 'text-emerald-500 dark:text-emerald-400' : 'text-zinc-400 dark:text-zinc-500'}`} />
                          <span className={`font-semibold transition-colors ${isEnabled ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'}`}>
                            {server.name}
                          </span>
                        </div>

                        {isEnabled && (
                          <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-1 rounded-xl shadow-inner">
                            <button
                              onClick={() => handleAccessLevelChange(server.ID, 'read')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${currentLevel === 'read' ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                              {t('read')}
                            </button>
                            <button
                              onClick={() => handleAccessLevelChange(server.ID, 'manage')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${currentLevel === 'manage' ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                              {t('manage')}
                            </button>
                            <button
                              onClick={() => handleAccessLevelChange(server.ID, 'full')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${currentLevel === 'full' ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                              {t('full')}
                            </button>
                          </div>
                        )}
                      </div>

                      {isEnabled && (
                        <div className="flex items-start gap-2 pl-8 pr-2">
                          <div className="mt-1">
                            {currentLevel === 'read' && <span className="flex h-1.5 w-1.5 rounded-full bg-zinc-600" />}
                            {currentLevel === 'manage' && <span className="flex h-1.5 w-1.5 rounded-full bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.5)]" />}
                            {currentLevel === 'full' && <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />}
                          </div>
                          <p className="text-[11px] leading-relaxed text-zinc-500 italic">
                            {currentLevel === 'read' && t('perm_read_desc')}
                            {currentLevel === 'manage' && t('perm_manage_desc')}
                            {currentLevel === 'full' && t('perm_full_desc')}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                }) : (
                  <div className="text-center py-12 px-4 rounded-3xl border-2 border-dashed border-zinc-800">
                    <p className="text-zinc-500 font-medium">{t('no_servers_available')}</p>
                    <p className="text-xs text-zinc-600 mt-1">{t('connect_servers_first')}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-8 py-6 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-4">
              <button
                onClick={() => setShowPermissionsModal(false)}
                className="px-6 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-all font-medium shadow-sm"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleUpdatePermissions}
                className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-zinc-950 font-bold py-2.5 px-8 rounded-xl transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 active:scale-[0.98]"
              >
                {t('save_permissions')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default UsersPage;
