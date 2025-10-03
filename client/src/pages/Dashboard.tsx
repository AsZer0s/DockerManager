import React, { useState, useCallback } from 'react'
import { Row, Col, Statistic, Table, Tag, Space, Typography, notification, Card, Button } from 'antd'
import type { Breakpoint } from 'antd'
import { 
  DatabaseOutlined, 
  ContainerOutlined, 
  MonitorOutlined, 
  ReloadOutlined,
  ConsoleSqlOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useQuery } from 'react-query'
import { containerAPI, monitoringAPI, serverAPI } from '@/services/api'
import { useGlobalServers } from '@/hooks/useGlobalServers'
import { useAuthStore } from '@/stores/authStore'
import { motion } from 'framer-motion'
import { 
  FadeInText, 
  SlideInText
} from '@/components/animations/TextAnimations'

const { Text } = Typography

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshCooldown, setRefreshCooldown] = useState(false)

  // 获取服务器列表
  const { data: serversData, isLoading: serversLoading, refetch: refetchServers } = useGlobalServers()


  // 获取所有服务器的容器统计
  const { data: containersStats } = useQuery({
    queryKey: ['containers-stats'],
    queryFn: async () => {
      let total = 0
      let running = 0
      let stopped = 0
      
      try {
        // 使用新的API获取容器统计信息
        const response = await containerAPI.getAllContainers(true)
        const containersData = response.data.data
        
        for (const [, serverData] of Object.entries(containersData)) {
          const serverDataTyped = serverData as { containers?: any[] }
          const serverContainers = serverDataTyped.containers || []
          total += serverContainers.length
          running += serverContainers.filter((c: any) => c.state === 'running').length
          stopped += serverContainers.filter((c: any) => c.state !== 'running').length
        }
      } catch (error) {
        // 静默处理错误，避免控制台输出
      }
      
      return { total, running, stopped }
    },
    enabled: true,
    refetchInterval: 30000,
  })

  // 获取系统统计信息（仅管理员）
  const { data: systemStats } = useQuery({
    queryKey: ['system-stats'],
    queryFn: () => monitoringAPI.getMonitoringStats(),
    refetchInterval: 60000, // 1分钟刷新一次
    enabled: user?.role === 'admin', // 只有管理员才调用这个 API
  })

  // 获取版本信息
  const { data: versionInfo } = useQuery({
    queryKey: ['version-info'],
    queryFn: () => serverAPI.getVersion(),
    refetchInterval: 300000, // 5分钟刷新一次
    enabled: user?.role === 'admin', // 只有管理员才调用这个 API
  })

  const servers = serversData?.data.servers || []
  const containersStatsData = containersStats || { total: 0, running: 0, stopped: 0 }

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
        // 可以添加其他需要刷新的查询
      ])
      notification.success({
        message: '刷新成功',
        description: '仪表板数据已更新',
        placement: 'topRight',
      })
    } catch (error) {
      notification.error({
        message: '刷新失败',
        description: '无法刷新仪表板数据',
        placement: 'topRight',
      })
    } finally {
      setIsRefreshing(false)
      // 2秒冷却时间
      setTimeout(() => {
        setRefreshCooldown(false)
      }, 2000)
    }
  }, [refreshCooldown, refetchServers])

  // 服务器状态列配置
  const serverColumns = [
    {
      title: '服务器名称',
      dataIndex: 'name',
      key: 'name',
      align: 'center' as const,
      responsive: ['xs', 'sm', 'md', 'lg', 'xl'] as Breakpoint[],
      render: (text: string) => (
        <div style={{ textAlign: 'center', fontWeight: 600, color: '#1890ff' }}>
          {text}
        </div>
      ),
    },
    {
      title: '主机地址',
      dataIndex: 'host',
      key: 'host',
      align: 'center' as const,
      responsive: ['sm', 'md', 'lg', 'xl'] as Breakpoint[],
      render: (text: string, record: any) => (
        <div style={{ textAlign: 'center' }}>
          {record.hide_sensitive_info ? '***.***.***.***' : text}
        </div>
      ),
    },
    {
      title: 'SSH端口',
      dataIndex: 'ssh_port',
      key: 'ssh_port',
      align: 'center' as const,
      responsive: ['md', 'lg', 'xl'] as Breakpoint[],
      render: (_: number, record: any) => (
        <div style={{ textAlign: 'center' }}>
          {record.hide_sensitive_info ? '***' : (record.ssh_port || record.port || 22)}
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      align: 'center' as const,
      responsive: ['xs', 'sm', 'md', 'lg', 'xl'] as Breakpoint[],
      render: (status: string, record: any) => {
        if (!record.is_active) {
          return <Tag color="red" style={{ margin: 0 }}>禁用</Tag>
        }
        return (
          <Tag color={status === '在线' ? 'green' : 'red'} style={{ margin: 0 }}>
            {status || '未知'}
          </Tag>
        )
      },
    },
    {
      title: '操作',
      key: 'action',
      align: 'center' as const,
      responsive: ['xs', 'sm', 'md', 'lg', 'xl'] as Breakpoint[],
      render: (record: any) => (
        <Space direction="vertical" size="small" style={{ justifyContent: 'center', display: 'flex' }}>
          <Button 
            size="small" 
            onClick={() => navigate(`/containers?server=${record.id}`)}
            style={{ width: '100%' }}
          >
            查看容器
          </Button>
          <Button 
            size="small" 
            onClick={() => navigate(`/monitoring?server=${record.id}`)}
            style={{ width: '100%' }}
          >
            监控
          </Button>
        </Space>
      ),
    },
  ]


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
        
        /* Dashboard 样式 */
        .dashboard-title {
          font-size: 2rem;
          font-weight: 700;
          margin-bottom: 8px;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        
        .dashboard-subtitle {
          font-size: 1rem;
          color: #6b7280;
          line-height: 1.5;
        }
        
        .stat-title {
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
        }
      `}</style>
      <motion.div 
        style={{ marginBottom: 24 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <Typography.Title level={1} className="dashboard-title">
          仪表盘
        </Typography.Title>
        <FadeInText 
          text={`欢迎回来，${user?.username}！这里是您的 Docker 容器管理概览。`}
          className="dashboard-subtitle"
          delay={0.3}
        />
      </motion.div>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={8} lg={6}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <Card hoverable>
              <Statistic
                title={
                  <SlideInText 
                    text="服务器总数" 
                    direction="left" 
                    delay={0.2}
                    className="stat-title"
                  />
                }
                value={servers.length}
                prefix={<DatabaseOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </motion.div>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Card hoverable>
              <Statistic
                title={
                  <SlideInText 
                    text="在线服务器" 
                    direction="left" 
                    delay={0.3}
                    className="stat-title"
                  />
                }
                value={servers.filter(s => s.is_active && s.status === '在线').length}
                prefix={<DatabaseOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </motion.div>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Card hoverable>
              <Statistic
                title={
                  <SlideInText 
                    text="离线服务器" 
                    direction="left" 
                    delay={0.4}
                    className="stat-title"
                  />
                }
                value={servers.filter(s => s.is_active && s.status === '离线').length}
                prefix={<DatabaseOutlined />}
                valueStyle={{ color: '#ff4d4f' }}
              />
            </Card>
          </motion.div>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Card hoverable>
              <Statistic
                title={
                  <SlideInText 
                    text="容器总数" 
                    direction="left" 
                    delay={0.5}
                    className="stat-title"
                  />
                }
                value={containersStatsData.total}
                prefix={<ContainerOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </motion.div>
        </Col>
      </Row>


      <Row gutter={[16, 16]}>
        {/* 服务器列表 */}
        <Col xs={24} lg={16}>
          <Card
            title="服务器列表"
            extra={
              <Button 
                icon={<ReloadOutlined />} 
                onClick={handleRefresh}
                loading={isRefreshing}
                disabled={refreshCooldown}
              >
                刷新
              </Button>
            }
          >
            <Table
              columns={serverColumns}
              dataSource={servers}
              loading={serversLoading}
              rowKey="id"
              className={isRefreshing ? 'table-refreshing' : ''}
              pagination={false}
              size="small"
              scroll={{ x: 'max-content' }}
              style={{ 
                minWidth: 300,
                fontSize: window.innerWidth < 768 ? '12px' : '14px'
              }}
            />
          </Card>
        </Col>

        {/* 系统状态 */}
        <Col xs={24} lg={8}>
          <Card title="系统状态">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text strong>活跃服务器: </Text>
                <Text>{systemStats?.data.monitoring.activeServers || 0}</Text>
              </div>
              <div>
                <Text strong>监控间隔: </Text>
                <Text>{systemStats?.data.monitoring.monitoringInterval || 0}ms</Text>
              </div>
              <div>
                <Text strong>系统版本: </Text>
                <Text>v{versionInfo?.data.version || '未知'}</Text>
              </div>
              <div>
                <Text strong>数据库连接: </Text>
                <Tag color="green">正常</Tag>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>


      {/* 快速操作 */}
      <Row style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title="快速操作">
            <Space wrap>
              <Button 
                icon={<DatabaseOutlined />}
                onClick={() => navigate('/servers')}
              >
                管理服务器
              </Button>
              <Button 
                icon={<ContainerOutlined />}
                onClick={() => navigate('/containers')}
              >
                查看容器
              </Button>
              <Button 
                icon={<MonitorOutlined />}
                onClick={() => navigate('/monitoring')}
              >
                监控中心
              </Button>
              <Button 
                icon={<ConsoleSqlOutlined />}
                onClick={() => navigate('/ssh')}
              >
                SSH 控制台
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
