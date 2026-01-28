import React, { useState, useEffect, useRef } from 'react';
import { X, Box, Info, AlertTriangle, CheckCircle, RefreshCw, Terminal as TerminalIcon, FileText, ScrollText } from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { containerApi } from '../lib/api';
import Terminal from './Terminal'; // Import the Terminal component
import ContainerFileManager from './ContainerFileManager'; // Import the file manager

interface ContainerModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  containerId: string;
}

type Tab = 'info' | 'exec' | 'file' | 'logs';

const ContainerModal: React.FC<ContainerModalProps> = ({ isOpen, onClose, serverId, containerId }) => {
  const { t } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>('info');
  const [details, setDetails] = useState<any>(null);
  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<{ checking: boolean, hasUpdate?: boolean, error?: string }>({ checking: false });
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null); // Ref for auto-scrolling logs

  useEffect(() => {
    if (isOpen && serverId && containerId) {
      // Only fetch details if the info tab is active or if details are not yet loaded
      if (activeTab === 'info' && !details) {
        fetchDetails();
      }
      if (activeTab === 'logs' && !logs) {
        fetchLogs();
      }
    }
  }, [isOpen, serverId, containerId, activeTab, details, logs]);

  // Effect for auto-scrolling logs to bottom
  useEffect(() => {
    if (activeTab === 'logs' && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, activeTab]);

  const fetchDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await containerApi.getContainerDetails(serverId, containerId);
      const parsedDetails = JSON.parse(response.data.details);
      setDetails(Array.isArray(parsedDetails) ? parsedDetails : parsedDetails);
    } catch (err: any) {
      setError(`${t('fetch_details_error')}: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const response = await containerApi.getContainerLogs(serverId, containerId, '1000'); // Fetch last 1000 lines
      setLogs(response.data.logs);
    } catch (err: any) {
      setLogsError(`${t('fetch_logs_error')}: ${err.response?.data?.error || err.message}`);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleCheckUpdate = async () => {
    setUpdateStatus({ checking: true });
    try {
      const response = await containerApi.checkContainerImageUpdate(serverId, containerId);
      setUpdateStatus({ checking: false, hasUpdate: response.data.has_update });
    } catch (err: any) {
      setUpdateStatus({ checking: false, error: `${t('check_update_error')}: ${err.response?.data?.error || err.message}` });
    }
  };

  if (!isOpen) return null;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'info':
        return (
          <div className="flex-grow overflow-y-auto"> {/* Added flex-grow and overflow-y-auto */}
            {loading && <div className="text-center py-10 text-zinc-500 dark:text-zinc-400">{t('loading_details')}</div>}
            {error && <div className="text-center py-10 text-rose-400">{error}</div>}

            {details && (
              <div className="space-y-6">
                {/* Basic Info */}
                <div>
                  <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-2">{t('basic_info')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <p><strong className="text-zinc-400">{t('username')}:</strong> {details?.Name?.replace(/^\//, '')}</p>
                    <p><strong className="text-zinc-400">{t('id')}:</strong> <span className="font-mono text-xs">{details?.Id?.substring(0, 12)}</span></p>
                    <p><strong className="text-zinc-400">{t('image_name')}:</strong> <span className="font-mono text-xs">{details?.Config?.Image}</span></p>
                    <p><strong className="text-zinc-400">{t('created')}:</strong> {new Date(details?.Created).toLocaleString()}</p>
                  </div>
                </div>

                {/* State */}
                <div>
                  <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-2">{t('status')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <p><strong className="text-zinc-400">{t('status')}:</strong> {details?.State?.Status}</p>
                    <p><strong className="text-zinc-400">{t('running')}:</strong> {details?.State?.Running ? t('yes') : t('no')}</p>
                    <p><strong className="text-zinc-400">PID:</strong> {details?.State?.Pid}</p>
                    <p><strong className="text-zinc-400">{t('start')}:</strong> {new Date(details?.State?.StartedAt).toLocaleString()}</p>
                  </div>
                </div>

                {/* Image Update Check */}
                <div>
                  <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-2">{t('image_update')}</h3>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleCheckUpdate}
                      disabled={updateStatus.checking}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/20 transition-all disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${updateStatus.checking ? 'animate-spin' : ''}`} />
                      {t('check_for_updates')}
                    </button>
                    {updateStatus.hasUpdate === true && <div className="flex items-center gap-2 text-emerald-400"><CheckCircle className="w-5 h-5" /> {t('newer_image_available')}</div>}
                    {updateStatus.hasUpdate === false && <div className="flex items-center gap-2 text-zinc-400"><Info className="w-5 h-5" /> {t('image_up_to_date')}</div>}
                    {updateStatus.error && <div className="flex items-center gap-2 text-rose-400"><AlertTriangle className="w-5 h-5" /> {updateStatus.error}</div>}
                  </div>
                </div>

                {/* Raw JSON */}
                <div className="pt-4">
                  <h3 className="text-sm font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">{t('raw_data')}</h3>
                  <pre className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-lg text-xs text-zinc-600 dark:text-zinc-400 overflow-auto max-h-96 border border-zinc-200 dark:border-zinc-800">
                    {JSON.stringify(details, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        );
      case 'exec':
        return (
          <div className="flex-grow w-full"> {/* Use flex-grow to fill available space */}
            <Terminal serverId={serverId} containerId={containerId} />
          </div>
        );
      case 'file':
        return (
          <ContainerFileManager serverId={serverId} containerId={containerId} />
        );
      case 'logs':
        return (
          <div className="relative flex-grow bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden"> {/* Use flex-grow */}
            {logsLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-50/80 dark:bg-zinc-950/80 z-10">
                <RefreshCw className="w-6 h-6 text-emerald-500 dark:text-emerald-400 animate-spin" />
                <span className="ml-2 text-zinc-500 dark:text-zinc-400">{t('loading_logs')}</span>
              </div>
            )}
            {logsError && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-50/80 dark:bg-zinc-950/80 z-10 text-rose-500 dark:text-rose-400">
                <AlertTriangle className="w-6 h-6 mr-2" />
                <span>{logsError}</span>
              </div>
            )}
            <pre className="text-xs text-zinc-600 dark:text-zinc-400 p-4 overflow-auto h-full font-mono">
              {logs || t('no_logs_available')}
              <div ref={logsEndRef} /> {/* Element to scroll to */}
            </pre>
            <button
              onClick={fetchLogs}
              className="absolute top-3 right-3 p-2 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg border border-zinc-200 dark:border-zinc-700 transition-all shadow-sm"
              title={t('refresh_logs')}
              disabled={logsLoading}
            >
              <RefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 ring-1 ring-black/5 dark:ring-white/10">

        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-950/20 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20`}>
              <Box className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{details?.[0]?.Name?.replace('/', '') || containerId.substring(0, 12)}</h2>
              <p className="text-xs text-zinc-500 font-mono">{containerId}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-950/10 overflow-x-auto no-scrollbar">
          {[
            { id: 'info', label: t('view_info'), icon: Info },
            { id: 'exec', label: t('view_terminal'), icon: TerminalIcon },
            { id: 'file', label: t('view_files'), icon: FileText },
            { id: 'logs', label: t('view_logs'), icon: ScrollText },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex items-center gap-2 px-4 py-4 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${activeTab === tab.id
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
                }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body - Tab Content */}
        <div className="p-6 overflow-y-auto flex-grow flex flex-col bg-white dark:bg-transparent">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};
export default ContainerModal;
