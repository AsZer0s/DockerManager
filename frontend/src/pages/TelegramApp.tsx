import React, { useState, useEffect } from 'react';
import { useTelegram } from '../hooks/useTelegram';
import api from '../lib/api';
import {
  Server,
  Container,
  Activity,
  Cpu,
  HardDrive,
  Clock,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle
} from 'lucide-react';

interface TelegramUserInfo {
  user_id: number;
  username: string;
  role: string;
  telegram_id: number;
  server_count: number;
  is_bound: boolean;
}

interface TelegramServer {
  id: number;
  name: string;
  ip: string;
}

interface TelegramContainer {
  id: string;
  name: string;
  status: string;
  state: string;
}

interface TelegramServerStats {
  server_name: string;
  status: string;
  cpu_usage: number;
  ram_usage: number;
  docker_version: string;
  uptime: string;
  running_containers: number;
  total_containers: number;
  latency: number;
}

const TelegramApp: React.FC = () => {
  const { webApp, user, isTelegram } = useTelegram();
  const [currentView, setCurrentView] = useState<'home' | 'servers' | 'server-detail' | 'containers'>('home');
  const [userInfo, setUserInfo] = useState<TelegramUserInfo | null>(null);
  const [servers, setServers] = useState<TelegramServer[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [selectedServer, setSelectedServer] = useState<TelegramServer | null>(null);
  const [serverStats, setServerStats] = useState<TelegramServerStats | null>(null);
  const [containers, setContainers] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isTelegram && webApp) {
      // 设置 Telegram WebApp 主题
      webApp.ready();
      webApp.expand();
    }

    fetchUserInfo();
    fetchSummary();
  }, [isTelegram, webApp]);

  const fetchUserInfo = async () => {
    try {
      const response = await api.get('/telegram/info');
      setUserInfo(response.data);
    } catch (error) {
      console.error('Failed to fetch user info:', error);
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await api.get('/telegram/summary');
      setSummary(response.data);
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    }
  };

  const fetchServers = async () => {
    setLoading(true);
    try {
      const response = await api.get('/telegram/servers');
      setServers(response.data);
      setCurrentView('servers');
    } catch (error) {
      console.error('Failed to fetch servers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchServerStats = async (serverId: number) => {
    setLoading(true);
    try {
      const response = await api.get(`/telegram/servers/${serverId}/stats`);
      setServerStats(response.data);
      setCurrentView('server-detail');
    } catch (error) {
      console.error('Failed to fetch server stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchContainers = async (serverId: number) => {
    setLoading(true);
    try {
      const response = await api.get(`/telegram/servers/${serverId}/containers`);
      setContainers(response.data);
      setCurrentView('containers');
    } catch (error) {
      console.error('Failed to fetch containers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleServerClick = (server: TelegramServer) => {
    setSelectedServer(server);
    fetchServerStats(server.id);
  };

  const handleBack = () => {
    if (currentView === 'server-detail' || currentView === 'containers') {
      setCurrentView('servers');
      setServerStats(null);
      setContainers(null);
    } else if (currentView === 'servers') {
      setCurrentView('home');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'online':
      case 'running':
        return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'offline':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-amber-500" />;
    }
  };

  const renderHome = () => (
    <div className="space-y-4">
      {/* 用户信息卡片 */}
      <div className="bg-zinc-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white">👤 用户信息</h2>
          <RefreshCw
            className="w-5 h-5 text-zinc-400 cursor-pointer"
            onClick={fetchUserInfo}
          />
        </div>
        {userInfo ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-400">用户名</span>
              <span className="text-white font-medium">{userInfo.username}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">角色</span>
              <span className="text-blue-400 font-medium">{userInfo.role}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Telegram ID</span>
              <span className="text-white font-medium">{userInfo.telegram_id || '未绑定'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">服务器数量</span>
              <span className="text-emerald-400 font-medium">{userInfo.server_count}</span>
            </div>
          </div>
        ) : (
          <div className="text-center text-zinc-500 py-4">加载中...</div>
        )}
      </div>

      {/* 快速摘要卡片 */}
      <div className="bg-zinc-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white">📊 快速摘要</h2>
          <RefreshCw
            className="w-5 h-5 text-zinc-400 cursor-pointer"
            onClick={fetchSummary}
          />
        </div>
        {summary ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Server className="w-4 h-4 text-blue-400" />
                <span className="text-zinc-400 text-xs">总服务器</span>
              </div>
              <div className="text-2xl font-bold text-white">{summary.total_servers}</div>
            </div>
            <div className="bg-zinc-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span className="text-zinc-400 text-xs">在线</span>
              </div>
              <div className="text-2xl font-bold text-emerald-400">{summary.online_servers}</div>
            </div>
            <div className="bg-zinc-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Container className="w-4 h-4 text-purple-400" />
                <span className="text-zinc-400 text-xs">总容器</span>
              </div>
              <div className="text-2xl font-bold text-white">{summary.total_containers}</div>
            </div>
            <div className="bg-zinc-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-amber-400" />
                <span className="text-zinc-400 text-xs">运行中</span>
              </div>
              <div className="text-2xl font-bold text-amber-400">{summary.running_containers}</div>
            </div>
          </div>
        ) : (
          <div className="text-center text-zinc-500 py-4">加载中...</div>
        )}
      </div>

      {/* 快捷操作 */}
      <div className="bg-zinc-800 rounded-xl p-4">
        <h2 className="text-lg font-bold text-white mb-3">🚀 快捷操作</h2>
        <button
          onClick={fetchServers}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          <Server className="w-5 h-5" />
          查看服务器列表
        </button>
      </div>
    </div>
  );

  const renderServers = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">🖥️ 服务器列表</h2>
        <RefreshCw
          className={`w-5 h-5 text-zinc-400 cursor-pointer ${loading ? 'animate-spin' : ''}`}
          onClick={fetchServers}
        />
      </div>

      {servers.length === 0 ? (
        <div className="text-center text-zinc-500 py-8">
          <Server className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>暂无服务器</p>
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map((server) => (
            <div
              key={server.id}
              onClick={() => handleServerClick(server)}
              className="bg-zinc-800 hover:bg-zinc-700 rounded-xl p-4 cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <Server className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="font-bold text-white">{server.name}</div>
                    <div className="text-sm text-zinc-400">{server.ip}</div>
                  </div>
                </div>
                <div className="text-zinc-500">
                  →
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderServerDetail = () => (
    <div className="space-y-4">
      {selectedServer && (
        <>
          <div className="flex items-center gap-3">
            <button onClick={handleBack} className="p-2 bg-zinc-700 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h2 className="text-xl font-bold text-white">{selectedServer.name}</h2>
          </div>

          {/* 服务器统计 */}
          {serverStats ? (
            <div className="bg-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white">服务器状态</h3>
                <div className="flex items-center gap-2">
                  {getStatusIcon(serverStats.status)}
                  <span className="text-sm text-zinc-400">{serverStats.status}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Cpu className="w-4 h-4 text-emerald-400" />
                    <span className="text-zinc-400 text-xs">CPU 使用率</span>
                  </div>
                  <div className="text-xl font-bold text-white">{serverStats.cpu_usage.toFixed(1)}%</div>
                </div>
                <div className="bg-zinc-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <HardDrive className="w-4 h-4 text-blue-400" />
                    <span className="text-zinc-400 text-xs">内存使用率</span>
                  </div>
                  <div className="text-xl font-bold text-white">{serverStats.ram_usage.toFixed(1)}%</div>
                </div>
                <div className="bg-zinc-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="w-4 h-4 text-amber-400" />
                    <span className="text-zinc-400 text-xs">延迟</span>
                  </div>
                  <div className="text-xl font-bold text-white">{serverStats.latency.toFixed(1)}ms</div>
                </div>
                <div className="bg-zinc-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-purple-400" />
                    <span className="text-zinc-400 text-xs">运行时间</span>
                  </div>
                  <div className="text-sm font-bold text-white">{serverStats.uptime}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-400">{serverStats.running_containers}</div>
                  <div className="text-xs text-zinc-400">运行中容器</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">{serverStats.total_containers}</div>
                  <div className="text-xs text-zinc-400">总容器数</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-zinc-800 rounded-xl p-4 text-center text-zinc-500">
              {loading ? '加载中...' : '无法获取服务器状态'}
            </div>
          )}

          {/* 容器列表按钮 */}
          <button
            onClick={() => selectedServer && fetchContainers(selectedServer.id)}
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-600 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <Container className="w-5 h-5" />
            查看容器列表
          </button>
        </>
      )}
    </div>
  );

  const renderContainers = () => (
    <div className="space-y-4">
      {selectedServer && (
        <>
          <div className="flex items-center gap-3">
            <button onClick={handleBack} className="p-2 bg-zinc-700 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h2 className="text-xl font-bold text-white">{selectedServer.name} - 容器</h2>
          </div>

          {containers ? (
            <div className="space-y-3">
              {containers.containers && containers.containers.length > 0 ? (
                containers.containers.map((container: TelegramContainer) => (
                  <div
                    key={container.id}
                    className="bg-zinc-800 rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-zinc-700 rounded-lg">
                          <Container className="w-4 h-4 text-zinc-400" />
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm">{container.name}</div>
                          <div className="text-xs text-zinc-500">{container.id.substring(0, 12)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(container.state)}
                        <span className="text-xs text-zinc-400">{container.state}</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-zinc-500 py-8">
                  <Container className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>暂无容器</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-zinc-800 rounded-xl p-4 text-center text-zinc-500">
              {loading ? '加载中...' : '无法获取容器列表'}
            </div>
          )}
        </>
      )}
    </div>
  );

  if (!isTelegram) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-4">
        <div className="bg-zinc-800 rounded-xl p-6 max-w-md text-center">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">请在 Telegram 中打开</h2>
          <p className="text-zinc-400">此页面需要通过 Telegram Bot 打开才能正常使用</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900 p-4 pb-20">
      <div className="max-w-lg mx-auto">
        {/* 标题栏 */}
        <div className="bg-zinc-800 rounded-xl p-4 mb-4">
          <h1 className="text-2xl font-bold text-white text-center">🐳 DockerManager</h1>
          {user && (
            <div className="text-center text-sm text-zinc-400 mt-1">
              欢迎, {user.first_name || user.username || '用户'}
            </div>
          )}
        </div>

        {/* 主内容区 */}
        {currentView === 'home' && renderHome()}
        {currentView === 'servers' && renderServers()}
        {currentView === 'server-detail' && renderServerDetail()}
        {currentView === 'containers' && renderContainers()}
      </div>
    </div>
  );
};

export default TelegramApp;