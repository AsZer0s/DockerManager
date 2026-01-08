import React, { useState, useEffect } from 'react';
import { useWebSocket, useFileManager } from '../hooks/useWebSocket';
import './WebSocketFileManager.css';

/**
 * WebSocket 文件管理器组件
 */
const WebSocketFileManager = ({ serverId, serverName }) => {
  const { isConnected, connect } = useWebSocket();
  const { currentPath, files, loading, listDirectory, createDirectory, deleteFile, navigateTo } = useFileManager();
  
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [viewMode, setViewMode] = useState('list'); // list | grid

  // 自动连接 WebSocket
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && !isConnected) {
      connect(token).catch(error => {
        console.error('WebSocket 连接失败:', error);
      });
    }
  }, [isConnected, connect]);

  // 加载文件列表
  useEffect(() => {
    if (isConnected && serverId) {
      loadFiles();
    }
  }, [isConnected, serverId, currentPath]);

  const loadFiles = async () => {
    try {
      await listDirectory(serverId, currentPath);
    } catch (error) {
      console.error('加载文件列表失败:', error);
      alert('加载文件列表失败: ' + error.message);
    }
  };

  const handleNavigate = (path) => {
    navigateTo(path);
  };

  const handleFileClick = (file) => {
    if (file.isDirectory) {
      const newPath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
      handleNavigate(newPath);
    } else {
      // 选择/取消选择文件
      const newSelected = new Set(selectedFiles);
      if (newSelected.has(file.name)) {
        newSelected.delete(file.name);
      } else {
        newSelected.add(file.name);
      }
      setSelectedFiles(newSelected);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      const folderPath = currentPath === '/' ? `/${newFolderName}` : `${currentPath}/${newFolderName}`;
      await createDirectory(serverId, folderPath);
      setShowCreateDialog(false);
      setNewFolderName('');
    } catch (error) {
      console.error('创建文件夹失败:', error);
      alert('创建文件夹失败: ' + error.message);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedFiles.size === 0) return;

    const confirmed = window.confirm(`确定要删除选中的 ${selectedFiles.size} 个文件/文件夹吗？`);
    if (!confirmed) return;

    try {
      for (const fileName of selectedFiles) {
        const filePath = currentPath === '/' ? `/${fileName}` : `${currentPath}/${fileName}`;
        const file = files.find(f => f.name === fileName);
        await deleteFile(serverId, filePath, file?.isDirectory);
      }
      setSelectedFiles(new Set());
    } catch (error) {
      console.error('删除文件失败:', error);
      alert('删除文件失败: ' + error.message);
    }
  };

  const handleGoUp = () => {
    if (currentPath !== '/') {
      const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
      handleNavigate(parentPath);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString();
  };

  const getFileIcon = (file) => {
    if (file.isDirectory) return '📁';
    if (file.isSymbolicLink) return '🔗';
    
    const ext = file.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'txt': case 'md': case 'readme': return '📄';
      case 'js': case 'ts': case 'jsx': case 'tsx': return '📜';
      case 'json': case 'xml': case 'yaml': case 'yml': return '📋';
      case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': return '🖼️';
      case 'mp4': case 'avi': case 'mov': case 'mkv': return '🎬';
      case 'mp3': case 'wav': case 'flac': return '🎵';
      case 'zip': case 'tar': case 'gz': case '7z': return '📦';
      case 'pdf': return '📕';
      case 'doc': case 'docx': return '📘';
      case 'xls': case 'xlsx': return '📗';
      default: return '📄';
    }
  };

  const sortedFiles = [...files].sort((a, b) => {
    // 目录优先
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;

    let aValue, bValue;
    switch (sortBy) {
      case 'name':
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
        break;
      case 'size':
        aValue = a.size || 0;
        bValue = b.size || 0;
        break;
      case 'mtime':
        aValue = new Date(a.mtime).getTime();
        bValue = new Date(b.mtime).getTime();
        break;
      default:
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
    }

    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <div className="websocket-file-manager">
      <div className="file-manager-header">
        <div className="path-bar">
          <button 
            className="btn-up" 
            onClick={handleGoUp}
            disabled={currentPath === '/'}
            title="返回上级目录"
          >
            ⬆️
          </button>
          <div className="current-path">
            <span className="server-name">{serverName}:</span>
            <span className="path">{currentPath}</span>
          </div>
        </div>

        <div className="toolbar">
          <button 
            className="btn-create" 
            onClick={() => setShowCreateDialog(true)}
            disabled={!isConnected}
            title="新建文件夹"
          >
            📁+ 新建文件夹
          </button>
          
          <button 
            className="btn-delete" 
            onClick={handleDeleteSelected}
            disabled={selectedFiles.size === 0}
            title="删除选中项"
          >
            🗑️ 删除 ({selectedFiles.size})
          </button>

          <button 
            className="btn-refresh" 
            onClick={loadFiles}
            disabled={loading}
            title="刷新"
          >
            🔄 刷新
          </button>

          <div className="view-controls">
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="sort-select"
            >
              <option value="name">按名称</option>
              <option value="size">按大小</option>
              <option value="mtime">按时间</option>
            </select>
            
            <button 
              className="btn-sort-order"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              title={sortOrder === 'asc' ? '升序' : '降序'}
            >
              {sortOrder === 'asc' ? '⬆️' : '⬇️'}
            </button>

            <button 
              className={`btn-view-mode ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="列表视图"
            >
              📋
            </button>
            
            <button 
              className={`btn-view-mode ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="网格视图"
            >
              ⊞
            </button>
          </div>
        </div>
      </div>

      <div className={`file-list ${viewMode}`}>
        {loading ? (
          <div className="loading">正在加载文件列表...</div>
        ) : sortedFiles.length === 0 ? (
          <div className="empty">此目录为空</div>
        ) : (
          sortedFiles.map((file) => (
            <div
              key={file.name}
              className={`file-item ${selectedFiles.has(file.name) ? 'selected' : ''} ${file.isDirectory ? 'directory' : 'file'}`}
              onClick={() => handleFileClick(file)}
              onDoubleClick={() => file.isDirectory && handleFileClick(file)}
            >
              <div className="file-icon">
                {getFileIcon(file)}
              </div>
              
              <div className="file-info">
                <div className="file-name" title={file.name}>
                  {file.name}
                </div>
                
                {viewMode === 'list' && (
                  <>
                    <div className="file-size">
                      {file.isDirectory ? '-' : formatFileSize(file.size)}
                    </div>
                    
                    <div className="file-permissions">
                      {file.permissions}
                    </div>
                    
                    <div className="file-mtime">
                      {formatDate(file.mtime)}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="file-manager-footer">
        <div className="status-info">
          <span>共 {files.length} 项</span>
          {selectedFiles.size > 0 && (
            <span>已选择 {selectedFiles.size} 项</span>
          )}
          <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '● 已连接' : '● 未连接'}
          </span>
        </div>
      </div>

      {/* 创建文件夹对话框 */}
      {showCreateDialog && (
        <div className="dialog-overlay">
          <div className="dialog">
            <div className="dialog-header">
              <h3>新建文件夹</h3>
              <button 
                className="btn-close"
                onClick={() => setShowCreateDialog(false)}
              >
                ✕
              </button>
            </div>
            
            <div className="dialog-body">
              <input
                type="text"
                placeholder="文件夹名称"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                autoFocus
              />
            </div>
            
            <div className="dialog-footer">
              <button 
                className="btn-cancel"
                onClick={() => setShowCreateDialog(false)}
              >
                取消
              </button>
              <button 
                className="btn-confirm"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebSocketFileManager;