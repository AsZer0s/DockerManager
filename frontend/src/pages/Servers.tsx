import React, { useState, useEffect } from 'react';
import {
  Server as ServerIcon,
  Plus
} from 'lucide-react';
import { serverApi, Server, ServerPayload, ServerStats } from '../lib/api';
import ServerModal from '../components/ServerModal';
import ConfirmModal from '../components/ConfirmModal';
import ServerCard from '../components/ServerCard'; // Import ServerCard
import { useAuth } from '../hooks/useAuth';
import { useApp } from '../hooks/useApp';

interface ServerWithStatus extends Server {
  status: ServerStats['status'];
  cpuUsage: ServerStats['cpu_usage'];
  ramUsage: ServerStats['ram_usage'];
  dockerVersion: ServerStats['docker_version'];
  uptime: ServerStats['uptime'];
}

const Servers: React.FC = () => {
  const [servers, setServers] = useState<ServerWithStatus[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [serverToDelete, setServerToDelete] = useState<Server | null>(null);
  const [activeMenu, setActiveMenu] = useState<number | null>(null);
  const { user } = useAuth();
  const { t } = useApp();

  // Load cache on initial mount
  useEffect(() => {
    const cachedServers = localStorage.getItem('dm_servers_cache');
    if (cachedServers) {
      try {
        const parsed = JSON.parse(cachedServers);
        setServers(parsed);
      } catch (e) {
        console.error("Failed to parse cached servers", e);
      }
    }
  }, []);

  const fetchServers = async () => {
    try {
      const response = await serverApi.listServers();
      const serversFromApi: Server[] = response.data;

      // Update state with base server info immediately, 
      // preserving existing stats/status from current state or cache
      setServers(prev => {
        const updated = serversFromApi.map(server => {
          const existing = prev.find(s => s.ID === server.ID);
          if (existing) {
            return { ...server, ...existing, name: server.name, ip: server.ip, port: server.port };
          }
          return {
            ...server,
            status: 'loading' as const,
            cpuUsage: 0,
            ramUsage: 0,
            dockerVersion: '...',
            uptime: '-'
          };
        });
        // Save base list to cache immediately
        localStorage.setItem('dm_servers_cache', JSON.stringify(updated));
        return updated;
      });

      // Fetch stats individually to avoid blocking the whole list
      serversFromApi.forEach(async (server) => {
        try {
          const statsResponse = await serverApi.getServerStats(server.ID.toString());
          const stats = statsResponse.data;

          setServers(prev => {
            const newServers = prev.map(s => {
              if (s.ID === server.ID) {
                // Logic to prevent 0-stats overwrite (from original code)
                if (stats.cpu_usage === 0 && stats.ram_usage === 0 && (s.cpuUsage !== 0 || s.ramUsage !== 0)) {
                  return { ...s, status: stats.status };
                }
                return {
                  ...s,
                  status: stats.status,
                  cpuUsage: stats.cpu_usage,
                  ramUsage: stats.ram_usage,
                  dockerVersion: stats.docker_version,
                  uptime: stats.uptime,
                };
              }
              return s;
            });

            // Save to cache after each update to ensure most recent data is kept
            localStorage.setItem('dm_servers_cache', JSON.stringify(newServers));
            return newServers;
          });
        } catch (statsError) {
          console.warn(`Failed to fetch stats for server ${server.name}:`, statsError);
          setServers(prev => prev.map(s =>
            s.ID === server.ID ? { ...s, status: 'offline' as const } : s
          ));
        }
      });

    } catch (error) {
      console.error("Failed to fetch servers", error);
    }
  };

  useEffect(() => {
    fetchServers();

    const interval = setInterval(() => {
      fetchServers();
    }, 10000); // Refresh every 10 seconds for better responsiveness

    return () => clearInterval(interval);
  }, []);

  const handleSaveServer = async (payload: ServerPayload) => {
    try {
      if (editingServer) {
        await serverApi.updateServer(editingServer.ID.toString(), payload);
      } else {
        await serverApi.createServer(payload);
      }
      setIsModalOpen(false);
      setEditingServer(null);
      fetchServers();
    } catch (error) {
      console.error("Failed to save server", error);
    }
  };

  const handleDeleteConfirm = async () => {
    if (serverToDelete) {
      try {
        await serverApi.deleteServer(serverToDelete.ID.toString());
        setIsConfirmOpen(false);
        setServerToDelete(null);
        fetchServers();
      } catch (error) {
        console.error("Failed to delete server", error);
      }
    }
  };

  const openEditModal = (server: Server) => {
    setEditingServer(server);
    setIsModalOpen(true);
    setActiveMenu(null);
  };

  const openDeleteConfirm = (server: Server) => {
    setServerToDelete(server);
    setIsConfirmOpen(true);
    setActiveMenu(null);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">

      {/* Header Section */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800/50">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <ServerIcon className="w-6 h-6 text-emerald-400" />
            </div>
            {t('servers')}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 ml-1">{t('server_mgmt_desc')}</p>
        </div>
        {user?.role === 'admin' && (
          <button
            onClick={() => { setEditingServer(null); setIsModalOpen(true); }}
            className="group bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-zinc-950 font-bold py-2.5 px-5 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:-translate-y-0.5"
          >
            <Plus className="w-5 h-5 transition-transform group-hover:rotate-90" />
            {t('connect_server')}
          </button>
        )}
      </header>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* Server Cards */}
        {servers.map((server) => (
          <ServerCard
            key={server.ID}
            server={server}
            onEdit={openEditModal}
            onDelete={openDeleteConfirm}
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
          />
        ))}

        {/* Add Server Placeholder Card (Empty State) */}
        {user?.role === 'admin' && (
          <button
            onClick={() => { setEditingServer(null); setIsModalOpen(true); }}
            className="group flex flex-col items-center justify-center min-h-[280px] rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-emerald-500/30 bg-zinc-50 dark:bg-zinc-900/20 hover:bg-zinc-100 dark:hover:bg-zinc-900/40 transition-all duration-300 cursor-pointer"
          >
            <div className="h-14 w-14 rounded-full bg-zinc-200 dark:bg-zinc-800/50 flex items-center justify-center group-hover:bg-emerald-500/10 group-hover:scale-110 transition-all duration-300">
              <Plus className="w-6 h-6 text-zinc-400 dark:text-zinc-50 group-hover:text-emerald-400" />
            </div>
            <p className="mt-4 font-medium text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200">{t('connect_new_server')}</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">{t('add_via_ssh')}</p>
          </button>
        )}
      </div>

      {/* Modals */}
      <ServerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveServer}
        editingServer={editingServer}
      />

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleDeleteConfirm}
        title={t('delete_server')}
        message={t('delete_server_confirm').replace('{name}', serverToDelete?.name || '')}
        confirmText={t('delete')}
        isDestructive={true}
      />
    </div>
  );
};

export default Servers;
