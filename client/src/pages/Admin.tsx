import React from 'react'
import { 
  Form, 
  notification, 
  Typography, 
  Space, 
  Alert,
  Row,
  Col,
  Spin,
  Card,
  Input,
  Button
} from 'antd'
import { motion } from 'framer-motion'
import { 
  UserOutlined, 
  LockOutlined
} from '@ant-design/icons'
import { useMutation, useQuery } from 'react-query'

import { useAuthStore } from '@/stores/authStore'
import { authAPI, settingsAPI } from '@/services/api'

const { Text } = Typography

const Admin: React.FC = () => {
  const [passwordForm] = Form.useForm()
  const { user, updateUser } = useAuthStore()

  // 获取最新的用户信息
  const { data: userData, isLoading: userLoading } = useQuery(
    'userProfile',
    () => settingsAPI.getProfile(),
    {
      select: (response) => response.data.user,
      onSuccess: (data) => {
        // 更新 authStore 中的用户信息
        updateUser({
          id: data.id,
          username: data.username,
          email: data.email,
          role: data.role as 'admin' | 'user',
          telegramId: data.telegramId
        })
      }
    }
  )

  // 修改密码 mutation
  const changePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) => 
      authAPI.changePassword(data),
    onSuccess: () => {
      notification.success({
        message: '修改成功',
        description: '密码修改成功',
        placement: 'topRight',
      })
      passwordForm.resetFields()
    },
    onError: (error: any) => {
      notification.error({
        message: '修改失败',
        description: error.response?.data?.message || '密码修改失败',
        placement: 'topRight',
      })
    },
  })


  // 处理修改密码
  const handleChangePassword = (values: any) => {
    changePasswordMutation.mutate({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword
    })
  }


  return (
    <div>
      <style>{`
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
        style={{ marginBottom: 24 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <Typography.Title level={1} className="page-title">
          管理员设置
        </Typography.Title>
        <Text type="secondary">
          管理您的账户设置和安全选项
        </Text>
      </motion.div>

      <Row gutter={[16, 16]}>
        {/* 账户信息 */}
        <Col xs={24} lg={12}>
          <Card 
            title={
              <span>
                <UserOutlined style={{ marginRight: 8 }} />
                账户信息
              </span>
            }
          >
            {userLoading ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <Spin size="large" />
              </div>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text strong>用户名: </Text>
                  <Text>{userData?.username || user?.username}</Text>
                </div>
                <div>
                  <Text strong>邮箱: </Text>
                  <Text>{userData?.email || user?.email}</Text>
                </div>
                <div>
                  <Text strong>角色: </Text>
                  <Text type="success">{userData?.role || user?.role}</Text>
                </div>
                <div>
                  <Text strong>Telegram ID: </Text>
                  <Text>{userData?.telegramId || user?.telegramId || '未绑定'}</Text>
                </div>
              </Space>
            )}
          </Card>
        </Col>

      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* 修改密码 */}
        <Col xs={24} lg={24}>
          <Card 
            title={
              <span>
                <LockOutlined style={{ marginRight: 8 }} />
                修改密码
              </span>
            }
          >
            <Form
              form={passwordForm}
              layout="vertical"
              onFinish={handleChangePassword}
            >
              <Form.Item
                name="currentPassword"
                label="当前密码"
                rules={[
                  { required: true, message: '请输入当前密码' }
                ]}
              >
                <Input
                  type="password"
                  prefix={<LockOutlined />}
                  placeholder="请输入当前密码"
                />
              </Form.Item>

              <Form.Item
                name="newPassword"
                label="新密码"
                rules={[
                  { required: true, message: '请输入新密码' },
                  { min: 6, message: '密码至少6个字符' }
                ]}
              >
                <Input
                  type="password"
                  prefix={<LockOutlined />}
                  placeholder="请输入新密码"
                />
              </Form.Item>

              <Form.Item
                name="confirmPassword"
                label="确认新密码"
                dependencies={['newPassword']}
                rules={[
                  { required: true, message: '请确认新密码' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('newPassword') === value) {
                        return Promise.resolve()
                      }
                      return Promise.reject(new Error('两次输入的密码不一致'))
                    },
                  }),
                ]}
              >
                <Input
                  type="password"
                  prefix={<LockOutlined />}
                  placeholder="请再次输入新密码"
                />
              </Form.Item>

              <Form.Item>
                <Button
                  htmlType="submit"
                  loading={changePasswordMutation.isLoading}
                  style={{ width: '100%' }}
                >
                  修改密码
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>

      </Row>

      {/* 安全建议 */}
      <Row style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title="安全建议">
            <Alert
              message="安全最佳实践"
              description={
                <div>
                  <p><strong>密码安全:</strong></p>
                  <ul>
                    <li>使用强密码，包含大小写字母、数字和特殊字符</li>
                    <li>定期更换密码，建议每 3-6 个月更换一次</li>
                    <li>不要在多个账户中使用相同密码</li>
                  </ul>
                  
                  <p style={{ marginTop: 16 }}><strong>账户安全:</strong></p>
                  <ul>
                    <li>定期检查登录日志，发现异常及时处理</li>
                    <li>不要在公共设备上保存登录信息</li>
                    <li>如发现异常登录，立即修改密码</li>
                  </ul>
                  
                  <p style={{ marginTop: 16 }}><strong>系统安全:</strong></p>
                  <ul>
                    <li>确保服务器防火墙配置正确</li>
                    <li>定期更新系统和依赖包</li>
                    <li>监控系统日志，及时发现异常</li>
                  </ul>
                </div>
              }
              type="warning"
              showIcon
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Admin
