import React, { useState } from 'react';
import TerminalComponent from './Terminal';
import {
  Cpu,
  Server as ServerIcon,
  Terminal,
  MoreVertical,
  X,
  Maximize2,
  Minus,
  Edit2,
  Trash2,
  HardDrive,
  Container as ContainerIcon,
  Activity
} from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { Server } from '../lib/api';
import { Link } from 'react-router-dom'; // Import Link

interface ServerCardProps {
  server: any; // 使用 any 或具体扩展类型以兼容 Servers.tsx
  onEdit?: (server: Server) => void;
  onDelete?: (server: Server) => void;
  activeMenu?: number | null;
  setActiveMenu?: (id: number | null) => void;
}

const ServerCard: React.FC<ServerCardProps> = ({ server, onEdit, onDelete, activeMenu, setActiveMenu }) => {
  const { t } = useApp();
  const [showTerminalModal, setShowTerminalModal] = useState(false);

  const isOnline = server.status === 'online';

  const handleConnectClick = () => {
    setShowTerminalModal(true);
  };

  const handleCloseTerminalModal = () => {
    setShowTerminalModal(false);
  };

  return (
    <>
      {/* --- Server Card --- */}
      <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800/50 bg-white dark:bg-zinc-900/60 p-6 shadow-sm transition-all duration-300 hover:border-emerald-500/30 dark:hover:border-zinc-700/50 hover:shadow-xl hover:shadow-emerald-500/10 dark:hover:shadow-emerald-900/10">

        {/* Decorative Background Blob */}
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-500/5 blur-3xl transition-all group-hover:bg-emerald-500/10" />

        {/* Header: Status & Name - 提高层级以防下拉菜单被遮挡 */}
        <div className="relative z-20 mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Status Indicator */}
            <div className="relative flex h-3 w-3">
              {isOnline && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex h-3 w-3 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            </div>

            <div>
              <h2 className="font-bold tracking-tight text-zinc-900 dark:text-zinc-100 group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors">
                {server.name}
              </h2>
              <p className="font-mono text-xs text-zinc-500 mt-0.5">{server.ip}</p>
            </div>
          </div>

          {onEdit && onDelete && setActiveMenu && (
            <div className="relative">
              <button
                onClick={() => setActiveMenu(activeMenu === server.ID ? null : server.ID)}
                className="text-zinc-600 hover:text-zinc-300 transition-colors p-1"
              >
                <MoreVertical className="h-5 w-5" />
              </button>

              {activeMenu === server.ID && (
                <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-150 shadow-black/5 dark:shadow-black/40">
                  <button
                    onClick={() => {
                      onEdit(server);
                      setActiveMenu(null);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    {t('edit')}
                  </button>
                  <button
                    onClick={() => {
                      onDelete(server);
                      setActiveMenu(null);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t('delete')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Body: Metrics Bars */}
        <div className="relative z-10 space-y-4 mb-8">
          {/* CPU Metric */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <Cpu className="h-3.5 w-3.5" />
                <span>{t('cpu_usage')}</span>
              </div>
              <span className={`font-mono ${isOnline ? 'text-zinc-200' : 'text-zinc-600'}`}>
                {server.cpuUsage}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-out ${isOnline ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-zinc-700'
                  }`}
                style={{ width: `${server.cpuUsage}%` }}
              />
            </div>
          </div>

          {/* RAM Metric */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <HardDrive className="h-3.5 w-3.5" />
                <span>{t('memory_usage')}</span>
              </div>
              <span className={`font-mono ${isOnline ? 'text-zinc-200' : 'text-zinc-600'}`}>
                {server.ramUsage}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-out ${isOnline ? 'bg-indigo-500' : 'bg-zinc-700'
                  }`}
                style={{ width: `${server.ramUsage}%` }}
              />
            </div>
          </div>

          {/* Latency Metric */}
          {isOnline && server.latency_map && Object.keys(server.latency_map).length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <Activity className="h-3.5 w-3.5" />
                  <span>{t('network_latency')}</span>
                </div>
                <span className="font-mono text-emerald-400">
                  {Math.round(server.latency)} ms
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mt-1">
                {Object.entries(server.latency_map).map(([name, lat]: [string, any]) => (
                  <div key={name} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/30">
                    <span className="text-[10px] text-zinc-500">{name}:</span>
                    <span className={`text-[10px] font-mono ${lat < 100 ? 'text-emerald-400' : lat < 200 ? 'text-amber-400' : 'text-rose-400'}`}>
                      {Math.round(lat)}ms
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Docker Info */}
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[10px] pt-4 border-t border-zinc-200 dark:border-zinc-800/50">
            <div className="text-zinc-500">{t('docker_version')}</div>
            <div className="text-zinc-700 dark:text-zinc-300 text-right font-mono truncate">{server.dockerVersion}</div>

            <div className="text-zinc-500">{t('uptime')}</div>
            <div className="text-zinc-700 dark:text-zinc-300 text-right font-mono truncate">{server.uptime}</div>
          </div>
        </div>

        {/* Footer: Action Buttons */}
        <div className="relative z-10 pt-4 border-t border-zinc-200 dark:border-zinc-800/50 flex gap-3">
          <Link
            to={`/servers/${server.ID}/containers`}
            className={`flex-1 group/btn flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-all shadow-lg ${isOnline
              ? 'bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-600 dark:hover:bg-blue-600 text-zinc-600 dark:text-zinc-300 hover:text-white dark:hover:text-white shadow-zinc-200 dark:shadow-black/20 hover:shadow-blue-500/20'
              : 'bg-zinc-50 dark:bg-zinc-800/50 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
              }`}
          >
            <ContainerIcon className="h-4 w-4 transition-transform group-hover/btn:-translate-y-0.5 group-hover/btn:translate-x-0.5" />
            <span>{t('containers')}</span>
          </Link>
          <button
            onClick={handleConnectClick}
            disabled={!isOnline}
            className={`flex-1 group/btn flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-all shadow-lg ${isOnline
              ? 'bg-zinc-100 dark:bg-zinc-800 hover:bg-emerald-600 dark:hover:bg-emerald-600 text-zinc-600 dark:text-zinc-300 hover:text-white dark:hover:text-white shadow-zinc-200 dark:shadow-black/20 hover:shadow-emerald-500/20'
              : 'bg-zinc-50 dark:bg-zinc-800/50 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
              }`}
          >
            <Terminal className="h-4 w-4 transition-transform group-hover/btn:-translate-y-0.5 group-hover/btn:translate-x-0.5" />
            <span>{t('terminal')}</span>
          </button>
        </div>
      </div>

      {/* --- Terminal Modal --- */}
      {showTerminalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">

          {/* Window Container */}
          <div className="w-full max-w-5xl h-[80vh] flex flex-col bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 ring-1 ring-black/5 dark:ring-white/10">

            {/* Window Title Bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 select-none">
              {/* Window Controls (Mac Style) */}
              <div className="flex items-center gap-2 w-20">
                <button onClick={handleCloseTerminalModal} className="group relative w-3 h-3 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center">
                  <X className="w-2 h-2 text-rose-900 opacity-0 group-hover:opacity-100" />
                </button>
                <div className="w-3 h-3 rounded-full bg-amber-500 flex items-center justify-center">
                  <Minus className="w-2 h-2 text-amber-900 opacity-0 hover:opacity-100" />
                </div>
                <div className="w-3 h-3 rounded-full bg-emerald-500 flex items-center justify-center">
                  <Maximize2 className="w-2 h-2 text-emerald-900 opacity-0 hover:opacity-100" />
                </div>
              </div>

              {/* Title */}
              <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 text-sm font-mono opacity-80">
                <ServerIcon className="w-3 h-3" />
                <span>root@{server.ip}</span>
              </div>

              {/* Spacer for centering */}
              <div className="w-20 flex justify-end">
                <span className="text-xs text-zinc-500 dark:text-zinc-600 bg-zinc-200 dark:bg-zinc-800/50 px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700/50">SSH</span>
              </div>
            </div>

            {/* Terminal Content Area */}
            <div className="flex-1 bg-black/90 p-1 font-mono text-sm overflow-hidden relative">
              {/* Scanline Effect (Optional visual flair) */}
              <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-10 bg-[length:100%_2px,3px_100%] opacity-20"></div>

              <TerminalComponent serverId={server.ID.toString()} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ServerCard;