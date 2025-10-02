import React, { useState } from 'react'
import { 
  Card, 
  Typography, 
  notification, 
  Space,
  Divider,
  Row,
  Col,
  Button,
  Progress,
  Statistic,
  Table,
  Tag,
  Modal,
  Alert
} from 'antd'
import { 
  DatabaseOutlined, 
  ReloadOutlined, 
  DownloadOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ToolOutlined
} from '@ant-design/icons'
import { useMutation, useQuery } from 'react-query'
import { settingsAPI } from '../../services/api'

const { Title, Text } = Typography


const DatabaseSettings: React.FC = () => {
  const [backupModalVisible, setBackupModalVisible] = useState(false)
  const [cleanupModalVisible, setCleanupModalVisible] = useState(false)

  // 获取数据库信息
  const { data: databaseInfo, refetch: refetchStats } = useQuery(
    'databaseInfo',
    () => settingsAPI.getDatabaseInfo(),
    {
      select: (response) => response.data
    }
  )

  const dbStats = databaseInfo?.stats
  const tableInfo = databaseInfo?.tableInfo

  // 数据库备份
  const backupMutation = useMutation(
    () => settingsAPI.backupDatabase(),
    {
      onSuccess: (response) => {
        notification.success({
          message: '备份成功',
          description: response.data.message,
          placement: 'topRight',
        })
        setBackupModalVisible(false)
        refetchStats()
      },
      onError: (error: any) => {
        notification.error({
          message: '备份失败',
          description: error.response?.data?.message || '数据库备份失败',
          placement: 'topRight',
        })
      }
    }
  )

  // 清理旧数据
  const cleanupMutation = useMutation(
    (days: number) => settingsAPI.cleanupDatabase(days),
    {
      onSuccess: (response) => {
        notification.success({
          message: '清理成功',
          description: response.data.message,
          placement: 'topRight',
        })
        setCleanupModalVisible(false)
        refetchStats()
      },
      onError: (error: any) => {
        notification.error({
          message: '清理失败',
          description: error.response?.data?.message || '数据库清理失败',
          placement: 'topRight',
        })
      }
    }
  )

  // 格式化文件大小
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // 获取状态标签
  const getStatusTag = (status: string) => {
    const statusMap = {
      healthy: { color: 'green', text: '正常' },
      warning: { color: 'orange', text: '警告' },
      error: { color: 'red', text: '错误' }
    }
    const config = statusMap[status as keyof typeof statusMap]
    return <Tag color={config.color}>{config.text}</Tag>
  }

  // 表信息列配置
  const tableColumns = [
    {
      title: '表名',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => (
        <Space>
          <DatabaseOutlined />
          {text}
        </Space>
      )
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      render: (size: number) => formatSize(size)
    },
    {
      title: '记录数',
      dataIndex: 'records',
      key: 'records',
      render: (count: number) => count.toLocaleString()
    },
    {
      title: '最后修改',
      dataIndex: 'lastModified',
      key: 'lastModified'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status)
    }
  ]

  if (!dbStats) return null

  const usagePercent = Math.round((dbStats.usedSize / dbStats.totalSize) * 100)

  return (
    <div style={{ padding: '0 24px' }}>
      <Title level={3}>数据库设置</Title>
      <Text type="secondary">管理数据库状态、备份和清理</Text>
      
      <Divider />

      {/* 数据库状态概览 */}
      <Card title="数据库状态" size="small" style={{ marginBottom: 24 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="连接状态"
              value={dbStats.connectionStatus}
              prefix={
                dbStats.connectionStatus === 'connected' ? 
                <CheckCircleOutlined style={{ color: '#52c41a' }} /> :
                <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
              }
              valueStyle={{ 
                color: dbStats.connectionStatus === 'connected' ? '#52c41a' : '#ff4d4f',
                fontSize: 16
              }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="数据库大小"
              value={formatSize(dbStats.usedSize)}
              suffix={`/ ${formatSize(dbStats.totalSize)}`}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="表数量"
              value={dbStats.tableCount}
              suffix="个"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="总记录数"
              value={dbStats.recordCount}
              suffix="条"
            />
          </Col>
        </Row>

        <div style={{ marginTop: 16 }}>
          <Text strong>存储使用率</Text>
          <Progress 
            percent={usagePercent} 
            status={usagePercent > 80 ? 'exception' : usagePercent > 60 ? 'active' : 'success'}
            strokeColor={{
              '0%': '#108ee9',
              '100%': '#87d068',
            }}
          />
        </div>
      </Card>

      {/* 数据库操作 */}
      <Card title="数据库操作" size="small" style={{ marginBottom: 24 }}>
        <Space wrap>
          <Button 
            type="primary" 
            icon={<DownloadOutlined />}
            onClick={() => setBackupModalVisible(true)}
          >
            备份数据库
          </Button>
          <Button 
            icon={<DeleteOutlined />}
            onClick={() => setCleanupModalVisible(true)}
          >
            清理旧数据
          </Button>
          <Button 
            icon={<ReloadOutlined />}
            onClick={() => refetchStats()}
          >
            刷新状态
          </Button>
          <Button 
            icon={<ToolOutlined />}
            onClick={() => notification.info({
              message: '功能待实现',
              description: '数据库优化功能待实现',
              placement: 'topRight',
            })}
          >
            优化数据库
          </Button>
        </Space>

        <Alert
          message="最后备份时间"
          description={dbStats.lastBackup}
          type="info"
          showIcon
          style={{ marginTop: 16 }}
        />
      </Card>

      {/* 表信息 */}
      <Card title="表信息" size="small">
        <Table
          columns={tableColumns}
          dataSource={tableInfo}
          rowKey="name"
          pagination={false}
          size="small"
        />
      </Card>

      {/* 备份数据库模态框 */}
      <Modal
        title="备份数据库"
        open={backupModalVisible}
        onCancel={() => setBackupModalVisible(false)}
        onOk={() => backupMutation.mutate()}
        confirmLoading={backupMutation.isLoading}
      >
        <Alert
          message="数据库备份"
          description="此操作将创建数据库的完整备份文件，建议定期进行备份以确保数据安全。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <p>备份文件将包含：</p>
        <ul>
          <li>所有用户数据</li>
          <li>服务器配置</li>
          <li>容器信息</li>
          <li>监控历史数据</li>
        </ul>
      </Modal>

      {/* 清理旧数据模态框 */}
      <Modal
        title="清理旧数据"
        open={cleanupModalVisible}
        onCancel={() => setCleanupModalVisible(false)}
        onOk={() => cleanupMutation.mutate(30)}
        confirmLoading={cleanupMutation.isLoading}
      >
        <Alert
          message="数据清理"
          description="此操作将删除30天前的监控数据，释放存储空间。此操作不可逆，请谨慎操作。"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <p>将清理以下数据：</p>
        <ul>
          <li>30天前的服务器监控数据</li>
          <li>30天前的容器监控数据</li>
          <li>已解决的告警记录</li>
          <li>过期的操作日志</li>
        </ul>
      </Modal>
    </div>
  )
}

export default DatabaseSettings
