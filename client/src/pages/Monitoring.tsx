import React, { useState, useCallback } from 'react'
import { Row, Col, Typography, Space, Progress, Statistic, Tag, notification, Button, Card } from 'antd'
import { motion } from 'framer-motion'
import { 
  ReloadOutlined, 
  MonitorOutlined, 
  DatabaseOutlined,
  ThunderboltOutlined,
  HddOutlined
} from '@ant-design/icons'
import { useQuery } from 'react-query'

import { monitoringAPI } from '@/services/api'
import { useGlobalServers } from '@/hooks/useGlobalServers'

const { Title, Text } = Typography

interface ServerMonitoringData {
  serverId: number
  serverName: string
  status: string
  cpu_usage: number
  memory_usage: number
  disk_usage: number
  network_in: number
  network_out: number
  load_average?: number
  uptime?: number
  uptime_formatted?: string
  timestamp: string
  error?: boolean
}

const Monitoring: React.FC = () => {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshCooldown, setRefreshCooldown] = useState(false)

  // 获取服务器列表
  const { data: serversData, refetch: refetchServers } = useGlobalServers()

  // 获取所有在线服务器的实时监控数据
  const { data: allMonitoringData, isLoading, refetch: refetchMonitoring } = useQuery({
    queryKey: ['all-monitoring', serversData?.data.servers?.length],
    refetchInterval: 5000, // 5秒自动刷新
    refetchIntervalInBackground: true, // 后台也继续刷新
    staleTime: 0, // 数据立即过期，强制重新获取
    queryFn: async () => {
      if (!serversData?.data.servers) return []
      
      const onlineServers = serversData.data.servers.filter(server => 
        server.is_active && server.status === '在线'
      )
      
      const monitoringPromises = onlineServers.map(async (server) => {
        try {
          const response = await monitoringAPI.getCurrentMonitoring(server.id)
          const monitoringData = response.data.data
          
          return {
            serverId: server.id,
            serverName: server.name,
            status: server.status || '未知',
            cpu_usage: monitoringData.cpu_usage || 0,
            memory_usage: monitoringData.memory_usage || 0,
            disk_usage: monitoringData.disk_usage || 0,
            network_in: monitoringData.network_in || 0,
            network_out: monitoringData.network_out || 0,
            load_average: monitoringData.load_average ? Number(monitoringData.load_average) : undefined,
            uptime: monitoringData.uptime ? Number(monitoringData.uptime) : undefined,
            uptime_formatted: monitoringData.uptime_formatted,
            timestamp: response.data.timestamp
          } as ServerMonitoringData
        } catch (error) {
          console.warn(`获取服务器 ${server.name} 监控数据失败:`, error)
          return {
            serverId: server.id,
            serverName: server.name,
            status: server.status || '未知',
            cpu_usage: 0,
            memory_usage: 0,
            disk_usage: 0,
            network_in: 0,
            network_out: 0,
            timestamp: new Date().toISOString(),
            error: true
          } as ServerMonitoringData
        }
      })
      
      return Promise.all(monitoringPromises)
    },
    enabled: !!serversData?.data.servers, // 只有当服务器数据加载完成后才开始监控数据查询
  })

  const servers = serversData?.data.servers || []
  const monitoringData = allMonitoringData || []
  const isInitialLoading = !serversData || isLoading

  // 防抖刷新函数
  const handleRefresh = useCallback(async () => {
    if (refreshCooldown) {
      notification.warning({
        message: '刷新过于频繁',
        description: '请稍后再试',
        placement: 'topRight',
      })
      return
    }

    setIsRefreshing(true)
    setRefreshCooldown(true)

    try {
      await Promise.all([
        refetchServers(),
        refetchMonitoring()
      ])
      notification.success({
        message: '刷新成功',
        description: '监控数据已更新',
        placement: 'topRight',
      })
    } catch (error) {
      notification.error({
        message: '刷新失败',
        description: '无法刷新监控数据',
        placement: 'topRight',
      })
    } finally {
      setIsRefreshing(false)
      // 2秒冷却时间
      setTimeout(() => {
        setRefreshCooldown(false)
      }, 2000)
    }
  }, [refreshCooldown, refetchServers, refetchMonitoring])

  // 获取状态颜色
  const getStatusColor = (status: string) => {
    switch (status) {
      case '在线': return 'green'
      case '离线': return 'red'
      default: return 'gray'
    }
  }

  // 获取使用率颜色
  const getUsageColor = (usage: number) => {
    if (usage >= 90) return '#ff4d4f'
    if (usage >= 70) return '#faad14'
    return '#52c41a'
  }

  // 格式化实时网络
  const formatNetworkSpeed = (bytes: number) => {
    if (bytes === 0) return '0 B/s'
    const k = 1024
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // 格式化运行时间
  const formatUptime = (seconds: number) => {
    if (!seconds || seconds <= 0) return 'N/A'
    
    // 确保输入是有效的数字
    const totalSeconds = Math.floor(Number(seconds))
    if (isNaN(totalSeconds) || totalSeconds < 0) return 'N/A'
    
    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`
    } else {
      return `${minutes}m`
    }
  }

  return (
    <div>
      <style>{`
        /* 表格刷新动画 */
        .table-refreshing {
          animation: tableRefresh 0.6s ease-in-out;
        }
        @keyframes tableRefresh {
          0% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(0.98);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        /* 刷新按钮动画 */
        .ant-btn-loading .anticon {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        /* 监控卡片悬停动效 */
        .monitoring-card {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
        }
        .monitoring-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
        }
        .monitoring-card:hover .card-title {
          color: #1890ff;
        }
        /* 进度条悬停动效 */
        .progress-container {
          transition: all 0.2s ease;
        }
        .progress-container:hover .ant-progress-bg {
          transform: scaleY(1.1);
        }
        /* 统计卡片悬停动效 */
        .stat-card {
          transition: all 0.3s ease;
        }
        .stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        /* 实时网络图标动效 */
        .network-icon {
          transition: all 0.3s ease;
        }
        .monitoring-card:hover .network-icon {
          transform: scale(1.1);
        }
        /* 页面标题渐变效果 */
        .page-title {
          font-size: 2rem !important;
          font-weight: 700 !important;
          margin-bottom: 8px !important;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6) !important;
          -webkit-background-clip: text !important;
          -webkit-text-fill-color: transparent !important;
          background-clip: text !important;
          color: transparent !important;
        }
      `}</style>
      
      <motion.div 
        style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <Typography.Title level={1} className="page-title">
          监控中心
        </Typography.Title>
        <Space>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={handleRefresh}
            loading={isRefreshing}
            disabled={refreshCooldown}
          >
            刷新
          </Button>
        </Space>
      </motion.div>

      {/* 总体统计 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card" loading={isInitialLoading}>
            <Statistic
              title="总服务器数"
              value={servers.length}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card" loading={isInitialLoading}>
            <Statistic
              title="在线服务器"
              value={servers.filter(s => s.is_active && s.status === '在线').length}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card" loading={isInitialLoading}>
            <Statistic
              title="平均CPU使用率"
              value={monitoringData.length > 0 ? 
                (monitoringData.reduce((sum, data) => sum + (data.cpu_usage || 0), 0) / monitoringData.length).toFixed(1) : 0
              }
              suffix="%"
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card" loading={isInitialLoading}>
            <Statistic
              title="平均内存使用率"
              value={monitoringData.length > 0 ? 
                (monitoringData.reduce((sum, data) => sum + (data.memory_usage || 0), 0) / monitoringData.length).toFixed(1) : 0
              }
              suffix="%"
              prefix={<HddOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 服务器监控卡片 */}
      {isInitialLoading ? (
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <Card>
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <MonitorOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
                <Title level={4} type="secondary">正在加载监控数据...</Title>
                <Text type="secondary">请稍候，正在获取服务器状态和性能数据</Text>
              </div>
            </Card>
          </Col>
        </Row>
      ) : (
        <Row gutter={[16, 16]} className={isRefreshing ? 'table-refreshing' : ''}>
          {monitoringData.map((data: ServerMonitoringData) => (
          <Col xs={24} sm={12} lg={8} xl={6} key={data.serverId}>
            <Card
              className="monitoring-card"
              title={
                <Space className="card-title">
                  <MonitorOutlined />
                  {data.serverName}
                  <Tag color={getStatusColor(data.status)}>
                    {data.status}
                  </Tag>
                </Space>
              }
              extra={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {new Date(data.timestamp).toLocaleTimeString()}
                </Text>
              }
              style={{ height: '100%' }}
            >
              {data.error ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <Text type="danger">监控数据获取失败</Text>
                </div>
              ) : (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {/* CPU 使用率 */}
                  <div className="progress-container">
                    <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text strong>CPU 使用率</Text>
                      <Text style={{ color: getUsageColor(data.cpu_usage) }}>
                        {data.cpu_usage?.toFixed(1) || 0}%
                      </Text>
                    </Space>
                    <Progress
                      percent={data.cpu_usage || 0}
                      strokeColor={getUsageColor(data.cpu_usage || 0)}
                      showInfo={false}
                      size="small"
                    />
                  </div>

                  {/* 内存使用率 */}
                  <div className="progress-container">
                    <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text strong>内存使用率</Text>
                      <Text style={{ color: getUsageColor(data.memory_usage) }}>
                        {data.memory_usage?.toFixed(1) || 0}%
                      </Text>
                    </Space>
                    <Progress
                      percent={data.memory_usage || 0}
                      strokeColor={getUsageColor(data.memory_usage || 0)}
                      showInfo={false}
                      size="small"
                    />
                  </div>

                  {/* 磁盘使用率 */}
                  <div className="progress-container">
                    <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text strong>磁盘使用率</Text>
                      <Text style={{ color: getUsageColor(data.disk_usage) }}>
                        {data.disk_usage?.toFixed(1) || 0}%
                      </Text>
                    </Space>
                    <Progress
                      percent={data.disk_usage || 0}
                      strokeColor={getUsageColor(data.disk_usage || 0)}
                      showInfo={false}
                      size="small"
                    />
                  </div>

                  {/* 实时网络 */}
                  <div>
                    <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text strong>实时网络</Text>
                      <ThunderboltOutlined className="network-icon" style={{ color: '#1890ff' }} />
                    </Space>
                    <Space style={{ width: '100%', justifyContent: 'space-between', fontSize: 12 }}>
                      <Text type="secondary">
                        ↑ {formatNetworkSpeed(data.network_in || 0)}
                      </Text>
                      <Text type="secondary">
                        ↓ {formatNetworkSpeed(data.network_out || 0)}
                      </Text>
                    </Space>
                  </div>

                  {/* 系统负载 */}
                  <div>
                    <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text strong>系统负载</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {data.load_average ? `${data.load_average.toFixed(2)}` : 'N/A'}
                      </Text>
                    </Space>
                  </div>

                  {/* 运行时间 */}
                  <div>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Text strong>运行时间</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {data.uptime_formatted || formatUptime(data.uptime || 0)}
                      </Text>
                    </Space>
                  </div>
                </Space>
              )}
            </Card>
          </Col>
        ))}
        </Row>
      )}

      {/* 无数据提示 */}
      {monitoringData.length === 0 && !isLoading && (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <MonitorOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
            <Title level={4} type="secondary">暂无在线服务器监控数据</Title>
            <Text type="secondary">请确保有服务器在线并配置了监控</Text>
          </div>
        </Card>
      )}
    </div>
  )
}

export default Monitoring
