import React, { useState, useCallback } from 'react'
import { 
  Table, 
  Button, 
  Space, 
  Tag, 
  Modal, 
  Form, 
  Input, 
  InputNumber, 
  message, 
  Popconfirm,
  Card,
  Row,
  Col,
  Statistic,
  Radio,
  theme
} from 'antd'
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  ReloadOutlined,
  CheckCircleOutlined
} from '@ant-design/icons'
import { useMutation, useQueryClient } from 'react-query'
import { useAuthStore } from '@/stores/authStore'
import { motion } from 'framer-motion'
import { 
  GradientText, 
  SlideInText 
} from '@/components/animations/TextAnimations'

import { serverAPI, Server } from '@/services/api'
import { useGlobalServers } from '@/hooks/useGlobalServers'

// const { Title } = Typography

const Servers: React.FC = () => {
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [editingServer, setEditingServer] = useState<Server | null>(null)
  const [form] = Form.useForm()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { token: themeToken } = theme.useToken()
  const [refreshCooldown, setRefreshCooldown] = useState(false)
  const [authType, setAuthType] = useState<'password' | 'key'>('password')
  const [columnWidths, setColumnWidths] = useState({
    name: 150,
    host: 150,
    port: 80,
    username: 120,
    status: 100,
    created_at: 150
  })
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  // 获取服务器列表
  const { data: serversData, isLoading, refetch } = useGlobalServers()

  // 创建服务器 mutation
  const createMutation = useMutation({
    mutationFn: (data: Partial<Server>) => serverAPI.createServer(data),
    onSuccess: (response) => {
      message.success('服务器创建成功')
      setIsModalVisible(false)
      form.resetFields()
      
      // 立即更新缓存，避免重新加载
      const newServer = response.data.server
      queryClient.setQueryData(['servers'], (oldData: any) => {
        if (!oldData) return oldData
        return {
          ...oldData,
          data: {
            ...oldData.data,
            servers: [newServer, ...oldData.data.servers],
            total: oldData.data.total + 1
          }
        }
      })
      
      // 同时触发重新获取以确保数据一致性
      queryClient.invalidateQueries({ queryKey: ['servers'] })
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || '创建失败')
    },
  })

  // 更新服务器 mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Server> }) => 
      serverAPI.updateServer(id, data),
    onSuccess: (response) => {
      message.success('服务器更新成功')
      setIsModalVisible(false)
      setEditingServer(null)
      form.resetFields()
      
      // 立即更新缓存
      const updatedServer = response.data.server
      queryClient.setQueryData(['servers'], (oldData: any) => {
        if (!oldData) return oldData
        return {
          ...oldData,
          data: {
            ...oldData.data,
            servers: oldData.data.servers.map((server: Server) => 
              server.id === updatedServer.id ? updatedServer : server
            )
          }
        }
      })
      
      queryClient.invalidateQueries({ queryKey: ['servers'] })
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || '更新失败')
    },
  })

  // 删除服务器 mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => serverAPI.deleteServer(id),
    onSuccess: (_, deletedId) => {
      message.success('服务器删除成功')
      
      // 立即更新缓存
      queryClient.setQueryData(['servers'], (oldData: any) => {
        if (!oldData) return oldData
        return {
          ...oldData,
          data: {
            ...oldData.data,
            servers: oldData.data.servers.filter((server: Server) => server.id !== deletedId),
            total: oldData.data.total - 1
          }
        }
      })
      
      queryClient.invalidateQueries({ queryKey: ['servers'] })
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || '删除失败')
    },
  })

  // 测试连接 mutation
  const testConnectionMutation = useMutation({
    mutationFn: (id: number) => serverAPI.testConnection(id),
    onSuccess: (response) => {
      if (response.data.success) {
        message.success('连接测试成功')
      } else {
        message.error(response.data.message || '连接测试失败')
      }
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || '连接测试失败')
    },
  })

  // 防抖刷新函数
  const handleRefresh = useCallback(async () => {
    if (refreshCooldown) {
      message.warning('请稍后再试，刷新过于频繁')
      return
    }

    setIsRefreshing(true)
    setRefreshCooldown(true)

    try {
      await refetch()
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
  }, [refreshCooldown, refetch])

  // 拖拽调整列宽度的处理函数
  const handleMouseDown = (e: React.MouseEvent, columnKey: keyof typeof columnWidths) => {
    e.preventDefault()
    e.stopPropagation()
    
    const startX = e.clientX
    const startWidth = columnWidths[columnKey]
    
    // 添加拖拽状态类
    document.body.classList.add('resizing')
    
    // 找到对应的表头元素并添加拖拽状态
    const thElement = e.currentTarget.closest('th')
    if (thElement) {
      thElement.classList.add('dragging')
    }

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX
      const newWidth = Math.max(80, Math.min(400, startWidth + deltaX))
      setColumnWidths(prev => ({
        ...prev,
        [columnKey]: newWidth
      }))
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      
      // 移除拖拽状态类
      document.body.classList.remove('resizing')
      if (thElement) {
        thElement.classList.remove('dragging')
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // 列标题组件
  const ColumnTitle = ({ title, columnKey }: { title: string; columnKey: keyof typeof columnWidths }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
      <span>{title}</span>
      <div
        style={{
          position: 'absolute',
          right: '-8px',
          top: '0',
          bottom: '0',
          width: '8px',
          cursor: 'col-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          zIndex: 1
        }}
        onMouseDown={(e) => handleMouseDown(e, columnKey)}
      >
        <div
          style={{
            width: '2px',
            height: '16px',
            background: '#d9d9d9',
            borderRadius: '1px'
          }}
        />
      </div>
    </div>
  )

  const servers = serversData?.data.servers || []

  // 处理创建/编辑服务器
  const handleSubmit = (values: any) => {
    // 根据认证类型处理数据
    const submitData = { ...values }
    
    if (authType === 'password') {
      // 密码认证：清除私钥字段
      delete submitData.private_key
    } else {
      // 证书认证：清除密码字段
      delete submitData.password
    }
    
    if (editingServer) {
      updateMutation.mutate({ id: editingServer.id, data: submitData })
    } else {
      createMutation.mutate(submitData)
    }
  }

  // 处理编辑
  const handleEdit = (server: Server) => {
    setEditingServer(server)
    
    // 设置表单值，包括代理配置
    const formValues = {
      ...server,
      // 确保代理配置字段正确设置
      proxy_enabled: server.proxy_enabled || false,
      proxy_host: server.proxy_host || '',
      proxy_port: server.proxy_port || 1080,
      proxy_username: server.proxy_username || '',
      proxy_password: server.proxy_password || ''
    }
    
    form.setFieldsValue(formValues)
    // 根据服务器是否有私钥来判断认证类型
    setAuthType(server.private_key ? 'key' : 'password')
    setIsModalVisible(true)
  }

  // 处理删除
  const handleDelete = (id: number) => {
    deleteMutation.mutate(id)
  }

  // 处理测试连接
  const handleTestConnection = (id: number) => {
    testConnectionMutation.mutate(id)
  }

  // 表格列配置
  const columns = [
    {
      title: <ColumnTitle title="服务器名称" columnKey="name" />,
      dataIndex: 'name',
      key: 'name',
      width: columnWidths.name,
      fixed: 'left' as const,
      render: (text: string) => (
        <div style={{ fontWeight: 600, color: '#1890ff' }}>
          {text}
        </div>
      ),
    },
    {
      title: <ColumnTitle title="主机地址" columnKey="host" />,
      dataIndex: 'host',
      key: 'host',
      width: columnWidths.host,
      ellipsis: true,
      render: (text: string, record: Server) => (
        <div style={{ 
          fontFamily: 'monospace', 
          fontSize: '12px',
          color: 'var(--ant-color-text-secondary)',
          background: 'var(--ant-color-fill-quaternary)',
          padding: '2px 6px',
          borderRadius: '4px',
          display: 'inline-block'
        }}>
          {record.hide_sensitive_info ? '***.***.***.***' : text}
        </div>
      ),
    },
    {
      title: <ColumnTitle title="端口" columnKey="port" />,
      dataIndex: 'port',
      key: 'port',
      width: columnWidths.port,
      align: 'center' as const,
      render: (text: number, record: Server) => (
        <div style={{ 
          fontFamily: 'monospace', 
          fontSize: '12px',
          color: 'var(--ant-color-text-secondary)',
          background: 'var(--ant-color-fill-quaternary)',
          padding: '2px 6px',
          borderRadius: '4px',
          display: 'inline-block'
        }}>
          {record.hide_sensitive_info ? '***' : text}
        </div>
      ),
    },
    {
      title: <ColumnTitle title="用户名" columnKey="username" />,
      dataIndex: 'username',
      key: 'username',
      width: columnWidths.username,
      ellipsis: true,
      render: (text: string, record: Server) => (
        <div style={{ 
          fontFamily: 'monospace', 
          fontSize: '12px',
          color: 'var(--ant-color-text-secondary)',
          background: 'var(--ant-color-fill-quaternary)',
          padding: '2px 6px',
          borderRadius: '4px',
          display: 'inline-block'
        }}>
          {record.hide_sensitive_info ? '***' : text}
        </div>
      ),
    },
    {
      title: <ColumnTitle title="状态" columnKey="status" />,
      dataIndex: 'status',
      key: 'status',
      width: columnWidths.status,
      align: 'center' as const,
      render: (status: string, record: Server) => {
        if (!record.is_active) {
          return (
            <Tag 
              color="red"
              style={{ 
                margin: 0,
                borderRadius: '12px',
                fontWeight: 500
              }}
            >
              禁用
            </Tag>
          )
        }
        return (
          <Tag 
            color={status === '在线' ? 'green' : 'red'}
            style={{ 
              margin: 0,
              borderRadius: '12px',
              fontWeight: 500
            }}
          >
            {status || '未知'}
          </Tag>
        )
      },
    },
    {
      title: <ColumnTitle title="创建时间" columnKey="created_at" />,
      dataIndex: 'created_at',
      key: 'created_at',
      width: columnWidths.created_at,
      render: (date: string) => (
        <div style={{ fontSize: '12px', color: 'var(--ant-color-text-secondary)' }}>
          {new Date(date).toLocaleString('zh-CN')}
        </div>
      ),
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right' as const,
      render: (record: Server) => (
        <Space size="small">
          <Button
            size="small"
            type="link"
            icon={<CheckCircleOutlined />}
            onClick={() => handleTestConnection(record.id)}
            loading={testConnectionMutation.isLoading}
          >
            测试
          </Button>
          {user?.role === 'admin' && (
            <>
              <Button
                size="small"
                type="link"
                icon={<EditOutlined />}
                onClick={() => handleEdit(record)}
              >
                编辑
              </Button>
              <Popconfirm
                title="确定要删除这个服务器吗？"
                onConfirm={() => handleDelete(record.id)}
                okText="确定"
                cancelText="取消"
              >
                <Button
                  size="small"
                  type="link"
                  danger
                  icon={<DeleteOutlined />}
                  loading={deleteMutation.isLoading}
                >
                  删除
                </Button>
              </Popconfirm>
            </>
          )}
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
        
        /* 页面标题样式 */
        .page-title {
          font-size: 2rem;
          font-weight: 700;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        
        .stat-title {
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
        }
      `}</style>
      <motion.div 
        style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <GradientText 
          text="服务器管理" 
          className="page-title"
          gradient="from-blue-500 to-purple-600"
        />
        <Space>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={handleRefresh}
            loading={isRefreshing}
            disabled={refreshCooldown}
          >
            刷新
          </Button>
          {user?.role === 'admin' && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingServer(null)
                form.resetFields()
                setAuthType('password')
                setIsModalVisible(true)
              }}
            >
              添加服务器
            </Button>
          )}
        </Space>
      </motion.div>

      {/* 统计信息 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <Card hoverable>
              <Statistic
                title={
                  <SlideInText 
                    text="总服务器数" 
                    direction="left" 
                    delay={0.2}
                    className="stat-title"
                  />
                }
                value={servers.length}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </motion.div>
        </Col>
        <Col xs={24} sm={8}>
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
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </motion.div>
        </Col>
        <Col xs={24} sm={8}>
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
                valueStyle={{ color: '#ff4d4f' }}
              />
            </Card>
          </motion.div>
        </Col>
      </Row>

      {/* 服务器列表 */}
      <Card>
        <Table
          columns={columns}
          dataSource={servers}
          loading={isLoading}
          rowKey="id"
          className={isRefreshing ? 'table-refreshing' : ''}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 个服务器`,
            style: { padding: '16px 24px' }
          }}
          scroll={{ x: 1200 }}
          size="middle"
          style={{
            borderRadius: '8px'
          }}
          rowClassName={(_, index) => 
            index % 2 === 0 ? 'table-row-light' : 'table-row-dark'
          }
        />
      </Card>

      {/* 添加/编辑服务器模态框 */}
      <Modal
        title={editingServer ? '编辑服务器' : '添加服务器'}
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false)
          setEditingServer(null)
          form.resetFields()
          setAuthType('password')
        }}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="name"
            label="服务器名称"
            rules={[{ required: true, message: '请输入服务器名称' }]}
          >
            <Input placeholder="请输入服务器名称" />
          </Form.Item>

          <Form.Item
            name="host"
            label="主机地址"
            rules={[
              { required: true, message: '请输入主机地址' },
              { type: 'string', message: '请输入有效的主机地址' }
            ]}
          >
            <Input placeholder="请输入主机地址，如：192.168.1.100" />
          </Form.Item>

          <Form.Item
            name="ssh_port"
            label="SSH 端口"
            rules={[{ required: true, message: '请输入SSH端口' }]}
            initialValue={22}
          >
            <InputNumber
              min={1}
              max={65535}
              style={{ width: '100%' }}
              placeholder="SSH端口，默认22"
            />
          </Form.Item>

          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="请输入SSH用户名" />
          </Form.Item>

          <Form.Item label="认证方式">
            <Radio.Group 
              value={authType} 
              onChange={(e) => setAuthType(e.target.value)}
              style={{ marginBottom: 16 }}
            >
              <Radio.Button value="password">密码</Radio.Button>
              <Radio.Button value="key">证书</Radio.Button>
            </Radio.Group>
          </Form.Item>

          {authType === 'password' ? (
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
              <Input.Password 
                placeholder="请输入SSH密码" 
                style={{ width: '100%' }}
              />
            </Form.Item>
          ) : (
            <Form.Item
              name="private_key"
              label="私钥"
              rules={[
                { required: true, message: '请输入私钥内容' },
                { min: 50, message: '私钥内容过短，请检查格式' }
              ]}
            >
              <Input.TextArea 
                rows={8} 
                placeholder="请输入SSH私钥内容（支持RSA、ED25519等格式）&#10;示例：&#10;-----BEGIN OPENSSH PRIVATE KEY-----&#10;b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn...&#10;-----END OPENSSH PRIVATE KEY-----"
                style={{ 
                  fontFamily: 'monospace', 
                  fontSize: '12px',
                  lineHeight: '1.4'
                }}
              />
          </Form.Item>
          )}

          <Form.Item
            name="description"
            label="描述"
          >
            <Input.TextArea 
              rows={3} 
              placeholder="请输入服务器描述（可选）" 
            />
          </Form.Item>

          {/* 代理配置部分 */}
          <div style={{ 
            marginTop: 24, 
            padding: 16, 
            background: themeToken.colorFillSecondary,
            borderRadius: themeToken.borderRadius,
            border: `1px solid ${themeToken.colorBorderSecondary}`
          }}>
            <h4 style={{ 
              marginBottom: 16, 
              color: themeToken.colorPrimary,
              fontSize: '16px',
              fontWeight: 500
            }}>SOCKS5 代理配置</h4>
            
            <Form.Item
              name="proxy_enabled"
              label="启用代理"
              initialValue={false}
            >
              <Radio.Group>
                <Radio value={true}>启用</Radio>
                <Radio value={false}>禁用</Radio>
              </Radio.Group>
            </Form.Item>

            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) => 
                prevValues.proxy_enabled !== currentValues.proxy_enabled
              }
            >
              {({ getFieldValue }) => {
                const proxyEnabled = getFieldValue('proxy_enabled');
                return proxyEnabled ? (
                  <>
                    <Form.Item
                      name="proxy_host"
                      label="代理主机"
                      rules={[{ required: true, message: '请输入代理主机地址' }]}
                    >
                      <Input placeholder="代理服务器地址，如：127.0.0.1" />
                    </Form.Item>

                    <Form.Item
                      name="proxy_port"
                      label="代理端口"
                      rules={[{ required: true, message: '请输入代理端口' }]}
                      initialValue={1080}
                    >
                      <InputNumber
                        min={1}
                        max={65535}
                        style={{ width: '100%' }}
                        placeholder="代理端口，默认1080"
                      />
                    </Form.Item>

                    <Form.Item
                      name="proxy_username"
                      label="代理用户名"
                    >
                      <Input placeholder="代理用户名（可选）" />
                    </Form.Item>

                    <Form.Item
                      name="proxy_password"
                      label="代理密码"
                    >
                      <Input.Password placeholder="代理密码（可选）" />
                    </Form.Item>
                  </>
                ) : null;
              }}
            </Form.Item>
          </div>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setIsModalVisible(false)}>
                取消
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={createMutation.isLoading || updateMutation.isLoading}
              >
                {editingServer ? '更新' : '创建'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Servers
