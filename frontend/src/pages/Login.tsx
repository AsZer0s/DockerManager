import React, { useState } from 'react';
import { LogIn, User, Lock, Terminal } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.tsx';
import { useApp } from '../hooks/useApp';
import api from '../lib/api';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const { t } = useApp();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await api.post('/login', { username, password });
      login(response.data.token);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || t('unexpected_error');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden selection:bg-emerald-500/30 transition-colors duration-300">
      {/* --- 背景装饰开始 --- */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] opacity-70 dark:opacity-100"></div>
        <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-emerald-500/20 opacity-20 blur-[100px]"></div>
        <div className="absolute bottom-0 right-0 -z-10 h-[310px] w-[310px] rounded-full bg-teal-500/10 opacity-20 blur-[100px]"></div>
      </div>
      {/* --- 背景装饰结束 --- */}

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="bg-white/80 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/50 rounded-2xl shadow-2xl backdrop-blur-xl p-8 transition-all duration-300 hover:border-emerald-500/20 dark:hover:border-zinc-700/50 hover:shadow-emerald-500/10 dark:hover:shadow-emerald-900/10">

          {/* Header 区域 */}
          <div className="text-center mb-8 space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 mb-4 shadow-lg shadow-emerald-500/10">
              {/* 这里用了 Terminal 图标增加 Docker 氛围，也可以换回 Lock */}
              <Terminal className="w-6 h-6 text-emerald-400" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 via-zinc-700 to-zinc-500 dark:from-white dark:via-zinc-200 dark:to-zinc-400">
                Docker
              </span>
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-500 to-teal-600 dark:from-emerald-400 dark:to-teal-500">
                Manager
              </span>
            </h1>
            <p className="text-sm text-zinc-500">{t('login_subtext')}</p>
          </div>

          {/* 错误提示区域 */}
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-lg text-sm mb-6 flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
              <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              {/* Username Input */}
              <div className="group">
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">
                  {t('username')}
                </label>
                <div className="relative transition-all duration-200 focus-within:scale-[1.01]">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-zinc-500 group-focus-within:text-emerald-400 transition-colors duration-200" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t('username')}
                    required
                    className="block w-full pl-10 pr-3 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-xl leading-5 bg-zinc-50/50 dark:bg-zinc-950/50 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all duration-200 sm:text-sm"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="group">
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">
                  {t('password')}
                </label>
                <div className="relative transition-all duration-200 focus-within:scale-[1.01]">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-zinc-500 group-focus-within:text-emerald-400 transition-colors duration-200" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('password')}
                    required
                    className="block w-full pl-10 pr-3 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-xl leading-5 bg-zinc-50/50 dark:bg-zinc-950/50 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all duration-200 sm:text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-xl transition-all duration-200 shadow-lg ${isLoading
                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed border border-zinc-200 dark:border-zinc-700'
                : 'bg-emerald-600 hover:bg-emerald-500 text-zinc-950 shadow-emerald-500/25 dark:shadow-emerald-500/40 hover:-translate-y-0.5 active:translate-y-0'
                }`}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-zinc-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {t('logging_in')}
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  {t('sign_in')}
                </>
              )}
            </button>
          </form>

          {/* Footer Area */}
          <div className="mt-8 pt-6 border-t border-zinc-800/50 text-center">
            <p className="text-xs text-zinc-600">
              {t('protected_by')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
