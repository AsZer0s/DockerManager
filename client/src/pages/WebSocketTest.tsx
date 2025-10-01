import React, { useState, useEffect } from 'react';
import { Card, Button, Space, Tag, Typography, Alert, Divider } from 'antd';
import { ReloadOutlined, DisconnectOutlined, WifiOutlined } from '@ant-design/icons';
import websocketService from '../services/websocket';
import { useAuthStore } from '../stores/authStore';

const { Title, Text } = Typography;

const WebSocketTest: React.FC = () => {
  const [connectionStatus, setConnectionStatus] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const { token } = useAuthStore();

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 9)]);
  };

  const updateStatus = () => {
    const status = websocketService.getConnectionStatus();
    setConnectionStatus(status);
    addLog(`连接状态更新: ${status.status} (${status.transport})`);
  };

  const handleConnect = () => {
    if (token) {
      addLog('尝试连接WebSocket...');
      websocketService.connect(token);
      setTimeout(updateStatus, 1000);
    } else {
      addLog('错误: 没有认证token');
    }
  };

  const handleDisconnect = () => {
    addLog('断开WebSocket连接...');
    websocketService.disconnect();
    updateStatus();
  };

  const handleReconnect = () => {
    addLog('手动重连WebSocket...');
    websocketService.reconnect();
    setTimeout(updateStatus, 1000);
  };

  useEffect(() => {
    // 初始状态检查
    updateStatus();

    // 设置定时器定期更新状态
    const interval = setInterval(updateStatus, 5000);

    // 监听WebSocket事件
    const handleConnect = () => {
      addLog('WebSocket连接成功');
      updateStatus();
    };

    const handleDisconnect = (reason: string) => {
      addLog(`WebSocket连接断开: ${reason}`);
      updateStatus();
    };

    const handleError = (error: any) => {
      addLog(`WebSocket错误: ${error.message || error}`);
      updateStatus();
    };

    websocketService.on('connect', handleConnect);
    websocketService.on('disconnect', handleDisconnect);
    websocketService.on('connect_error', handleError);

    return () => {
      clearInterval(interval);
      websocketService.off('connect', handleConnect);
      websocketService.off('disconnect', handleDisconnect);
      websocketService.off('connect_error', handleError);
    };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'success';
      case 'connecting': return 'processing';
      case 'disconnected': return 'error';
      default: return 'default';
    }
  };

  const getTransportColor = (transport: string) => {
    switch (transport) {
      case 'websocket': return 'blue';
      case 'polling': return 'orange';
      default: return 'default';
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <Title level={2}>WebSocket 连接测试</Title>
      
      <Card title="连接状态" style={{ marginBottom: '16px' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong>状态: </Text>
            <Tag color={getStatusColor(connectionStatus?.status || 'unknown')}>
              {connectionStatus?.status || 'unknown'}
            </Tag>
          </div>
          
          <div>
            <Text strong>传输方式: </Text>
            <Tag color={getTransportColor(connectionStatus?.transport || 'unknown')}>
              {connectionStatus?.transport || 'unknown'}
            </Tag>
          </div>
          
          <div>
            <Text strong>连接ID: </Text>
            <Text code>{connectionStatus?.id || 'N/A'}</Text>
          </div>
          
          <div>
            <Text strong>Ping: </Text>
            <Text code>{connectionStatus?.ping || 'N/A'}ms</Text>
          </div>
        </Space>
      </Card>

      <Card title="操作控制" style={{ marginBottom: '16px' }}>
        <Space>
          <Button 
            type="primary" 
            icon={<WifiOutlined />}
            onClick={handleConnect}
            disabled={connectionStatus?.connected}
          >
            连接
          </Button>
          
          <Button 
            icon={<DisconnectOutlined />}
            onClick={handleDisconnect}
            disabled={!connectionStatus?.connected}
          >
            断开
          </Button>
          
          <Button 
            icon={<ReloadOutlined />}
            onClick={handleReconnect}
          >
            重连
          </Button>
        </Space>
      </Card>

      <Card title="连接日志" style={{ marginBottom: '16px' }}>
        <div style={{ 
          height: '200px', 
          overflow: 'auto', 
          backgroundColor: '#f5f5f5', 
          padding: '12px',
          fontFamily: 'monospace',
          fontSize: '12px'
        }}>
          {logs.length === 0 ? (
            <Text type="secondary">暂无日志</Text>
          ) : (
            logs.map((log, index) => (
              <div key={index} style={{ marginBottom: '4px' }}>
                {log}
              </div>
            ))
          )}
        </div>
      </Card>

      <Alert
        message="WebSocket 连接说明"
        description={
          <div>
            <p>• 绿色状态表示连接正常</p>
            <p>• 蓝色传输方式表示使用WebSocket协议</p>
            <p>• 橙色传输方式表示降级到HTTP轮询</p>
            <p>• 如果连接失败，系统会自动尝试重连</p>
            <p>• 可以通过日志查看详细的连接过程</p>
          </div>
        }
        type="info"
        showIcon
      />
    </div>
  );
};

export default WebSocketTest;
