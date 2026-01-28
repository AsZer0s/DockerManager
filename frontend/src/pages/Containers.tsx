import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Box,
  Play,
  Square,
  RotateCw,
  Trash2,
  ChevronLeft,
  Activity,
  Clock,
  Shield,
  Search,
  RefreshCw,
  Info
} from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { containerApi, Container } from '../lib/api';
import ContainerModal from '../components/ContainerModal';
import ConfirmModal from '../components/ConfirmModal'; // Import ConfirmModal

const Containers: React.FC = () => {
  const { serverId } = useParams<{ serverId: string }>();
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { t } = useApp();

  // Modal State
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Confirmation Modal State
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [actionToConfirm, setActionToConfirm] = useState<'start' | 'stop' | 'restart' | 'remove' | null>(null);
  const [containerIdToConfirm, setContainerIdToConfirm] = useState<string | null>(null);

  const fetchContainers = async () => {
    try {
      setLoading(true);
      const response = await containerApi.listContainers(serverId!);
      const fetchedContainers = response.data && Array.isArray(response.data.containers)
        ? response.data.containers
        : [];
      setContainers(fetchedContainers);
      setError(null);
    } catch (err: any) {
      setError(`${t('fetch_containers_error')}: ${err.response?.data?.error || err.message}`);
      console.error('Error fetching containers:', err);
      setContainers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (serverId) {
      fetchContainers();
    }
  }, [serverId]);

  // Function to execute the action after confirmation
  const executeAction = async (containerId: string, action: 'start' | 'stop' | 'restart' | 'remove') => {
    try {
      setActionLoading(`${containerId}-${action}`);
      await containerApi.containerAction({
        server_id: parseInt(serverId!),
        container_id: containerId,
        action: action
      });
      await fetchContainers(); // Refresh list after successful action
    } catch (err: any) {
      alert(`${t('action_failed')}: ${err.response?.data?.error || err.message}`);
    } finally {
      setActionLoading(null);
      setContainerIdToConfirm(null); // Clear confirmed IDs
      setActionToConfirm(null);
    }
  };

  // Handler to open the confirmation modal
  const handleAction = (containerId: string, action: 'start' | 'stop' | 'restart' | 'remove') => {
    setActionToConfirm(action);
    setContainerIdToConfirm(containerId);
    setIsConfirmModalOpen(true);
  };

  const filteredContainers = containers.filter(c =>
    (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.image || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.id || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (state: string | undefined) => {
    if (!state) {
      return 'text-zinc-400 bg-zinc-400/10 border-zinc-500/20';
    }
    switch (state.toLowerCase()) {
      case 'running': return 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20';
      case 'exited': return 'text-rose-400 bg-rose-400/10 border-rose-500/20';
      case 'paused': return 'text-amber-400 bg-amber-400/10 border-amber-500/20';
      default: return 'text-zinc-400 bg-zinc-400/10 border-zinc-500/20';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            to="/servers"
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-3">
              <Box className="w-7 h-7 text-emerald-400" />
              {t('container_mgmt')}
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">{t('container_status_for').replace('{id}', serverId || '')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
            <input
              type="text"
              placeholder={t('search_containers')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 pl-10 pr-4 text-sm text-zinc-900 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all w-64 shadow-sm"
            />
          </div>
          <button
            onClick={fetchContainers}
            className="p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all shadow-sm"
            title={t('refresh_list')}
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3 text-rose-400 animate-in slide-in-from-top-2">
          <Shield className="w-5 h-5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Containers Table */}
      <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/50 rounded-2xl overflow-hidden shadow-sm dark:shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t('container_details')}</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t('image')}</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t('status')}</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t('port_mapping')}</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t('created_at')}</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`loading-row-${i}`} className="animate-pulse">
                    <td colSpan={6} className="px-6 py-8">
                      <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-full"></div>
                    </td>
                  </tr>
                ))
              ) : filteredContainers.length === 0 ? (
                <tr key="empty-state">
                  <td colSpan={6} className="px-6 py-12 text-center text-zinc-500">
                    <div className="flex flex-col items-center gap-2">
                      <Box className="w-10 h-10 opacity-20" />
                      <p>{t('no_containers_found')}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredContainers.map((container) => (
                  <tr key={container.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg border ${getStatusColor(container.state || 'unknown')}`}>
                          <Box className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors">
                            {(container.name || '').replace(/^\//, '')}
                          </p>
                          <p className="font-mono text-[10px] text-zinc-500 mt-0.5 uppercase tracking-tighter">
                            {(container.id || '').substring(0, 12)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 max-w-[200px]">
                        <Activity className="w-3.5 h-3.5 text-zinc-600" />
                        <span className="text-sm text-zinc-400 truncate" title={container.image}>
                          {container.image}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${getStatusColor(container.state)}`}>
                        {container.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(container.ports || []).length > 0 ? (
                          (container.ports || []).map((port: string, idx: number) => (
                            <span key={`port-${container.id}-${idx}`} className="bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-[10px] px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 font-mono">
                              {port}
                            </span>
                          ))
                        ) : (
                          <span className="text-zinc-600 text-xs">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-zinc-500 text-sm font-mono">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(container.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedContainerId(container.id);
                            setIsModalOpen(true);
                          }}
                          className="p-2 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg border border-zinc-200 dark:border-zinc-700 transition-all shadow-sm"
                          title={t('details_config')}
                        >
                          <Info className="w-4 h-4" />
                        </button>
                        {container.state !== 'running' ? (
                          <button
                            onClick={() => handleAction(container.id, 'start')}
                            disabled={!!actionLoading}
                            className="p-2 bg-emerald-500/5 dark:bg-emerald-500/10 hover:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-500/20 transition-all disabled:opacity-50"
                            title={t('start')}
                          >
                            <Play className="w-4 h-4 fill-current" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAction(container.id, 'stop')}
                            disabled={!!actionLoading}
                            className="p-2 bg-amber-500/5 dark:bg-amber-500/10 hover:bg-amber-500/10 dark:hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg border border-amber-500/20 transition-all disabled:opacity-50"
                            title={t('stop')}
                          >
                            <Square className="w-4 h-4 fill-current" />
                          </button>
                        )}
                        <button
                          onClick={() => handleAction(container.id, 'restart')}
                          disabled={!!actionLoading}
                          className="p-2 bg-blue-500/5 dark:bg-blue-500/10 hover:bg-blue-500/10 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg border border-blue-500/20 transition-all disabled:opacity-50"
                          title={t('restart')}
                        >
                          <RotateCw className={`w-4 h-4 ${actionLoading === `${container.id}-restart` ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => handleAction(container.id, 'remove')}
                          disabled={!!actionLoading}
                          className="p-2 bg-rose-500/5 dark:bg-rose-500/10 hover:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg border border-rose-500/20 transition-all disabled:opacity-50"
                          title={t('delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Container Details Modal */}
      {selectedContainerId && (
        <ContainerModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          serverId={serverId!}
          containerId={selectedContainerId}
        />
      )}

      {/* Confirmation Modal */}
      {isConfirmModalOpen && (
        <ConfirmModal
          isOpen={isConfirmModalOpen}
          onClose={() => setIsConfirmModalOpen(false)}
          onConfirm={() => {
            if (containerIdToConfirm && actionToConfirm) {
              executeAction(containerIdToConfirm, actionToConfirm);
            }
            setIsConfirmModalOpen(false);
          }}
          title={actionToConfirm ? t('confirm_action_title').replace('{action}', t(actionToConfirm as any)) : ''}
          message={actionToConfirm ? t('confirm_action_msg').replace('{id}', containerIdToConfirm?.substring(0, 12) || '').replace('{action}', t(actionToConfirm as any)) : ''}
        />
      )}
    </div>
  );
};

export default Containers;
