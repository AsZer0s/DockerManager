import React, { useState, useEffect, useRef } from 'react';
import { containerApi, FileEntry, FileListResponse, FileContentResponse } from '../lib/api';
import { Folder, FileText, ArrowLeft, Download, RefreshCw, AlertTriangle, Loader2, X } from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { format } from 'date-fns';

interface ContainerFileManagerProps {
  serverId: string;
  containerId: string;
}

const ContainerFileManager: React.FC<ContainerFileManagerProps> = ({ serverId, containerId }) => {
  const { t } = useApp();
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [showFileContentModal, setShowFileContentModal] = useState(false);
  const [currentFileViewing, setCurrentFileViewing] = useState<string | null>(null);

  useEffect(() => {
    fetchFiles(currentPath);
  }, [currentPath, serverId, containerId]);

  const fetchFiles = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await containerApi.listContainerFiles(serverId, containerId, path);
      setFiles(response.data.files || []);
      setCurrentPath(response.data.path); // Update path from backend response
    } catch (err: any) {
      setError(`${t('failed_to_list_files')}: ${err.response?.data?.error || err.message}`);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileClick = async (file: FileEntry) => {
    // Treat directories and symbolic links as navigable paths
    if (file.is_dir || file.is_symlink) {
      setCurrentPath((prevPath) => (prevPath === '/' ? `/${file.name}` : `${prevPath}/${file.name}`));
    } else {
      // View file content
      setCurrentFileViewing(file.name);
      setShowFileContentModal(true);
      setFileContent(null); // Reset content when opening new file
      try {
        const response = await containerApi.getContainerFileContent(serverId, containerId, `${currentPath === '/' ? '' : currentPath}/${file.name}`);
        setFileContent(response.data.content);
      } catch (err: any) {
        setFileContent(`${t('failed_to_load_file_content')}: ${err.response?.data?.error || err.message}`);
      }
    }
  };

  const handleGoBack = () => {
    if (currentPath === '/') return;
    const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
    setCurrentPath(parentPath);
  };

  const handleDownloadFile = (file: FileEntry) => {
    // This would typically involve a backend endpoint that streams the file
    // For now, we'll just log it or show a placeholder.
    alert(`${t('download_not_implemented').replace('${file.name}', file.name)}`);
  };

  const renderFileContentModal = () => {
    if (!showFileContentModal) return null;
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-50 p-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{t('viewing')} {currentFileViewing}</h3>
            <button onClick={() => setShowFileContentModal(false)} className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-grow p-4 overflow-auto text-xs text-zinc-600 dark:text-zinc-400 font-mono bg-white dark:bg-transparent">
            {fileContent === null ? (
              <div className="text-center py-10">
                <Loader2 className="w-6 h-6 mx-auto animate-spin text-emerald-400" />
                <p className="mt-2">{t('loading_file_content')}</p>
              </div>
            ) : (
              <pre>{fileContent}</pre>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-grow flex flex-col bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
      {renderFileContentModal()}

      <div className="flex items-center gap-2 mb-4 text-zinc-500 dark:text-zinc-400">
        <button
          onClick={handleGoBack}
          disabled={currentPath === '/'}
          className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={t('go_back')}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="font-mono text-sm flex-grow truncate px-2 py-1 bg-zinc-100 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800/50">{currentPath}</span>
        <button
          onClick={() => fetchFiles(currentPath)}
          className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          title={t('refresh')}
          disabled={loading}
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && (
        <div className="text-center py-10 text-zinc-400">
          <Loader2 className="w-8 h-8 mx-auto animate-spin mb-4" />
          <p>{t('loading_files')}</p>
        </div>
      )}

      {error && (
        <div className="text-center py-10 text-rose-400">
          <AlertTriangle className="w-8 h-8 mx-auto mb-4" />
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && files.length === 0 && (
        <div className="text-center py-10 text-zinc-500">
          <FileText className="w-10 h-10 mx-auto mb-4 opacity-20" />
          <p>{t('no_files_found')}</p>
        </div>
      )}

      {!loading && !error && files.length > 0 && (
        <div className="flex-grow overflow-y-auto custom-scrollbar border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left text-zinc-500 dark:text-zinc-400">
            <thead className="text-xs text-zinc-500 dark:text-zinc-200 uppercase bg-zinc-50 dark:bg-zinc-800/80 sticky top-0 backdrop-blur-sm border-b border-zinc-200 dark:border-zinc-700">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">{t('name')}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t('size')}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t('permissions')}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t('modified')}</th>
                <th scope="col" className="px-4 py-3 font-semibold text-center">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.name} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors group">
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap" onClick={() => handleFileClick(file)}>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${file.is_dir ? 'bg-blue-500/10' : 'bg-zinc-500/10'}`}>
                        {file.is_dir ? <Folder className="w-4 h-4 text-blue-600 dark:text-blue-400" /> : <FileText className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />}
                      </div>
                      {file.name}
                    </div>
                  </td>
                  <td className="px-4 py-3">{file.is_dir ? '-' : `${(file.size / 1024).toFixed(1)} KB`}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-[11px] px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700">
                      {file.mode} ({file.permissions})
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">{format(new Date(file.mod_time), 'yyyy/MM/dd HH:mm')}</td>
                  <td className="px-4 py-3 text-center">
                    {!file.is_dir && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDownloadFile(file); }}
                        className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                        title={t('download')}
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ContainerFileManager;