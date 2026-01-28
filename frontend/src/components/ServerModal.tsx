import React, { useState, useEffect } from 'react';
import { X, Server as ServerIcon, KeyRound, User, Globe, Hash, Lock } from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { Server, ServerPayload } from '../lib/api';

interface ServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (server: ServerPayload) => void;
  editingServer?: Server | null;
}

const ServerModal: React.FC<ServerModalProps> = ({ isOpen, onClose, onSave, editingServer }) => {
  const { t } = useApp();
  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('root');
  const [authMode, setAuthMode] = useState('password'); // 'password' or 'key'
  const [secret, setSecret] = useState(''); // password or private key

  useEffect(() => {
    if (isOpen && editingServer) {
      setName(editingServer.name);
      setIp(editingServer.ip);
      setPort(editingServer.port.toString());
      setUsername(editingServer.username);
      setAuthMode(editingServer.auth_mode);
      // Note: Secret is not returned by API for security reasons, so it won't be pre-filled
      setSecret('');
    } else if (isOpen) {
      // Reset form when opening for new server
      setName('');
      setIp('');
      setPort('22');
      setUsername('root');
      setAuthMode('password');
      setSecret('');
    }
  }, [isOpen, editingServer]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      ip,
      port: parseInt(port, 10),
      username,
      auth_mode: authMode,
      secret,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 ring-1 ring-black/5 dark:ring-white/10">

        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{editingServer ? t('edit_server') : t('connect_new_server')}</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Server Name */}
          <div>
            <label htmlFor="name" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">{t('server_name_label')}</label>
            <div className="relative group">
              <ServerIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500 group-focus-within:text-emerald-500 transition-colors" />
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all text-sm shadow-sm"
                placeholder="e.g., Production-Primary"
                required
              />
            </div>
          </div>

          {/* IP Address */}
          <div>
            <label htmlFor="ip" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">{t('ip_address')}</label>
            <div className="relative group">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500 group-focus-within:text-emerald-500 transition-colors" />
              <input
                type="text"
                id="ip"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all text-sm shadow-sm"
                placeholder="e.g., 192.168.1.100"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="port" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">{t('ssh_port')}</label>
              <div className="relative group">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500 group-focus-within:text-emerald-500 transition-colors" />
                <input
                  type="number"
                  id="port"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all text-sm shadow-sm"
                  placeholder="22"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="username" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">{t('username')}</label>
              <div className="relative group">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500 group-focus-within:text-emerald-500 transition-colors" />
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all text-sm shadow-sm"
                  placeholder="e.g., root"
                  required
                />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="authMode" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">{t('auth_mode')}</label>
            <div className="relative group">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500 group-focus-within:text-emerald-500 transition-colors" />
              <select
                id="authMode"
                value={authMode}
                onChange={(e) => setAuthMode(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all text-sm appearance-none cursor-pointer shadow-sm"
              >
                <option value="password">{t('password')}</option>
                <option value="key">{t('ssh_key')}</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-zinc-400 dark:text-zinc-500">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="secret" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">
              {authMode === 'password' ? t('password') : t('ssh_key')}
            </label>
            <div className="relative group">
              <KeyRound className="absolute left-3 top-3 w-4 h-4 text-zinc-400 dark:text-zinc-500 group-focus-within:text-emerald-500 transition-colors" />
              {authMode === 'password' ? (
                <input
                  type="password"
                  id="secret"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all text-sm shadow-sm"
                  placeholder={editingServer ? t('leave_blank_to_keep') : t('enter_password')}
                  required={!editingServer}
                />
              ) : (
                <textarea
                  id="secret"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  rows={4}
                  className="w-full pl-10 pr-3 py-3 bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all text-sm font-mono shadow-sm"
                  placeholder={editingServer ? t('leave_blank_to_keep') : t('paste_ssh_key')}
                  required={!editingServer}
                ></textarea>
              )}
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors font-medium shadow-sm"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="flex-1 font-bold py-2.5 px-4 rounded-xl transition-all shadow-lg bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20 text-zinc-950"
            >
              {editingServer ? t('save_changes') : t('connect_server')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ServerModal;