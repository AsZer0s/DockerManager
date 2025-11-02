import React, { useState } from 'react'
import { 
  Table, 
  Modal, 
  Form, 
  Input,
  Select, 
  notification, 
  Space, 
  Popconfirm,
  Typography,
  Tag,
  Tooltip,
  theme,
  Button,
  Card
} from 'antd'
import { motion } from 'framer-motion'
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  UserOutlined,
  DatabaseOutlined,
  ContainerOutlined
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { userManagementAPI } from '../services/api'

const { Title, Text } = Typography
const { Option } = Select

interface User {
  id: number
  username: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
  visibleServers: number[]
  visibleContainers: string[]
}

interface Server {
  id: number
  name: string
  host: string
  port: number
  status: string
}

interface Container {
  id: string
  name: string
  serverId: number
  serverName: string
  status: string
}

const UserManagement: React.FC = () => {
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()
  const [visible, setVisible] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [serverModalVisible, setServerModalVisible] = useState(false)
  const [containerModalVisible, setContainerModalVisible] = useState(false)
  const [columnWidths, setColumnWidths] = useState({
    username: 150,
    email: 200,
    role: 100,
    isActive: 100,
    visibleServers: 120,
    visibleContainers: 120,
    createdAt: 150
  })
  const queryClient = useQueryClient()
  const { token: themeToken } = theme.useToken()

  // 获取用户列表
  const { data: usersData, isLoading: usersLoading } = useQuery(
    'users',
    () => userManagementAPI.getUsers(),
    {
      select: (response) => response.data.users
    }
  )

  // 获取服务器列表
  const { data: serversData } = useQuery(
    'servers',
    () => userManagementAPI.getServers(),
    {
      select: (response) => response.data.servers
    }
  )

  // 获取容器列表
  const { data: containersData } = useQuery(
    'containers',
    () => userManagementAPI.getContainers(),
    {
      select: (response) => response.data.containers
    }
  )

  // 创建用户
  const createUserMutation = useMutation(
    (data: any) => userManagementAPI.createUser(data),
    {
      onSuccess: () => {
        notification.success({
          message: '创建成功',
          description: '用户创建成功',
          placement: 'topRight',
        })
        setVisible(false)
        form.resetFields()
        queryClient.invalidateQueries('users')
      },
      onError: (error: any) => {
        notification.error({
          message: '创建失败',
          description: error.response?.data?.message || '创建用户失败',
          placement: 'topRight',
        })
      }
    }
  )

  // 更新用户
  const updateUserMutation = useMutation(
    ({ id, data }: { id: number; data: any }) => userManagementAPI.updateUser(id, data),
    {
      onSuccess: () => {
        notification.success({
          message: '更新成功',
          description: '用户更新成功',
          placement: 'topRight',
        })
        setEditingUser(null)
        editForm.resetFields()
        queryClient.invalidateQueries('users')
      },
      onError: (error: any) => {
        notification.error({
          message: '更新失败',
          description: error.response?.data?.message || '更新用户失败',
          placement: 'topRight',
        })
      }
    }
  )

  // 删除用户
  const deleteUserMutation = useMutation(
    (id: number) => userManagementAPI.deleteUser(id),
    {
      onSuccess: () => {
        notification.success({
          message: '删除成功',
          description: '用户删除成功',
          placement: 'topRight',
        })
        queryClient.invalidateQueries('users')
      },
      onError: (error: any) => {
        notification.error({
          message: '删除失败',
          description: error.response?.data?.message || '删除用户失败',
          placement: 'topRight',
        })
      }
    }
  )

  // 更新用户可见服务器
  const updateUserServersMutation = useMutation(
    ({ userId, serverIds }: { userId: number; serverIds: number[] }) => 
      userManagementAPI.updateUserServers(userId, serverIds),
    {
      onSuccess: () => {
        notification.success({
          message: '更新成功',
          description: '用户可见服务器更新成功',
          placement: 'topRight',
        })
        setServerModalVisible(false)
        setSelectedUser(null)
        queryClient.invalidateQueries('users')
      },
      onError: (error: any) => {
        notification.error({
          message: '更新失败',
          description: error.response?.data?.message || '用户可见服务器更新失败',
          placement: 'topRight',
        })
      }
    }
  )

  // 更新用户可见容器
  const updateUserContainersMutation = useMutation(
    ({ userId, containerIds }: { userId: number; containerIds: string[] }) => 
      userManagementAPI.updateUserContainers(userId, containerIds),
    {
      onSuccess: () => {
        notification.success({
          message: '更新成功',
          description: '用户可见容器更新成功',
          placement: 'topRight',
        })
        setContainerModalVisible(false)
        setSelectedUser(null)
        queryClient.invalidateQueries('users')
      },
      onError: (error: any) => {
        notification.error({
          message: '更新失败',
          description: error.response?.data?.message || '用户可见容器更新失败',
          placement: 'topRight',
        })
      }
    }
  )

  // 处理创建用户
  const handleCreateUser = (values: any) => {
    createUserMutation.mutate(values)
  }

  // 处理编辑用户
  const handleEditUser = (user: User) => {
    setEditingUser(user)
    editForm.setFieldsValue({
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive
    })
  }

  // 处理更新用户
  const handleUpdateUser = (values: any) => {
    if (editingUser) {
      updateUserMutation.mutate({ id: editingUser.id, data: values })
    }
  }

  // 处理删除用户
  const handleDeleteUser = (id: number) => {
    deleteUserMutation.mutate(id)
  }

  // 处理管理服务器权限
  const handleManageServers = (user: User) => {
    setSelectedUser(user)
    setServerModalVisible(true)
  }

  // 处理管理容器权限
  const handleManageContainers = (user: User) => {
    setSelectedUser(user)
    setContainerModalVisible(true)
  }

  // 处理更新用户服务器权限
  const handleUpdateUserServers = (values: any) => {
    if (selectedUser) {
      updateUserServersMutation.mutate({
        userId: selectedUser.id,
        serverIds: values.serverIds || []
      })
    }
  }

  // 处理更新用户容器权限
  const handleUpdateUserContainers = (values: any) => {
    if (selectedUser) {
      updateUserContainersMutation.mutate({
        userId: selectedUser.id,
        containerIds: values.containerIds || []
      })
    }
  }

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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
      <span style={{ textAlign: 'center', flex: 1 }}>{title}</span>
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

  // 表格列配置
  const columns = [
    {
      title: <ColumnTitle title="用户名" columnKey="username" />,
      dataIndex: 'username',
      key: 'username',
      width: columnWidths.username,
      fixed: 'left' as const,
      align: 'center' as const,
      render: (text: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
          <UserOutlined style={{ color: '#0072ff' }} />
          <div style={{ fontWeight: 600, color: '#0072ff' }}>

          </div>
        </div>
      )
    },
    {
      title: <ColumnTitle title="邮箱" columnKey="email" />,
      dataIndex: 'email',
      key: 'email',
      width: columnWidths.email,
      ellipsis: true,
      align: 'center' as const,
      render: (text: string) => (
        <div style={{ 
          fontFamily: 'monospace', 
          fontSize: '12px',
          color: themeToken.colorTextSecondary,
          background: themeToken.colorFillSecondary,
          padding: '2px 6px',
          borderRadius: '4px',
          display: 'inline-block',
          textAlign: 'center'
        }}>
          {text}
        </div>
      )
    },
    {
      title: <ColumnTitle title="角色" columnKey="role" />,
      dataIndex: 'role',
      key: 'role',
      width: columnWidths.role,
      align: 'center' as const,
      render: (role: string) => (
        <Tag 
          color={role === 'admin' ? 'red' : 'blue'}
          className="user-tag"
        >
          {role === 'admin' ? '管理员' : '用户'}
        </Tag>
      )
    },
    {
      title: <ColumnTitle title="状态" columnKey="isActive" />,
      dataIndex: 'isActive',
      key: 'isActive',
      width: columnWidths.isActive,
      align: 'center' as const,
      render: (isActive: boolean) => (
        <Tag 
          color={isActive ? 'green' : 'red'}
          className="user-tag"
        >
          {isActive ? '活跃' : '禁用'}
        </Tag>
      )
    },
    {
      title: <ColumnTitle title="可见服务器" columnKey="visibleServers" />,
      dataIndex: 'visibleServers',
      key: 'visibleServers',
      width: columnWidths.visibleServers,
      align: 'center' as const,
      render: (serverIds: number[], record: User) => {
        // 管理员用户显示"全部"
        if (record.role === 'admin') {
          return (
            <Tooltip title="管理员可访问全部服务器">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <DatabaseOutlined style={{ color: '#52c41a' }} />
                <span style={{ fontWeight: 500, color: '#52c41a' }}>全部</span>
              </div>
            </Tooltip>
          )
        }
        // 普通用户显示具体数量
        return (
          <Tooltip title={`可访问 ${serverIds?.length || 0} 个服务器`}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <DatabaseOutlined style={{ color: '#52c41a' }} />
              <span style={{ fontWeight: 500 }}>{serverIds?.length || 0}</span>
            </div>
          </Tooltip>
        )
      }
    },
    {
      title: <ColumnTitle title="可见容器" columnKey="visibleContainers" />,
      dataIndex: 'visibleContainers',
      key: 'visibleContainers',
      width: columnWidths.visibleContainers,
      align: 'center' as const,
      render: (containerIds: string[], record: User) => {
        // 管理员用户显示"全部"
        if (record.role === 'admin') {
          return (
            <Tooltip title="管理员可访问全部容器">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <ContainerOutlined style={{ color: '#0072ff' }} />
                <span style={{ fontWeight: 500, color: '#0072ff' }}>全部</span>
              </div>
            </Tooltip>
          )
        }
        // 普通用户显示具体数量
        return (
          <Tooltip title={`可访问 ${containerIds?.length || 0} 个容器`}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <ContainerOutlined style={{ color: '#0072ff' }} />
              <span style={{ fontWeight: 500 }}>{containerIds?.length || 0}</span>
            </div>
          </Tooltip>
        )
      }
    },
    {
      title: <ColumnTitle title="创建时间" columnKey="createdAt" />,
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: columnWidths.createdAt,
      align: 'center' as const,
      render: (date: string) => (
        <div style={{ fontSize: '12px', color: themeToken.colorTextSecondary, textAlign: 'center' }}>
          {new Date(date).toLocaleString('zh-CN')}
        </div>
      )
    },
    {
      title: '操作',
      key: 'action',
      align: 'center' as const,
      render: (_: any, record: User) => (
        <Space size="small" style={{ justifyContent: 'center', display: 'flex' }}>
          <Button
            size="small"
            type="link"
            className="action-button"
            icon={<EditOutlined />}
            onClick={() => handleEditUser(record)}
          >
            编辑
          </Button>
          <Button
            size="small"
            type="link"
            className="action-button"
            icon={<DatabaseOutlined />}
            onClick={() => handleManageServers(record)}
          >
            服务器
          </Button>
          <Button
            size="small"
            type="link"
            className="action-button"
            icon={<ContainerOutlined />}
            onClick={() => handleManageContainers(record)}
          >
            容器
          </Button>
          {record.role !== 'admin' && (
            <Popconfirm
              title="确定要删除这个用户吗？"
              onConfirm={() => handleDeleteUser(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button
                size="small"
                type="link"
                danger
                className="action-button"
                icon={<DeleteOutlined />}
              >
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ]

  return (
    <div>
      <style>{`
        /* Apple-style 用户管理 */
        .user-management-container {
          background: #f8fafc;
          min-height: 100vh;
          padding: 24px;
        }
        
        .user-management-header {
          background: white;
          border-radius: 20px;
          padding: 32px;
          margin-bottom: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .page-title {
          font-size: 2.5rem !important;
          font-weight: 700 !important;
          margin-bottom: 8px !important;
          background: linear-gradient(135deg, #007AFF 0%, #5856D6 100%) !important;
          -webkit-background-clip: text !important;
          -webkit-text-fill-color: transparent !important;
          background-clip: text !important;
          color: transparent !important;
          letter-spacing: -0.02em !important;
        }
        
        .page-description {
          color: #6b7280 !important;
          font-size: 1.1rem !important;
          font-weight: 400 !important;
        }
        
        .user-table-card {
          background: white;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          border: 1px solid #e5e7eb;
        }
        
        .table-header {
          padding: 24px 32px;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .table-title {
          font-size: 1.3rem !important;
          font-weight: 600 !important;
          color: #1f2937 !important;
          margin: 0 !important;
        }
        
        .add-user-btn {
          border-radius: 12px !important;
          font-weight: 600 !important;
          height: 44px !important;
          padding: 0 24px !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          border: none !important;
          box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3) !important;
          background: linear-gradient(135deg, #007AFF 0%, #5856D6 100%) !important;
        }
        
        .add-user-btn:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 6px 16px rgba(0, 122, 255, 0.4) !important;
        }
        
        .ant-table {
          font-size: 0.95rem !important;
        }
        
        .ant-table-thead > tr > th {
          background: #f8fafc !important;
          border-bottom: 2px solid #e5e7eb !important;
          font-weight: 600 !important;
          color: #374151 !important;
          padding: 16px 8px !important;
        }
        
        .ant-table-tbody > tr > td {
          padding: 16px 8px !important;
          border-bottom: 1px solid #f1f5f9 !important;
        }
        
        .ant-table-tbody > tr:hover > td {
          background: #f8fafc !important;
        }
        
        .table-row-light {
          background: white !important;
        }
        
        .table-row-dark {
          background: #fafbfc !important;
        }
        
        .action-button {
          border-radius: 8px !important;
          font-weight: 500 !important;
          height: 32px !important;
          padding: 0 12px !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          border: none !important;
        }
        
        .action-button:hover {
          transform: translateY(-1px) !important;
        }
        
        .user-tag {
          border-radius: 12px !important;
          font-weight: 500 !important;
          padding: 4px 12px !important;
          border: none !important;
        }
        
        .modal-form .ant-form-item-label > label {
          font-weight: 600 !important;
          color: #374151 !important;
          font-size: 0.95rem !important;
        }
        
        .modal-input {
          border-radius: 12px !important;
          border: 2px solid #e5e7eb !important;
          padding: 12px 16px !important;
          font-size: 1rem !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        
        .modal-input:hover {
          border-color: #007AFF !important;
        }
        
        .modal-input:focus {
          border-color: #007AFF !important;
          box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1) !important;
        }
        
        .modal-button {
          border-radius: 12px !important;
          height: 44px !important;
          font-weight: 600 !important;
          padding: 0 24px !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        
        .modal-button-primary {
          background: linear-gradient(135deg, #007AFF 0%, #5856D6 100%) !important;
          border: none !important;
          box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3) !important;
        }
        
        .modal-button-primary:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 6px 16px rgba(0, 122, 255, 0.4) !important;
        }
        
        .modal-button-default {
          background: #f3f4f6 !important;
          border: 2px solid #e5e7eb !important;
          color: #374151 !important;
        }
        
        .modal-button-default:hover {
          background: #e5e7eb !important;
          border-color: #d1d5db !important;
        }
      `}</style>
      
      <div className="user-management-container">
        <motion.div 
          className="user-management-header"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <Typography.Title level={1} className="page-title">
            用户管理
          </Typography.Title>
          <Typography.Text className="page-description">
            管理用户账户、角色权限和访问控制
          </Typography.Text>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <div className="user-table-card">
            <div className="table-header">
              <Title level={3} className="table-title">用户列表</Title>
              <Button
                type="primary"
                className="add-user-btn"
                icon={<PlusOutlined />}
                onClick={() => setVisible(true)}
                size="large"
              >
                添加用户
              </Button>
            </div>

                    <div style={{ padding: '0 32px 32px' }}>
              <Table
                columns={columns}
                dataSource={usersData}
                loading={usersLoading}
                rowKey="id"
                pagination={{
                  pageSize: 10,
                  showSizeChanger: true,
                  showQuickJumper: true,
                  showTotal: (total) => `共 ${total} 个用户`,
                  style: { padding: '16px 0' }
                }}
                scroll={{ x: 1200 }}
                size="middle"
                rowClassName={(_, index) => 
                  index % 2 === 0 ? 'table-row-light' : 'table-row-dark'
                }
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* 创建用户模态框 */}
      <Modal
        title={
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ 
              fontSize: '1.5rem', 
              fontWeight: 600, 
              background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: 'transparent'
            }}>
              添加用户
            </div>
          </div>
        }
        open={visible}
        onCancel={() => setVisible(false)}
        footer={null}
        width={500}
        styles={{
          body: { padding: '24px 32px 32px' },
          content: { borderRadius: '20px', overflow: 'hidden' }
        }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateUser}
          className="modal-form"
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="请输入用户名" className="modal-input" />
          </Form.Item>

          <Form.Item
            label="邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' }
            ]}
          >
            <Input placeholder="请输入邮箱" className="modal-input" />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' }
            ]}
          >
            <Input.Password placeholder="请输入密码" className="modal-input" />
          </Form.Item>

          <Form.Item
            label="角色"
            name="role"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select placeholder="请选择角色" className="modal-input">
              <Option value="user">用户</Option>
              <Option value="admin">管理员</Option>
            </Select>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right', marginTop: 32 }}>
            <Space size={12}>
              <Button 
                className="modal-button modal-button-default"
                onClick={() => setVisible(false)}
              >
                取消
              </Button>
              <Button 
                type="primary" 
                className="modal-button modal-button-primary"
                htmlType="submit"
                loading={createUserMutation.isLoading}
              >
                创建
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑用户模态框 */}
      <Modal
        title={
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ 
              fontSize: '1.5rem', 
              fontWeight: 600, 
              background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: 'transparent'
            }}>
              编辑用户
            </div>
          </div>
        }
        open={!!editingUser}
        onCancel={() => setEditingUser(null)}
        footer={null}
        width={500}
        styles={{
          body: { padding: '24px 32px 32px' },
          content: { borderRadius: '20px', overflow: 'hidden' }
        }}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleUpdateUser}
          className="modal-form"
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="请输入用户名" className="modal-input" />
          </Form.Item>

          <Form.Item
            label="邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' }
            ]}
          >
            <Input placeholder="请输入邮箱" className="modal-input" />
          </Form.Item>

          <Form.Item
            label="角色"
            name="role"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select placeholder="请选择角色" className="modal-input">
              <Option value="user">用户</Option>
              <Option value="admin">管理员</Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="状态"
            name="isActive"
            valuePropName="checked"
          >
            <Select placeholder="请选择状态" className="modal-input">
              <Option value={true}>活跃</Option>
              <Option value={false}>禁用</Option>
            </Select>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right', marginTop: 32 }}>
            <Space size={12}>
              <Button 
                className="modal-button modal-button-default"
                onClick={() => setEditingUser(null)}
              >
                取消
              </Button>
              <Button 
                type="primary" 
                className="modal-button modal-button-primary"
                htmlType="submit"
                loading={updateUserMutation.isLoading}
              >
                更新
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 管理服务器权限模态框 */}
      <Modal
        title={
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ 
              fontSize: '1.5rem', 
              fontWeight: 600, 
              background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: 'transparent'
            }}>
              管理服务器权限
            </div>
            <div style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '4px' }}>
              用户：{selectedUser?.username}
            </div>
          </div>
        }
        open={serverModalVisible}
        onCancel={() => setServerModalVisible(false)}
        footer={null}
        width={600}
        styles={{
          body: { padding: '24px 32px 32px' },
          content: { borderRadius: '20px', overflow: 'hidden' }
        }}
      >
        <Form
          layout="vertical"
          onFinish={handleUpdateUserServers}
          initialValues={{
            serverIds: selectedUser?.visibleServers || []
          }}
          className="modal-form"
        >
          <Form.Item
            label="可见服务器"
            name="serverIds"
            tooltip="选择用户可以访问的服务器"
          >
            <Select
              mode="multiple"
              placeholder="请选择服务器"
              style={{ width: '100%' }}
              className="modal-input"
            >
              {serversData?.map((server: Server) => (
                <Option key={server.id} value={server.id}>
                  {server.name} ({server.host}:{server.port})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right', marginTop: 32 }}>
            <Space size={12}>
              <Button 
                className="modal-button modal-button-default"
                onClick={() => setServerModalVisible(false)}
              >
                取消
              </Button>
              <Button 
                type="primary" 
                className="modal-button modal-button-primary"
                htmlType="submit"
                loading={updateUserServersMutation.isLoading}
              >
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 管理容器权限模态框 */}
      <Modal
        title={
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ 
              fontSize: '1.5rem', 
              fontWeight: 600, 
              background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: 'transparent'
            }}>
              管理容器权限
            </div>
            <div style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '4px' }}>
              用户：{selectedUser?.username}
            </div>
          </div>
        }
        open={containerModalVisible}
        onCancel={() => setContainerModalVisible(false)}
        footer={null}
        width={600}
        styles={{
          body: { padding: '24px 32px 32px' },
          content: { borderRadius: '20px', overflow: 'hidden' }
        }}
      >
        <Form
          layout="vertical"
          onFinish={handleUpdateUserContainers}
          initialValues={{
            containerIds: selectedUser?.visibleContainers || []
          }}
          className="modal-form"
        >
          <Form.Item
            label="可见容器"
            name="containerIds"
            tooltip="选择用户可以访问的容器"
          >
            <Select
              mode="multiple"
              placeholder="请选择容器"
              style={{ width: '100%' }}
              className="modal-input"
            >
              {containersData?.map((container: Container) => (
                <Option key={container.id} value={container.id}>
                  {container.name} (服务器: {container.serverName})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right', marginTop: 32 }}>
            <Space size={12}>
              <Button 
                className="modal-button modal-button-default"
                onClick={() => setContainerModalVisible(false)}
              >
                取消
              </Button>
              <Button 
                type="primary" 
                className="modal-button modal-button-primary"
                htmlType="submit"
                loading={updateUserContainersMutation.isLoading}
              >
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default UserManagement
