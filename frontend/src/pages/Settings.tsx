import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  KeyRound,
  Save,
  Bot,
  Globe,
  Lock,
  AlertCircle,
  Plus,
  Activity,
  CheckCircle2,
  Smartphone,
  Trash2,
  Edit2,
  X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { useTelegram } from '../hooks/useTelegram';
import { useApp } from '../hooks/useApp';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { logout, user, setUser } = useAuth(); // Get user and setUser from auth context
  const { webApp, isTelegram } = useTelegram(); // Use Telegram hook
  const { t } = useApp();

  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Telegram Config State
  const [botToken, setBotToken] = useState('');
  const [webAppUrl, setWebAppUrl] = useState('');

  // Latency Config State
  const [pingTargets, setPingTargets] = useState<{ name: string, host: string }[]>([]);
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<{ name: string, host: string } | null>(null);
  const [newTargetName, setNewTargetName] = useState('');
  const [newTargetHost, setNewTargetHost] = useState('');

  // UI State
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigLoading, setIsConfigLoading] = useState(false);
  const [isBinding, setIsBinding] = useState(false); // New state for binding

  useEffect(() => {
    fetchTelegramConfig();
    fetchLatencyConfig();
  }, []);

  const fetchTelegramConfig = async () => {
    try {
      const response = await api.get('/config/telegram');
      setBotToken(response.data.bot_token || '');
      setWebAppUrl(response.data.web_app_url || '');
    } catch (err) {
      console.error('Failed to fetch Telegram config:', err);
    }
  };

  const fetchLatencyConfig = async () => {
    try {
      const response = await api.get('/config/latency');
      const raw = response.data.ping_targets || '';
      if (raw.startsWith('[')) {
        setPingTargets(JSON.parse(raw));
      } else if (raw) {
        // Fallback for old comma-separated format
        const legacy = raw.split(',').map((t: string) => ({ name: t.trim(), host: t.trim() }));
        setPingTargets(legacy);
      }
    } catch (err) {
      console.error('Failed to fetch latency config:', err);
    }
  };

  const handleUpdateLatencyConfig = async () => {
    setMessage('');
    setError('');
    setIsConfigLoading(true);

    try {
      await api.put('/config/latency', {
        ping_targets: JSON.stringify(pingTargets),
      });
      setMessage(t('latency_config_success'));
    } catch (err: any) {
      setError(err.response?.data?.error || t('failed_latency_config'));
    } finally {
      setIsConfigLoading(false);
    }
  };

  const handleAddTarget = () => {
    if (!newTargetName || !newTargetHost) return;

    if (editingTarget) {
      setPingTargets(prev => prev.map(t =>
        (t.name === editingTarget.name && t.host === editingTarget.host)
          ? { name: newTargetName, host: newTargetHost }
          : t
      ));
    } else {
      setPingTargets(prev => [...prev, { name: newTargetName, host: newTargetHost }]);
    }

    setNewTargetName('');
    setNewTargetHost('');
    setEditingTarget(null);
    setIsTargetModalOpen(false);
  };

  const handleDeleteTarget = (target: { name: string, host: string }) => {
    setPingTargets(prev => prev.filter(t => !(t.name === target.name && t.host === target.host)));
  };

  const openEditModal = (target: { name: string, host: string }) => {
    setEditingTarget(target);
    setNewTargetName(target.name);
    setNewTargetHost(target.host);
    setIsTargetModalOpen(true);
  };

  const handleUpdateTelegramConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    setIsConfigLoading(true);

    try {
      await api.put('/config/telegram', {
        bot_token: botToken,
        web_app_url: webAppUrl,
      });
      setMessage(t('telegram_config_success'));
    } catch (err: any) {
      setError(err.response?.data?.error || t('failed_telegram_config'));
    } finally {
      setIsConfigLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    setIsLoading(true);

    if (newPassword !== confirmNewPassword) {
      setError(t('password_mismatch'));
      setIsLoading(false);
      return;
    }

    try {
      await api.put('/users/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setMessage(t('password_change_success'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      // Force logout and redirect to login page
      setTimeout(() => {
        logout();
        navigate('/login');
      }, 2000);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || t('failed_password_change');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBindTelegram = async () => {
    if (!webApp || !webApp.initData) {
      setError(t('web_app_error'));
      return;
    }

    setMessage('');
    setError('');
    setIsBinding(true);

    try {
      const response = await api.post('/users/bind-telegram', {
        init_data: webApp.initData,
      });

      // Update local user state with new telegram_id
      if (user && setUser) {
        setUser({ ...user, telegram_id: response.data.telegram_id });
      }

      setMessage('Telegram ID bound successfully!');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to bind Telegram ID.');
    } finally {
      setIsBinding(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Page Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800/50">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <SettingsIcon className="w-6 h-6 text-emerald-400" />
            </div>
            {t('settings')}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 ml-1">{t('settings_desc')}</p>
        </div>
      </header>

      {/* Alerts Area (Global for this page) */}
      {(message || error) && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 animate-in slide-in-from-top-2 ${error
          ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          }`}>
          {error ? <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />}
          <div>
            <h4 className="font-medium text-sm">{error ? t('error') : t('success')}</h4>
            <p className="text-sm opacity-90">{error || message}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Telegram User Binding Card (Admin Only per user request) */}
        {user?.role === 'admin' && (
          <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/50 p-8 rounded-2xl shadow-sm hover:shadow-emerald-500/10 dark:hover:shadow-emerald-900/10 transition-all duration-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg shadow-inner">
                <Smartphone className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{t('telegram_bind')}</h3>
            </div>

            <p className="text-zinc-500 text-sm mb-8 leading-relaxed">
              {t('bind_telegram_desc')}
            </p>

            {user?.telegram_id ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <div>
                  <p className="font-medium">{t('account_bound')}</p>
                  <p className="text-sm text-emerald-300/80">{t('your_telegram_id')}: {user.telegram_id}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-zinc-400 text-sm">
                  {t('bind_telegram_btn_desc')}
                </p>
                <button
                  onClick={handleBindTelegram}
                  disabled={!isTelegram || isBinding}
                  className={`w-full flex items-center justify-center gap-2 font-bold py-2.5 px-4 rounded-xl transition-all shadow-lg ${!isTelegram || isBinding
                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed border border-zinc-200 dark:border-zinc-700'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-zinc-950 shadow-emerald-500/20 hover:shadow-emerald-500/30'
                    }`}
                >
                  {isBinding ? (
                    <>
                      <div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                      {t('binding')}
                    </>
                  ) : (
                    <>
                      <Bot className="w-4 h-4" />
                      {t('bind_telegram')}
                    </>
                  )}
                </button>
                {!isTelegram && (
                  <p className="text-rose-400 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {t('open_via_bot')}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Telegram Bot Configuration Card (Admin Only) */}
        {user?.role === 'admin' && (
          <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/50 p-8 rounded-2xl shadow-sm hover:shadow-emerald-500/10 dark:hover:shadow-emerald-900/10 transition-all duration-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg shadow-inner">
                <Bot className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{t('bot_config')}</h3>
            </div>

            <p className="text-zinc-500 text-sm mb-8 leading-relaxed">
              {t('bot_config_desc')}
            </p>

            <form onSubmit={handleUpdateTelegramConfig} className="space-y-6">
              <div className="space-y-4">
                <div className="group">
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">
                    {t('bot_token')}
                  </label>
                  <div className="relative">
                    <Bot className="absolute left-3 top-2.5 w-5 h-5 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                    <input
                      type="password"
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      placeholder={t('bot_token_placeholder')}
                      className="block w-full pl-10 pr-3 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950/50 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all shadow-sm"
                    />
                  </div>
                </div>

                <div className="group">
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">
                    {t('web_app_url')}
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-2.5 w-5 h-5 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                    <input
                      type="url"
                      value={webAppUrl}
                      onChange={(e) => setWebAppUrl(e.target.value)}
                      placeholder={t('web_app_url_placeholder')}
                      className="block w-full pl-10 pr-3 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950/50 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all shadow-sm"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isConfigLoading}
                className={`w-full flex items-center justify-center gap-2 font-bold py-2.5 px-4 rounded-xl transition-all shadow-lg ${isConfigLoading
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed border border-zinc-200 dark:border-zinc-700'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-zinc-950 shadow-emerald-500/20 hover:shadow-emerald-500/30'
                  }`}
              >
                {isConfigLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                    {t('saving')}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {t('save_config')}
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Monitoring Configuration Card (Admin Only) */}
        {user?.role === 'admin' && (
          <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/50 p-8 rounded-2xl shadow-sm hover:shadow-emerald-500/10 dark:hover:shadow-emerald-900/10 transition-all duration-300">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg shadow-inner">
                  <Activity className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
                </div>
                <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{t('monitoring_config')}</h3>
              </div>
              <button
                onClick={() => {
                  setEditingTarget(null);
                  setNewTargetName('');
                  setNewTargetHost('');
                  setIsTargetModalOpen(true);
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-sm font-medium hover:bg-emerald-500/20 transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" />
                {t('add_target')}
              </button>
            </div>

            <p className="text-zinc-500 text-sm mb-8 leading-relaxed">
              {t('monitoring_config_desc')}
            </p>

            <div className="space-y-4 mb-8">
              {pingTargets.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50/50 dark:bg-zinc-950/30">
                  <p className="text-zinc-500 dark:text-zinc-600 text-sm">{t('no_targets_configured')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {pingTargets.map((target, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl group hover:border-emerald-500/30 transition-all">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{target.name}</p>
                        <p className="text-xs text-zinc-500 font-mono mt-0.5">{target.host}</p>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditModal(target)}
                          className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTarget(target)}
                          className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleUpdateLatencyConfig}
              disabled={isConfigLoading}
              className={`w-full flex items-center justify-center gap-2 font-bold py-2.5 px-4 rounded-xl transition-all shadow-lg ${isConfigLoading
                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed border border-zinc-200 dark:border-zinc-700'
                : 'bg-emerald-600 hover:bg-emerald-500 text-zinc-950 shadow-emerald-500/20 hover:shadow-emerald-500/30'
                }`}
            >
              {isConfigLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                  {t('saving')}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {t('save_monitoring_config')}
                </>
              )}
            </button>
          </div>
        )}

        {/* Change Password Card */}
        <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/50 p-8 rounded-2xl shadow-sm hover:shadow-emerald-500/10 dark:hover:shadow-emerald-900/10 transition-all duration-300">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg shadow-inner">
              <KeyRound className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{t('security')}</h3>
          </div>

          <p className="text-zinc-500 text-sm mb-8 leading-relaxed">
            {t('security_desc')}
          </p>

          <form onSubmit={handleChangePassword} className="space-y-6">
            <div className="space-y-4">
              <div className="group">
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">
                  {t('current_password')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-5 h-5 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="block w-full pl-10 pr-3 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950/50 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all shadow-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="group">
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">
                    {t('new_password')}
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-2.5 w-5 h-5 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      className="block w-full pl-10 pr-3 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950/50 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all shadow-sm"
                    />
                  </div>
                </div>

                <div className="group">
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">
                    {t('confirm')}
                  </label>
                  <div className="relative">
                    <CheckCircle2 className="absolute left-3 top-2.5 w-5 h-5 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                    <input
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      required
                      className="block w-full pl-10 pr-3 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950/50 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all shadow-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full flex items-center justify-center gap-2 font-bold py-2.5 px-4 rounded-xl transition-all shadow-lg ${isLoading
                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed border border-zinc-200 dark:border-zinc-700'
                : 'bg-emerald-600 hover:bg-emerald-500 text-zinc-950 shadow-emerald-500/20 hover:shadow-emerald-500/30 dark:shadow-none'
                }`}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                  {t('updating')}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {t('update_password_btn')}
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Target Edit/Add Modal */}
      {isTargetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800/50 bg-zinc-50 dark:bg-zinc-900/50">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {editingTarget ? t('edit_target') : t('add_ping_target')}
              </h3>
              <button
                onClick={() => setIsTargetModalOpen(false)}
                className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider ml-1">
                  {t('display_name')}
                </label>
                <input
                  type="text"
                  value={newTargetName}
                  onChange={(e) => setNewTargetName(e.target.value)}
                  placeholder="e.g. Google DNS"
                  className="w-full px-4 py-2.5 bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all font-medium shadow-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider ml-1">
                  {t('host_ip')}
                </label>
                <input
                  type="text"
                  value={newTargetHost}
                  onChange={(e) => setNewTargetHost(e.target.value)}
                  placeholder="e.g. 8.8.8.8"
                  className="w-full px-4 py-2.5 bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all font-mono shadow-sm"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-950/30 border-t border-zinc-200 dark:border-zinc-800 flex gap-3">
              <button
                onClick={() => setIsTargetModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all shadow-sm"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleAddTarget}
                disabled={!newTargetName || !newTargetHost}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingTarget ? t('update') : t('add')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
