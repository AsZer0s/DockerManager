import React, { useState, useCallback } from 'react'
import { Row, Col, Card, Statistic, Table, Tag, Button, Space, Typography, message } from 'antd'
import { 
  DatabaseOutlined, 
  ContainerOutlined, 
  MonitorOutlined, 
  ReloadOutlined,
  ConsoleSqlOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useQuery } from 'react-query'
import { containerAPI, monitoringAPI } from '@/services/api'
import { useGlobalServers } from '@/hooks/useGlobalServers'
import { useAuthStore } from '@/stores/authStore'

const { Title, Text } = Typography

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
      if (!serversData?.data.servers) return { total: 0, running: 0, stopped: 0 }
      
      let total = 0
      let running = 0
      let stopped = 0
      
      // 只对在线服务器获取容器信息
      const onlineServers = serversData.data.servers.filter(server => 
        server.is_active && server.status === '在线'
      )
      
      for (const server of onlineServers) {
        try {
          const response = await containerAPI.getContainers(server.id, true)
          const containers = response.data.containers
          total += containers.length
          running += containers.filter(c => c.status === 'running').length
          stopped += containers.filter(c => c.status !== 'running').length
        } catch (error) {
          console.error(`获取服务器 ${server.name} 容器失败:`, error)
        }
      }
      
      return { total, running, stopped }
    },
    enabled: !!serversData?.data.servers,
    refetchInterval: 30000,
  })

  // 获取系统统计信息
  const { data: systemStats } = useQuery({
    queryKey: ['system-stats'],
    queryFn: () => monitoringAPI.getMonitoringStats(),
    refetchInterval: 60000, // 1分钟刷新一次
  })

  const servers = serversData?.data.servers || []
  const containersStatsData = containersStats || { total: 0, running: 0, stopped: 0 }

  // 防抖刷新函数
  const handleRefresh = useCallback(async () => {
    if (refreshCooldown) {
      message.warning('请稍后再试，刷新过于频繁')
      return
    }

    setIsRefreshing(true)
    setRefreshCooldown(true)

    try {
      await Promise.all([
        refetchServers(),
        // 可以添加其他需要刷新的查询
      ])
      message.success('刷新成功')
    } catch (error) {
      message.error('刷新失败')
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
    },
    {
      title: '主机地址',
      dataIndex: 'host',
      key: 'host',
      render: (text: string, record: any) => 
        record.hide_sensitive_info ? '***.***.***.***' : text,
    },
    {
      title: '端口',
      dataIndex: 'port',
      key: 'port',
      render: (text: number, record: any) => 
        record.hide_sensitive_info ? '***' : text,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record: any) => {
        if (!record.is_active) {
          return <Tag color="red">禁用</Tag>
        }
        return (
          <Tag color={status === '在线' ? 'green' : 'red'}>
            {status || '未知'}
          </Tag>
        )
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (record: any) => (
        <Space>
          <Button 
            size="small" 
            onClick={() => navigate(`/containers?server=${record.id}`)}
          >
            查看容器
          </Button>
          <Button 
            size="small" 
            onClick={() => navigate(`/monitoring?server=${record.id}`)}
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
      `}</style>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>仪表盘</Title>
        <Text type="secondary">
          欢迎回来，{user?.username}！这里是您的 Docker 容器管理概览。
        </Text>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="服务器总数"
              value={servers.length}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="在线服务器"
              value={servers.filter(s => s.is_active && s.status === '在线').length}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="离线服务器"
              value={servers.filter(s => s.is_active && s.status === '离线').length}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="容器总数"
              value={containersStatsData.total}
              prefix={<ContainerOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
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
            />
          </Card>
        </Col>

        {/* 系统状态 */}
        <Col xs={24} lg={8}>
          <Card title="系统状态">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text strong>监控服务: </Text>
                <Tag color={systemStats?.data.monitoring.isRunning ? 'green' : 'red'}>
                  {systemStats?.data.monitoring.isRunning ? '运行中' : '已停止'}
                </Tag>
              </div>
              <div>
                <Text strong>活跃服务器: </Text>
                <Text>{systemStats?.data.monitoring.activeServers || 0}</Text>
              </div>
              <div>
                <Text strong>监控间隔: </Text>
                <Text>{systemStats?.data.monitoring.monitoringInterval || 0}ms</Text>
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
                type="primary" 
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
