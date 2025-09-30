import React, { useState } from 'react'
import { 
  Card, 
  Table, 
  Button, 
  Modal, 
  Form, 
  Input, 
  Select, 
  message, 
  Space, 
  Popconfirm,
  Typography,
  Tag,
  Tooltip
} from 'antd'
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
        message.success('用户创建成功')
        setVisible(false)
        form.resetFields()
        queryClient.invalidateQueries('users')
      },
      onError: (error: any) => {
        message.error(error.response?.data?.message || '创建用户失败')
      }
    }
  )

  // 更新用户
  const updateUserMutation = useMutation(
    ({ id, data }: { id: number; data: any }) => userManagementAPI.updateUser(id, data),
    {
      onSuccess: () => {
        message.success('用户更新成功')
        setEditingUser(null)
        editForm.resetFields()
        queryClient.invalidateQueries('users')
      },
      onError: (error: any) => {
        message.error(error.response?.data?.message || '更新用户失败')
      }
    }
  )

  // 删除用户
  const deleteUserMutation = useMutation(
    (id: number) => userManagementAPI.deleteUser(id),
    {
      onSuccess: () => {
        message.success('用户删除成功')
        queryClient.invalidateQueries('users')
      },
      onError: (error: any) => {
        message.error(error.response?.data?.message || '删除用户失败')
      }
    }
  )

  // 更新用户可见服务器
  const updateUserServersMutation = useMutation(
    ({ userId, serverIds }: { userId: number; serverIds: number[] }) => 
      userManagementAPI.updateUserServers(userId, serverIds),
    {
      onSuccess: () => {
        message.success('用户可见服务器更新成功')
        setServerModalVisible(false)
        setSelectedUser(null)
        queryClient.invalidateQueries('users')
      },
      onError: (error: any) => {
        message.error(error.response?.data?.message || '更新失败')
      }
    }
  )

  // 更新用户可见容器
  const updateUserContainersMutation = useMutation(
    ({ userId, containerIds }: { userId: number; containerIds: string[] }) => 
      userManagementAPI.updateUserContainers(userId, containerIds),
    {
      onSuccess: () => {
        message.success('用户可见容器更新成功')
        setContainerModalVisible(false)
        setSelectedUser(null)
        queryClient.invalidateQueries('users')
      },
      onError: (error: any) => {
        message.error(error.response?.data?.message || '更新失败')
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

  // 表格列配置
  const columns = [
    {
      title: <ColumnTitle title="用户名" columnKey="username" />,
      dataIndex: 'username',
      key: 'username',
      width: columnWidths.username,
      fixed: 'left' as const,
      render: (text: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UserOutlined style={{ color: '#1890ff' }} />
          <div style={{ fontWeight: 600, color: '#1890ff' }}>
            {text}
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
      render: (text: string) => (
        <div style={{ 
          fontFamily: 'monospace', 
          fontSize: '12px',
          color: '#666',
          background: '#f5f5f5',
          padding: '2px 6px',
          borderRadius: '4px',
          display: 'inline-block'
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
          style={{ 
            margin: 0,
            borderRadius: '12px',
            fontWeight: 500
          }}
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
          style={{ 
            margin: 0,
            borderRadius: '12px',
            fontWeight: 500
          }}
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
      render: (serverIds: number[]) => (
        <Tooltip title={`可访问 ${serverIds?.length || 0} 个服务器`}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <DatabaseOutlined style={{ color: '#52c41a' }} />
            <span style={{ fontWeight: 500 }}>{serverIds?.length || 0}</span>
          </div>
        </Tooltip>
      )
    },
    {
      title: <ColumnTitle title="可见容器" columnKey="visibleContainers" />,
      dataIndex: 'visibleContainers',
      key: 'visibleContainers',
      width: columnWidths.visibleContainers,
      align: 'center' as const,
      render: (containerIds: string[]) => (
        <Tooltip title={`可访问 ${containerIds?.length || 0} 个容器`}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <ContainerOutlined style={{ color: '#1890ff' }} />
            <span style={{ fontWeight: 500 }}>{containerIds?.length || 0}</span>
          </div>
        </Tooltip>
      )
    },
    {
      title: <ColumnTitle title="创建时间" columnKey="createdAt" />,
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: columnWidths.createdAt,
      render: (date: string) => (
        <div style={{ fontSize: '12px', color: '#666' }}>
          {new Date(date).toLocaleString('zh-CN')}
        </div>
      )
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right' as const,
      render: (_: any, record: User) => (
        <Space size="small">
          <Button
            size="small"
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEditUser(record)}
          >
            编辑
          </Button>
          <Button
            size="small"
            type="link"
            icon={<DatabaseOutlined />}
            onClick={() => handleManageServers(record)}
          >
            服务器
          </Button>
          <Button
            size="small"
            type="link"
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
    <div style={{ padding: '0 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>
          <UserOutlined style={{ marginRight: 8 }} />
          用户管理
        </Title>
        <Text type="secondary">管理用户账户和权限设置</Text>
      </div>

      <Card>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={4} style={{ margin: 0 }}>用户列表</Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setVisible(true)}
          >
            添加用户
          </Button>
        </div>

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

      {/* 创建用户模态框 */}
      <Modal
        title="添加用户"
        open={visible}
        onCancel={() => setVisible(false)}
        footer={null}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateUser}
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>

          <Form.Item
            label="邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' }
            ]}
          >
            <Input placeholder="请输入邮箱" />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' }
            ]}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>

          <Form.Item
            label="角色"
            name="role"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select placeholder="请选择角色">
              <Option value="user">用户</Option>
              <Option value="admin">管理员</Option>
            </Select>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setVisible(false)}>取消</Button>
              <Button 
                type="primary" 
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
        title="编辑用户"
        open={!!editingUser}
        onCancel={() => setEditingUser(null)}
        footer={null}
        width={500}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleUpdateUser}
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>

          <Form.Item
            label="邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' }
            ]}
          >
            <Input placeholder="请输入邮箱" />
          </Form.Item>

          <Form.Item
            label="角色"
            name="role"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select placeholder="请选择角色">
              <Option value="user">用户</Option>
              <Option value="admin">管理员</Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="状态"
            name="isActive"
            valuePropName="checked"
          >
            <Select placeholder="请选择状态">
              <Option value={true}>活跃</Option>
              <Option value={false}>禁用</Option>
            </Select>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setEditingUser(null)}>取消</Button>
              <Button 
                type="primary" 
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
        title={`管理用户 ${selectedUser?.username} 的服务器权限`}
        open={serverModalVisible}
        onCancel={() => setServerModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          layout="vertical"
          onFinish={handleUpdateUserServers}
          initialValues={{
            serverIds: selectedUser?.visibleServers || []
          }}
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
            >
              {serversData?.map((server: Server) => (
                <Option key={server.id} value={server.id}>
                  {server.name} ({server.host}:{server.port})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setServerModalVisible(false)}>取消</Button>
              <Button 
                type="primary" 
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
        title={`管理用户 ${selectedUser?.username} 的容器权限`}
        open={containerModalVisible}
        onCancel={() => setContainerModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          layout="vertical"
          onFinish={handleUpdateUserContainers}
          initialValues={{
            containerIds: selectedUser?.visibleContainers || []
          }}
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
            >
              {containersData?.map((container: Container) => (
                <Option key={container.id} value={container.id}>
                  {container.name} (服务器: {container.serverName})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setContainerModalVisible(false)}>取消</Button>
              <Button 
                type="primary" 
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
