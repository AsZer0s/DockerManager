import { useState, useEffect, useCallback, useRef } from 'react';
import wsClient from '../utils/websocketClient';

/**
 * WebSocket Hook
 * 提供 React 组件中使用 WebSocket 的便捷方法
 */
export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [error, setError] = useState(null);
  
  useEffect(() => {
    // 监听连接状态变化
    const handleConnected = () => {
      setIsConnected(true);
      setConnectionStatus('connected');
      setError(null);
    };
    
    const handleDisconnected = () => {
      setIsConnected(false);
      setConnectionStatus('disconnected');
    };
    
    const handleError = (error) => {
      setError(error);
      setConnectionStatus('error');
    };
    
    wsClient.on('connected', handleConnected);
    wsClient.on('disconnected', handleDisconnected);
    wsClient.on('error', handleError);
    
    // 初始状态
    setIsConnected(wsClient.isConnected);
    setConnectionStatus(wsClient.isConnected ? 'connected' : 'disconnected');
    
    return () => {
      wsClient.off('connected', handleConnected);
      wsClient.off('disconnected', handleDisconnected);
      wsClient.off('error', handleError);
    };
  }, []);

  const connect = useCallback(async (token, options) => {
    try {
      setConnectionStatus('connecting');
      await wsClient.connect(token, options);
    } catch (error) {
      setError(error);
      setConnectionStatus('error');
      throw error;
    }
  }, []);

  const disconnect = useCallback(() => {
    wsClient.disconnect();
  }, []);

  return {
    isConnected,
    connectionStatus,
    error,
    connect,
    disconnect,
    client: wsClient
  };
}

/**
 * SSH 会话 Hook
 */
export function useSSHSession() {
  const [sessions, setSessions] = useState(new Map());
  const [outputs, setOutputs] = useState(new Map());
  
  useEffect(() => {
    // 监听 SSH 输出
    const handleSSHOutput = (message) => {
      const { sessionId, data } = message;
      setOutputs(prev => {
        const newOutputs = new Map(prev);
        const currentOutput = newOutputs.get(sessionId) || '';
        newOutputs.set(sessionId, currentOutput + data);
        return newOutputs;
      });
    };
    
    // 监听会话创建
    const handleSessionCreated = (message) => {
      const { sessionId, serverId, serverName } = message;
      setSessions(prev => {
        const newSessions = new Map(prev);
        newSessions.set(sessionId, {
          sessionId,
          serverId,
          serverName,
          createdAt: Date.now(),
          isActive: true
        });
        return newSessions;
      });
    };
    
    // 监听会话关闭
    const handleSessionClosed = (message) => {
      const { sessionId } = message;
      setSessions(prev => {
        const newSessions = new Map(prev);
        if (newSessions.has(sessionId)) {
          newSessions.get(sessionId).isActive = false;
        }
        return newSessions;
      });
    };
    
    wsClient.on('ssh_output', handleSSHOutput);
    wsClient.on('ssh_session_created', handleSessionCreated);
    wsClient.on('ssh_session_closed', handleSessionClosed);
    
    return () => {
      wsClient.off('ssh_output', handleSSHOutput);
      wsClient.off('ssh_session_created', handleSessionCreated);
      wsClient.off('ssh_session_closed', handleSessionClosed);
    };
  }, []);

  const createSession = useCallback(async (serverId) => {
    try {
      const response = await wsClient.createSSHSession(serverId);
      return response.sessionId;
    } catch (error) {
      console.error('创建 SSH 会话失败:', error);
      throw error;
    }
  }, []);

  const executeCommand = useCallback(async (sessionId, command) => {
    try {
      return await wsClient.executeCommand(sessionId, command);
    } catch (error) {
      console.error('执行命令失败:', error);
      throw error;
    }
  }, []);

  const sendInput = useCallback(async (sessionId, data) => {
    try {
      return await wsClient.sendInput(sessionId, data);
    } catch (error) {
      console.error('发送输入失败:', error);
      throw error;
    }
  }, []);

  const resizeTerminal = useCallback(async (sessionId, cols, rows) => {
    try {
      return await wsClient.resizeTerminal(sessionId, cols, rows);
    } catch (error) {
      console.error('调整终端大小失败:', error);
      throw error;
    }
  }, []);

  const closeSession = useCallback(async (sessionId) => {
    try {
      await wsClient.closeSSHSession(sessionId);
      setSessions(prev => {
        const newSessions = new Map(prev);
        newSessions.delete(sessionId);
        return newSessions;
      });
      setOutputs(prev => {
        const newOutputs = new Map(prev);
        newOutputs.delete(sessionId);
        return newOutputs;
      });
    } catch (error) {
      console.error('关闭 SSH 会话失败:', error);
      throw error;
    }
  }, []);

  const clearOutput = useCallback((sessionId) => {
    setOutputs(prev => {
      const newOutputs = new Map(prev);
      newOutputs.set(sessionId, '');
      return newOutputs;
    });
  }, []);

  return {
    sessions: Array.from(sessions.values()),
    outputs,
    createSession,
    executeCommand,
    sendInput,
    resizeTerminal,
    closeSession,
    clearOutput
  };
}

/**
 * 文件管理 Hook
 */
export function useFileManager() {
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  const listDirectory = useCallback(async (serverId, path = currentPath) => {
    try {
      setLoading(true);
      const response = await wsClient.listDirectory(serverId, path);
      setFiles(response.items);
      setCurrentPath(path);
      return response.items;
    } catch (error) {
      console.error('列出目录失败:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  const createDirectory = useCallback(async (serverId, path, mode) => {
    try {
      const response = await wsClient.createDirectory(serverId, path, mode);
      // 刷新当前目录
      await listDirectory(serverId, currentPath);
      return response;
    } catch (error) {
      console.error('创建目录失败:', error);
      throw error;
    }
  }, [currentPath, listDirectory]);

  const deleteFile = useCallback(async (serverId, path, recursive = false) => {
    try {
      const response = await wsClient.deleteFile(serverId, path, recursive);
      // 刷新当前目录
      await listDirectory(serverId, currentPath);
      return response;
    } catch (error) {
      console.error('删除文件失败:', error);
      throw error;
    }
  }, [currentPath, listDirectory]);

  const navigateTo = useCallback((path) => {
    setCurrentPath(path);
  }, []);

  return {
    currentPath,
    files,
    loading,
    listDirectory,
    createDirectory,
    deleteFile,
    navigateTo
  };
}

/**
 * 性能监控 Hook
 */
export function usePerformanceMonitor() {
  const [stats, setStats] = useState(null);
  const [report, setReport] = useState(null);
  const [poolStatus, setPoolStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const refreshStats = useCallback(async () => {
    try {
      setLoading(true);
      const [statsResponse, reportResponse, poolResponse] = await Promise.all([
        wsClient.getSSHStats(),
        wsClient.getPerformanceReport(),
        wsClient.getConnectionPoolStatus()
      ]);
      
      setStats(statsResponse.stats);
      setReport(reportResponse.report);
      setPoolStatus(poolResponse.status);
    } catch (error) {
      console.error('获取性能数据失败:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  // 自动刷新
  useEffect(() => {
    const interval = setInterval(refreshStats, 30000); // 30秒刷新一次
    refreshStats(); // 立即刷新一次
    
    return () => clearInterval(interval);
  }, [refreshStats]);

  return {
    stats,
    report,
    poolStatus,
    loading,
    refreshStats
  };
}

/**
 * 事件订阅 Hook
 */
export function useWebSocketEvents(events, callback) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const eventArray = Array.isArray(events) ? events : [events];
    
    // 订阅事件
    wsClient.subscribe(eventArray).catch(error => {
      console.error('订阅事件失败:', error);
    });

    // 添加监听器
    const handleEvent = (data) => {
      callbackRef.current(data);
    };

    eventArray.forEach(event => {
      wsClient.on(event, handleEvent);
    });

    return () => {
      // 移除监听器
      eventArray.forEach(event => {
        wsClient.off(event, handleEvent);
      });
      
      // 取消订阅
      wsClient.unsubscribe(eventArray).catch(error => {
        console.error('取消订阅事件失败:', error);
      });
    };
  }, [events]);
}