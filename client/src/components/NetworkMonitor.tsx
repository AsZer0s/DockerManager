import React, { useState } from 'react';
import { Card, Statistic, Row, Col, Button, Space, Tag, Spin, Alert } from 'antd';
import { 
  CloudDownloadOutlined, 
  CloudUploadOutlined, 
  WifiOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { networkAPI } from '@/services/api';

interface NetworkSpeed {
  interface: string;
  inSpeed: number;
  outSpeed: number;
  inSpeedKB: number;
  outSpeedKB: number;
  inSpeedMB: number;
  outSpeedMB: number;
  inSpeedFormatted: string;
  outSpeedFormatted: string;
  bytesReceived: number;
  bytesSent: number;
  bytesReceivedFormatted: string;
  bytesSentFormatted: string;
  packetsReceived: number;
  packetsSent: number;
  timestamp: number;
  deltaTime: number;
}

interface NetworkStatus {
  isRunning: boolean;
  samplingInterval: number;
  config: any;
  hasData: boolean;
  lastUpdate: number | null;
}

const NetworkMonitor: React.FC = () => {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const queryClient = useQueryClient();

  // 获取网络速度数据
  const { data: networkData, isLoading, error, refetch } = useQuery({
    queryKey: ['network-speed'],
    queryFn: async () => {
      const response = await networkAPI.getNetworkSpeed();
      return response.data;
    },
    refetchInterval: autoRefresh ? 1000 : false, // 1秒刷新一次
    enabled: true,
  });

  // 获取网络监控状态
  const { data: statusData } = useQuery({
    queryKey: ['network-status'],
    queryFn: async () => {
      const response = await networkAPI.getNetworkStatus();
      return response.data;
    },
    refetchInterval: 5000, // 5秒刷新一次状态
  });

  // 启动网络监控
  const startMutation = useMutation({
    mutationFn: async () => {
      const response = await networkAPI.startNetworkMonitoring();
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network-status'] });
    },
  });

  // 停止网络监控
  const stopMutation = useMutation({
    mutationFn: async () => {
      const response = await networkAPI.stopNetworkMonitoring();
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network-status'] });
    },
  });

  // 重置统计信息
  const resetMutation = useMutation({
    mutationFn: async () => {
      const response = await networkAPI.resetNetworkStats();
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network-speed'] });
    },
  });

  const networkSpeed: NetworkSpeed | null = networkData?.data || null;
  const networkStatus: NetworkStatus | null = statusData?.data || null;


  // 获取速度颜色
  const getSpeedColor = (speed: number) => {
    if (speed < 1024) return '#52c41a'; // 绿色 - 低速度
    if (speed < 1024 * 1024) return '#faad14'; // 橙色 - 中等速度
    return '#f5222d'; // 红色 - 高速度
  };

  // 获取状态标签
  const getStatusTag = () => {
    if (!networkStatus) return <Tag color="default">未知</Tag>;
    
    if (networkStatus.isRunning) {
      return <Tag color="success">运行中</Tag>;
    } else {
      return <Tag color="error">已停止</Tag>;
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      <Card 
        title={
          <Space>
            <WifiOutlined />
            实时网络监控
            {getStatusTag()}
          </Space>
        }
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => refetch()}
              loading={isLoading}
            >
              刷新
            </Button>
            <Button
              type={autoRefresh ? 'primary' : 'default'}
              icon={autoRefresh ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? '停止自动刷新' : '开始自动刷新'}
            </Button>
            {networkStatus?.isRunning ? (
              <Button
                danger
                onClick={() => stopMutation.mutate()}
                loading={stopMutation.isLoading}
              >
                停止监控
              </Button>
            ) : (
              <Button
                type="primary"
                onClick={() => startMutation.mutate()}
                loading={startMutation.isLoading}
              >
                启动监控
              </Button>
            )}
            <Button
              onClick={() => resetMutation.mutate()}
              loading={resetMutation.isLoading}
            >
              重置统计
            </Button>
          </Space>
        }
      >
        {error ? (
          <Alert
            message="获取网络数据失败"
            description={error instanceof Error ? error.message : String(error)}
            type="error"
            style={{ marginBottom: 16 }}
          />
        ) : null}

        {isLoading && !networkSpeed ? (
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>正在加载网络数据...</div>
          </div>
        ) : networkSpeed ? (
          <>
            {/* 实时速度显示 */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
              <Col xs={24} sm={12} md={6}>
                <Card size="small">
                  <Statistic
                    title="下载速度"
                    value={networkSpeed.inSpeed}
                    formatter={() => (
                      <span style={{ color: getSpeedColor(networkSpeed.inSpeed) }}>
                        {networkSpeed.inSpeedFormatted}
                      </span>
                    )}
                    prefix={<CloudDownloadOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card size="small">
                  <Statistic
                    title="上传速度"
                    value={networkSpeed.outSpeed}
                    formatter={() => (
                      <span style={{ color: getSpeedColor(networkSpeed.outSpeed) }}>
                        {networkSpeed.outSpeedFormatted}
                      </span>
                    )}
                    prefix={<CloudUploadOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card size="small">
                  <Statistic
                    title="累计下载"
                    value={networkSpeed.bytesReceivedFormatted}
                    prefix={<CloudDownloadOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card size="small">
                  <Statistic
                    title="累计上传"
                    value={networkSpeed.bytesSentFormatted}
                    prefix={<CloudUploadOutlined />}
                  />
                </Card>
              </Col>
            </Row>

            {/* 详细信息 */}
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} md={8}>
                <Card size="small" title="网络接口">
                  <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                    {networkSpeed.interface}
                  </div>
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card size="small" title="数据包统计">
                  <div>接收: {networkSpeed.packetsReceived.toLocaleString()}</div>
                  <div>发送: {networkSpeed.packetsSent.toLocaleString()}</div>
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card size="small" title="最后更新">
                  <div>
                    {new Date(networkSpeed.timestamp).toLocaleTimeString()}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    采样间隔: {networkSpeed.deltaTime.toFixed(2)}s
                  </div>
                </Card>
              </Col>
            </Row>

            {/* 状态信息 */}
            {networkStatus && (
              <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col span={24}>
                  <Card size="small" title="监控状态">
                    <Row gutter={[16, 16]}>
                      <Col xs={24} sm={8}>
                        <div>服务状态: {getStatusTag()}</div>
                      </Col>
                      <Col xs={24} sm={8}>
                        <div>采样间隔: {networkStatus.samplingInterval}ms</div>
                      </Col>
                      <Col xs={24} sm={8}>
                        <div>
                          最后更新: {
                            networkStatus.lastUpdate 
                              ? new Date(networkStatus.lastUpdate).toLocaleString()
                              : '无数据'
                          }
                        </div>
                      </Col>
                    </Row>
                  </Card>
                </Col>
              </Row>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <div>暂无网络数据</div>
            <div style={{ marginTop: 8, color: '#666' }}>
              请确保网络监控服务已启动
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default NetworkMonitor;
