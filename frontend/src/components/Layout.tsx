import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
  Users,
  Settings,
  LogOut,
  Box,
  Menu,
  ChevronRight,
  Sun,
  Moon,
  Languages
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth.tsx';
import { useApp } from '../hooks/useApp.tsx';

const Layout: React.FC = () => {
  const location = useLocation();
  const { logout, user } = useAuth();
  const { t, language, setLanguage, theme, setTheme } = useApp();

  const isActive = (path: string) => location.pathname === path;

  // 检查当前路径是否是容器管理页面 (例如: /servers/123/containers)
  const isContainerPage = location.pathname.match(/^\/servers\/[^/]+\/containers/);

  const baseNavItems = [
    { path: '/', label: t('dashboard'), icon: LayoutDashboard, roles: ['admin', 'user'] },
    { path: '/servers', label: t('servers'), icon: Server, roles: ['admin', 'user'] },
    { path: '/users', label: t('users'), icon: Users, roles: ['admin'] },
    { path: '/settings', label: t('settings'), icon: Settings, roles: ['admin', 'user'] },
  ];

  const navItems = baseNavItems.filter(item =>
    user && item.roles.includes(user.role)
  );

  // Helper to get current page title
  const getPageTitle = () => {
    const current = navItems.find(item => item.path === location.pathname);
    return current ? current.label : 'DockerManager';
  };

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden selection:bg-emerald-500/30 font-sans transition-colors duration-300">

      {/* --- 全局背景装饰 (保持与其他页面一致) --- */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px] dark:opacity-100 opacity-50"></div>
        <div className="absolute left-0 top-0 h-96 w-96 bg-emerald-500/5 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-0 right-0 h-96 w-96 bg-blue-500/5 rounded-full blur-[128px]"></div>
      </div>

      {/* Sidebar Navigation */}
      {!isContainerPage && (
        <aside className="relative z-20 w-72 bg-white dark:bg-zinc-900/50 backdrop-blur-xl border-r border-zinc-200 dark:border-zinc-800/50 hidden md:flex flex-col transition-all duration-300">

          {/* Logo Area */}
          <div className="p-6 pb-8">
            <div className="flex items-center gap-3 px-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Box className="w-6 h-6 text-zinc-950" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 leading-none transition-colors">
                  Docker
                  <span className="text-emerald-500">Manager</span>
                </h1>
                <p className="text-[10px] font-medium text-zinc-500 tracking-wider uppercase mt-1">
                  {t('orchestration')}
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex-grow px-4 space-y-1.5">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 mb-4">
              {t('platform')}
            </div>
            {navItems.map((item) => {
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`group flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 ${active
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 border border-transparent'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className={`w-5 h-5 transition-colors ${active ? 'text-emerald-500' : 'text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300'}`} />
                    <span className="font-medium">{item.label}</span>
                  </div>
                  {active && <ChevronRight className="w-4 h-4 text-emerald-500/50" />}
                </Link>
              );
            })}
          </nav>

          {/* User Area */}
          <div className="p-4 border-t border-zinc-200 dark:border-zinc-800/50 m-2">
            <button
              onClick={logout}
              className="group flex items-center gap-3 px-4 py-3 rounded-xl w-full text-zinc-500 dark:text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/10 transition-all duration-200"
            >
              <LogOut className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
              <span className="font-medium">{t('logout')}</span>
            </button>
          </div>
        </aside>
      )}

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 flex flex-col h-screen overflow-hidden bg-transparent">

        {/* Header */}
        <header className="flex justify-between items-center h-20 px-8 border-b border-zinc-200 dark:border-zinc-800/50 bg-white/50 dark:bg-zinc-950/20 backdrop-blur-sm transition-colors duration-300">

          {/* Mobile Toggle & Title */}
          <div className="flex items-center gap-4">
            <button className="md:hidden p-2 text-zinc-400 hover:text-zinc-100">
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight transition-colors">
              {getPageTitle()}
            </h2>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 bg-zinc-100 dark:bg-zinc-900/50 p-1 rounded-xl">
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-emerald-500 transition-all"
                title={t('theme')}
              >
                {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
              <div className="w-[1px] h-4 bg-zinc-300 dark:bg-zinc-700"></div>
              <button
                onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-zinc-500 hover:text-emerald-500 transition-all font-mono"
                title={t('language')}
              >
                <Languages className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-tighter">{language}</span>
              </button>
            </div>

            <div className="flex items-center gap-3 pl-2">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200 transition-colors">{user?.username || 'Guest'}</div>
                <div className="text-xs text-zinc-500">
                  {user?.role === 'admin' ? t('system_administrator') : t('standard_user')}
                </div>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 p-[2px] shadow-lg shadow-emerald-500/20 cursor-pointer hover:scale-105 transition-transform">
                <div className="w-full h-full rounded-full bg-white dark:bg-zinc-900 flex items-center justify-center border-2 border-transparent transition-colors">
                  <span className="font-bold text-emerald-500 transition-colors">
                    {user?.username ? user.username.charAt(0).toUpperCase() : 'G'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 overflow-auto p-8 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
