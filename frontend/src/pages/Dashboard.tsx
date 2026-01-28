import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Server as ServerIcon,
  Activity,
  ShieldCheck,
  TrendingUp,
  Clock,
  Plus,
  ChevronDown,
  Check
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import api, { serverApi } from '../lib/api';
import ServerCard from '../components/ServerCard';
import { useApp } from '../hooks/useApp';

const Dashboard: React.FC = () => {
  const { t, theme } = useApp();
  const [servers, setServers] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalServers: 0,
    onlineServers: 0,
    activeContainers: 0,
    avgLatency: 0
  });
  const [loading, setLoading] = useState(true);
  const [selectedServerIds, setSelectedServerIds] = useState<number[]>([]);
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [availableTargets, setAvailableTargets] = useState<{ name: string, host: string }[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [showServerFilter, setShowServerFilter] = useState(false);
  const [showTargetFilter, setShowTargetFilter] = useState(false);
  const [timeRange, setTimeRange] = useState('24H');

  const fetchServers = async () => {
    try {
      const response = await serverApi.listServers();
      const serversFromApi = response.data;

      // Initial state from list response
      setServers(prev => {
        const updated = serversFromApi.map((server: any) => {
          const existing = prev.find(s => s.ID === server.ID);
          if (existing) return { ...server, ...existing, name: server.name, ip: server.ip };
          return {
            ...server,
            status: 'loading',
            cpuUsage: 0,
            ramUsage: 0,
            running_containers: 0
          };
        });
        localStorage.setItem('dm_dashboard_cache', JSON.stringify(updated));
        return updated;
      });

      // Update stats based on what we have
      updateAggregates(serversFromApi);

      // Fetch individual stats and targets
      try {
        const configRes = await api.get('/config/latency');
        const raw = configRes.data.ping_targets || '';
        if (raw.startsWith('[')) {
          setAvailableTargets(JSON.parse(raw));
        } else if (raw) {
          setAvailableTargets(raw.split(',').map((t: string) => ({ name: t.trim(), host: t.trim() })));
        }
      } catch (e) {
        console.error("Failed to fetch latency config", e);
      }

      serversFromApi.forEach(async (server: any) => {
        try {
          const statsRes = await serverApi.getServerStats(server.ID.toString());
          const sData = statsRes.data;

          setServers(prev => {
            const newServers = prev.map(s => {
              if (s.ID === server.ID) {
                return {
                  ...s,
                  status: sData.status,
                  cpuUsage: sData.cpu_usage,
                  ramUsage: sData.ram_usage,
                  dockerVersion: sData.docker_version,
                  uptime: sData.uptime,
                  running_containers: sData.running_containers,
                  total_containers: sData.total_containers,
                  latency: sData.latency,
                  latency_map: sData.latency_map
                };
              }
              return s;
            });
            localStorage.setItem('dm_dashboard_cache', JSON.stringify(newServers));
            updateAggregates(newServers);
            return newServers;
          });
        } catch (err) {
          console.warn(`Failed to fetch stats for ${server.name}`);
        }
      });
    } catch (err) {
      console.error('Failed to fetch servers:', err);
    } finally {
      setLoading(false);
    }
  };

  const [history, setHistory] = useState<any[]>([]);

  const updateAggregates = (serverList: any[]) => {
    const online = serverList.filter(s => s.status === 'online');
    const totalRunning = online.reduce((acc, s) => acc + (s.running_containers || 0), 0);
    const avgLat = online.length > 0
      ? online.reduce((acc, s) => acc + (s.latency || 0), 0) / online.length
      : 0;

    const newStats = {
      totalServers: serverList.length,
      onlineServers: online.length,
      activeContainers: totalRunning,
      avgLatency: avgLat
    };
    setStats(newStats);

    // Update raw history for granular filtering
    if (online.length > 0) {
      setHistory(prev => {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        // Build raw data point: { sid: { target: latency } }
        const rawData: Record<number, Record<string, number>> = {};
        online.forEach(s => {
          if (s.latency_map) {
            rawData[s.ID] = s.latency_map;
          } else if (s.latency !== undefined) {
            rawData[s.ID] = { "default": s.latency };
          }
        });

        const newPoint = { name: timeStr, raw: rawData };
        const newHistory = [...prev.slice(-29), newPoint]; // Keep last 30 points
        localStorage.setItem('dm_dashboard_history_raw', JSON.stringify(newHistory));
        return newHistory;
      });
    }
  };

  useEffect(() => {
    const cached = localStorage.getItem('dm_dashboard_cache');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setServers(parsed);
      } catch (e) { }
    }

    const cachedHist = localStorage.getItem('dm_dashboard_history_raw');
    if (cachedHist) {
      try { setHistory(JSON.parse(cachedHist)); } catch (e) { }
    }

    fetchServers();
    const interval = setInterval(fetchServers, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchHistoricalStats = async () => {
    setIsHistoryLoading(true);
    try {
      const serverIds = selectedServerIds.join(',');
      const targets = selectedTargets.join(',');
      const response = await api.get(`/servers/stats/history?range=${timeRange}&server_ids=${serverIds}&targets=${targets}`);
      if (Array.isArray(response.data)) {
        setHistory(response.data.map((p: any) => ({
          name: p.name,
          latency: p.latency,
          raw: {}
        })));
      }
    } catch (e) {
      console.error("Failed to fetch historical stats", e);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  useEffect(() => {
    // When range or filters change, fetch historical data
    if (timeRange !== '1H') { // For 1H we can still use live, but let's fetch anyway for consistency
      fetchHistoricalStats();
    }
  }, [timeRange, selectedServerIds, selectedTargets]);

  // Calculate filtered chart data
  const filteredChartData = history.map(point => {
    let sum = 0;
    let count = 0;

    if (!point.raw || Object.keys(point.raw).length === 0) {
      return { name: point.name, latency: point.latency || 0 };
    }

    Object.entries(point.raw).forEach(([sidStr, targetMap]: [string, any]) => {
      const sid = parseInt(sidStr);
      // Check if server is selected
      if (selectedServerIds.length > 0 && !selectedServerIds.includes(sid)) return;

      Object.entries(targetMap).forEach(([target, lat]: [string, any]) => {
        // Check if target is selected
        if (selectedTargets.length > 0 && !selectedTargets.includes(target)) return;

        if (lat > 0) {
          sum += lat;
          count++;
        }
      });
    });

    return {
      name: point.name,
      latency: count > 0 ? Math.round((sum / count) * 10) / 10 : 0
    };
  });

  return (
    <div className="relative max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="absolute inset-0 z-[-1] pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px]" />
      </div>

      {/* Header Section */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800/50">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <LayoutDashboard className="w-6 h-6 text-emerald-400" />
            </div>
            {t('system_overview')}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 ml-1">{t('real_time_metrics')}</p>
        </div>
        <div className="flex items-center gap-3 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 px-4 py-2 rounded-xl backdrop-blur-sm shadow-sm">
          <Clock className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <span className="text-sm text-zinc-600 dark:text-zinc-300 font-mono">
            {new Date().toLocaleTimeString()}
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-2" />
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            label: t('online_servers'),
            value: `${stats.onlineServers} / ${stats.totalServers}`,
            icon: ServerIcon,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10',
            trend: `${stats.totalServers > 0 ? Math.round((stats.onlineServers / stats.totalServers) * 100) : 0}% ${t('online_servers')}`
          },
          {
            label: t('network_latency'),
            value: `${Math.round(stats.avgLatency)} ms`,
            icon: Activity,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10',
            trend: stats.avgLatency < 50 ? t('low_latency') : stats.avgLatency < 150 ? t('moderate') : t('high_latency')
          },
          {
            label: t('system_health'),
            value: stats.totalServers > 0 && stats.onlineServers === stats.totalServers ? t('optimal') : stats.onlineServers > 0 ? t('warning') : t('critical'),
            icon: ShieldCheck,
            color: stats.onlineServers === stats.totalServers ? 'text-purple-400' : 'text-amber-400',
            bg: stats.onlineServers === stats.totalServers ? 'bg-purple-500/10' : 'bg-amber-500/10',
            trend: stats.totalServers - stats.onlineServers > 0 ? `${stats.totalServers - stats.onlineServers} ${t('nodes_offline')}` : t('all_systems_nominal')
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="group relative bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/50 p-6 rounded-2xl transition-all duration-300 hover:border-emerald-500/30 dark:hover:border-zinc-700/80 hover:shadow-xl hover:shadow-emerald-500/5 dark:hover:shadow-black/20"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl ${stat.bg} border border-zinc-100 dark:border-white/5`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800/50 px-2 py-1 rounded-full border border-zinc-200 dark:border-zinc-700/50 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                {stat.trend}
              </span>
            </div>
            <div>
              <p className="text-zinc-500 dark:text-zinc-500 text-sm font-medium ml-1">{stat.label}</p>
              <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mt-1 tracking-tight">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Chart Section */}
      <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/50 p-6 rounded-2xl shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{t('cluster_latency_trend')}</h3>
            <p className="text-sm text-zinc-500">{t('filtered_response_time')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Server Filter */}
            <div className="relative">
              <button
                onClick={() => { setShowServerFilter(!showServerFilter); setShowTargetFilter(false); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${selectedServerIds.length > 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-zinc-50 dark:bg-zinc-950/50 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400'}`}
              >
                <ServerIcon className="w-3.5 h-3.5" />
                {selectedServerIds.length === 0 ? t('all_servers') : `${selectedServerIds.length} ${t('selected')}`}
                <ChevronDown className={`w-3 h-3 transition-transform ${showServerFilter ? 'rotate-180' : ''}`} />
              </button>

              {showServerFilter && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2 rounded-xl shadow-2xl z-20 animate-in fade-in zoom-in-95 duration-200">
                  <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1">
                    <button
                      onClick={() => setSelectedServerIds([])}
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px] flex items-center justify-between group"
                    >
                      <span className={selectedServerIds.length === 0 ? 'text-emerald-500 font-bold' : 'text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200'}>{t('all_servers')}</span>
                      {selectedServerIds.length === 0 && <Check className="w-3 h-3 text-emerald-400" />}
                    </button>
                    {servers.map(s => (
                      <button
                        key={s.ID}
                        onClick={() => {
                          setSelectedServerIds(prev => prev.includes(s.ID) ? prev.filter(id => id !== s.ID) : [...prev, s.ID]);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px] flex items-center justify-between group"
                      >
                        <span className={selectedServerIds.includes(s.ID) ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200'}>{s.name}</span>
                        {selectedServerIds.includes(s.ID) && <Check className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Target Filter */}
            <div className="relative">
              <button
                onClick={() => { setShowTargetFilter(!showTargetFilter); setShowServerFilter(false); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${selectedTargets.length > 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-zinc-50 dark:bg-zinc-950/50 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400'}`}
              >
                <Activity className="w-3.5 h-3.5" />
                {selectedTargets.length === 0 ? t('all_targets') : `${selectedTargets.length} ${t('selected')}`}
                <ChevronDown className={`w-3 h-3 transition-transform ${showTargetFilter ? 'rotate-180' : ''}`} />
              </button>

              {showTargetFilter && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2 rounded-xl shadow-2xl z-20 animate-in fade-in zoom-in-95 duration-200">
                  <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1">
                    <button
                      onClick={() => setSelectedTargets([])}
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px] flex items-center justify-between group"
                    >
                      <span className={selectedTargets.length === 0 ? 'text-emerald-500 font-bold' : 'text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200'}>{t('all_targets')}</span>
                      {selectedTargets.length === 0 && <Check className="w-3 h-3 text-emerald-400" />}
                    </button>
                    {availableTargets.map(t => (
                      <button
                        key={t.name}
                        onClick={() => {
                          setSelectedTargets(prev => prev.includes(t.name) ? prev.filter(id => id !== t.name) : [...prev, t.name]);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px] flex items-center justify-between group"
                      >
                        <span className={selectedTargets.includes(t.name) ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200'}>{t.name}</span>
                        {selectedTargets.includes(t.name) && <Check className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex bg-zinc-100 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1">
              {[
                { label: t('hour_1'), value: '1H' },
                { label: t('hours_24'), value: '24H' },
                { label: t('days_7'), value: '7D' },
                { label: t('month_1'), value: '1M' }
              ].map((range) => (
                <button
                  key={range.value}
                  onClick={() => setTimeRange(range.value)}
                  className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${timeRange === range.value
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm border border-zinc-200 dark:border-zinc-700'
                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                    }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="h-[320px] w-full relative group" onClick={() => { setShowServerFilter(false); setShowTargetFilter(false); }}>
          {isHistoryLoading && (
            <div className="absolute inset-0 bg-zinc-950/20 backdrop-blur-[1px] z-10 flex items-center justify-center transition-all duration-300 rounded-xl">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"></div>
              </div>
            </div>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              key={timeRange} // Key on timeRange forces a fresh animation for path but keeps component for smooth transition
              data={filteredChartData.length > 0 ? filteredChartData : [{ name: t('waiting'), latency: 0 }]}
            >
              <defs>
                <linearGradient id="colorLat" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? "#27272a" : "#e4e4e7"} vertical={false} />
              <XAxis
                dataKey="name"
                stroke={theme === 'dark' ? "#52525b" : "#a1a1aa"}
                fontSize={12}
                tickLine={false}
                axisLine={false}
                dy={10}
              />
              <YAxis
                stroke={theme === 'dark' ? "#52525b" : "#a1a1aa"}
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}ms`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: theme === 'dark' ? 'rgba(24, 24, 27, 0.8)' : 'rgba(255, 255, 255, 0.9)',
                  borderColor: theme === 'dark' ? 'rgba(63, 63, 70, 0.5)' : 'rgba(228, 228, 231, 0.8)',
                  backdropFilter: 'blur(12px)',
                  borderRadius: '12px',
                  color: theme === 'dark' ? '#f4f4f5' : '#18181b',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
                itemStyle={{ color: '#10b981' }}
                formatter={(val) => `${val}ms`}
                cursor={{ stroke: theme === 'dark' ? '#3f3f46' : '#e4e4e7', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Area
                type="monotone"
                dataKey="latency"
                stroke="#10b981"
                fillOpacity={1}
                fill="url(#colorLat)"
                strokeWidth={3}
                animationDuration={1500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Servers Grid Section */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            {t('connected_servers')}
            <span className="text-xs font-medium text-zinc-500 bg-zinc-100 dark:bg-zinc-800/50 px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-800">
              {servers.length} {t('online_servers')}
            </span>
          </h3>
        </div>

        {loading ? (
          <div className="h-40 flex items-center justify-center text-zinc-500">
            {t('loading_servers')}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {servers.map((server) => (
              <ServerCard key={server.ID} server={server} />
            ))}

            {/* Empty State / Add New Placeholder */}
            {servers.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center p-12 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50 dark:bg-zinc-900/20 text-center group hover:border-emerald-500/30 dark:hover:border-zinc-700/80 transition-all cursor-pointer">
                <div className="w-12 h-12 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Plus className="w-6 h-6 text-zinc-400 dark:text-zinc-500 group-hover:text-emerald-400" />
                </div>
                <h4 className="text-zinc-600 dark:text-zinc-300 font-medium">{t('no_servers')}</h4>
                <p className="text-zinc-400 dark:text-zinc-500 text-sm mt-1">{t('add_first_server')}</p>
              </div>
            )}
          </div>
        )
        }
      </section >
    </div >
  );
};

export default Dashboard;