import React, { useState, useEffect } from 'react';
import { useWebSocket, usePerformanceMonitor, useWebSocketEvents } from '../hooks/useWebSocket';
import './WebSocketPerformanceMonitor.css';

/**
 * WebSocket 性能监控面板组件
 */
const WebSocketPerformanceMonitor = () => {
  const { isConnected, connect } = useWebSocket();
  const { stats, report, poolStatus, loading, refreshStats } = usePerformanceMonitor();
  
  const [realTimeEvents, setRealTimeEvents] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedTab, setSelectedTab] = useState('overview');

  // 自动连接 WebSocket
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && !isConnected) {
      connect(token).catch(error => {
        console.error('WebSocket 连接失败:', error);
      });
    }
  }, [isConnected, connect]);

  // 订阅实时事件
  useWebSocketEvents(['ssh_command_executed', 'event'], (eventData) => {
    setRealTimeEvents(prev => {
      const newEvents = [...prev, {
        id: Date.now() + Math.random(),
        timestamp: Date.now(),
        ...eventData
      }];
      // 只保留最近50个事件
      return newEvents.slice(-50);
    });
  });

  const formatDuration = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getQualityColor = (quality) => {
    switch (quality) {
      case 'excellent': return '#28a745';
      case 'good': return '#17a2b8';
      case 'fair': return '#ffc107';
      case 'poor': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const getQualityIcon = (quality) => {
    switch (quality) {
      case 'excellent': return '🟢';
      case 'good': return '🔵';
      case 'fair': return '🟡';
      case 'poor': return '🔴';
      default: return '⚪';
    }
  };

  const renderOverview = () => (
    <div className="overview-grid">
      <div className="metric-card">
        <div className="metric-header">
          <h3>连接状态</h3>
          <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢 已连接' : '🔴 未连接'}
          </span>
        </div>
        <div className="metric-content">
          {poolStatus && (
            <>
              <div className="metric-item">
                <span>活跃连接</span>
                <span>{poolStatus.aliveConnections || 0}</span>
              </div>
              <div className="metric-item">
                <span>总连接数</span>
                <span>{poolStatus.totalConnections || 0}</span>
              </div>
              <div className="metric-item">
                <span>连接复用率</span>
                <span>{poolStatus.summary?.connectionReuseRate || '0%'}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="metric-card">
        <div className="metric-header">
          <h3>性能指标</h3>
          {stats && (
            <span className="performance-score">
              {getQualityIcon(stats.performance?.global?.overallQuality || 'unknown')}
              {stats.performance?.global?.overallQuality || 'Unknown'}
            </span>
          )}
        </div>
        <div className="metric-content">
          {stats && (
            <>
              <div className="metric-item">
                <span>平均响应时间</span>
                <span>{stats.averageResponseTime || 0}ms</span>
              </div>
              <div className="metric-item">
                <span>总命令数</span>
                <span>{stats.totalCommands || 0}</span>
              </div>
              <div className="metric-item">
                <span>命令成功率</span>
                <span>{stats.performance?.global?.commandSuccessRate || 0}%</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="metric-card">
        <div className="metric-header">
          <h3>会话统计</h3>
        </div>
        <div className="metric-content">
          {stats && (
            <>
              <div className="metric-item">
                <span>活跃会话</span>
                <span>{stats.activeSessions || 0}</span>
              </div>
              <div className="metric-item">
                <span>连接质量</span>
                <span style={{ color: getQualityColor(stats.connectionQuality) }}>
                  {getQualityIcon(stats.connectionQuality)} {stats.connectionQuality || 'Unknown'}
                </span>
              </div>
              <div className="metric-item">
                <span>运行时间</span>
                <span>{formatDuration(stats.performance?.global?.uptime || 0)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="metric-card">
        <div className="metric-header">
          <h3>实时事件</h3>
          <span className="event-count">{realTimeEvents.length} 个事件</span>
        </div>
        <div className="metric-content">
          <div className="event-list">
            {realTimeEvents.slice(-5).reverse().map(event => (
              <div key={event.id} className="event-item">
                <span className="event-time">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
                <span className="event-desc">
                  {event.eventType === 'ssh_command_executed' 
                    ? `命令执行: ${event.data?.command || 'Unknown'} (${event.data?.responseTime || 0}ms)`
                    : `事件: ${event.eventType || 'Unknown'}`
                  }
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderServers = () => (
    <div className="servers-grid">
      {report?.qualityGroups && Object.entries(report.qualityGroups).map(([quality, servers]) => (
        <div key={quality} className="quality-group">
          <div className="quality-header">
            <h3>
              {getQualityIcon(quality)} {quality.toUpperCase()} 
              <span className="server-count">({servers.length} 台服务器)</span>
            </h3>
          </div>
          <div className="server-list">
            {servers.map(server => (
              <div key={server.serverId} className="server-item">
                <div className="server-info">
                  <span className="server-id">服务器 #{server.serverId}</span>
                  <span className="quality-score">{server.qualityScore || 0} 分</span>
                </div>
                <div className="server-metrics">
                  <div className="server-metric">
                    <span>平均响应</span>
                    <span>{Math.round(server.averageCommandTime || 0)}ms</span>
                  </div>
                  <div className="server-metric">
                    <span>成功率</span>
                    <span>{server.commandSuccessRate || 0}%</span>
                  </div>
                  <div className="server-metric">
                    <span>命令数</span>
                    <span>{server.commandSuccesses || 0}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderConnectionPool = () => (
    <div className="pool-details">
      {poolStatus && (
        <>
          <div className="pool-summary">
            <h3>连接池概览</h3>
            <div className="pool-metrics">
              <div className="pool-metric">
                <span>总连接数</span>
                <span>{poolStatus.totalConnections || 0}</span>
              </div>
              <div className="pool-metric">
                <span>活跃连接</span>
                <span>{poolStatus.aliveConnections || 0}</span>
              </div>
              <div className="pool-metric">
                <span>失效连接</span>
                <span>{poolStatus.deadConnections || 0}</span>
              </div>
              <div className="pool-metric">
                <span>队列命令</span>
                <span>{poolStatus.summary?.totalQueuedCommands || 0}</span>
              </div>
            </div>
          </div>

          {poolStatus.connections && (
            <div className="connection-list">
              <h3>连接详情</h3>
              <div className="connection-table">
                <div className="table-header">
                  <span>服务器</span>
                  <span>主机</span>
                  <span>状态</span>
                  <span>空闲时间</span>
                  <span>连接时长</span>
                </div>
                {poolStatus.connections.map((conn, index) => (
                  <div key={index} className="table-row">
                    <span>{conn.serverName || `服务器 #${conn.serverId}`}</span>
                    <span>{conn.host}</span>
                    <span className={`connection-status ${conn.isAlive ? 'alive' : 'dead'}`}>
                      {conn.isAlive ? '🟢 活跃' : '🔴 失效'}
                    </span>
                    <span>{formatDuration(conn.idleTime || 0)}</span>
                    <span>{formatDuration(conn.age || 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderEvents = () => (
    <div className="events-panel">
      <div className="events-header">
        <h3>实时事件流</h3>
        <div className="events-controls">
          <button 
            className="btn-clear"
            onClick={() => setRealTimeEvents([])}
          >
            清空事件
          </button>
        </div>
      </div>
      
      <div className="events-list">
        {realTimeEvents.length === 0 ? (
          <div className="no-events">暂无事件</div>
        ) : (
          realTimeEvents.slice().reverse().map(event => (
            <div key={event.id} className="event-detail">
              <div className="event-header">
                <span className="event-timestamp">
                  {new Date(event.timestamp).toLocaleString()}
                </span>
                <span className="event-type">{event.eventType || event.type}</span>
              </div>
              <div className="event-data">
                {event.eventType === 'ssh_command_executed' ? (
                  <>
                    <div>命令: {event.data?.command || 'Unknown'}</div>
                    <div>响应时间: {event.data?.responseTime || 0}ms</div>
                    <div>会话: {event.data?.sessionId || 'Unknown'}</div>
                  </>
                ) : (
                  <pre>{JSON.stringify(event.data || event, null, 2)}</pre>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="websocket-performance-monitor">
      <div className="monitor-header">
        <div className="monitor-title">
          <h2>SSH 性能监控</h2>
          <span className={`connection-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '● 实时监控中' : '● 连接断开'}
          </span>
        </div>
        
        <div className="monitor-controls">
          <label className="auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            自动刷新
          </label>
          
          <button 
            className="btn-refresh"
            onClick={refreshStats}
            disabled={loading}
          >
            {loading ? '刷新中...' : '🔄 刷新'}
          </button>
        </div>
      </div>

      <div className="monitor-tabs">
        <button 
          className={`tab ${selectedTab === 'overview' ? 'active' : ''}`}
          onClick={() => setSelectedTab('overview')}
        >
          概览
        </button>
        <button 
          className={`tab ${selectedTab === 'servers' ? 'active' : ''}`}
          onClick={() => setSelectedTab('servers')}
        >
          服务器
        </button>
        <button 
          className={`tab ${selectedTab === 'pool' ? 'active' : ''}`}
          onClick={() => setSelectedTab('pool')}
        >
          连接池
        </button>
        <button 
          className={`tab ${selectedTab === 'events' ? 'active' : ''}`}
          onClick={() => setSelectedTab('events')}
        >
          事件流 ({realTimeEvents.length})
        </button>
      </div>

      <div className="monitor-content">
        {loading && selectedTab !== 'events' && (
          <div className="loading-overlay">
            <div className="loading-spinner">加载中...</div>
          </div>
        )}
        
        {selectedTab === 'overview' && renderOverview()}
        {selectedTab === 'servers' && renderServers()}
        {selectedTab === 'pool' && renderConnectionPool()}
        {selectedTab === 'events' && renderEvents()}
      </div>
    </div>
  );
};

export default WebSocketPerformanceMonitor;