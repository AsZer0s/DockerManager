import React from 'react'
import { 
  Card, 
  Form, 
  Input, 
  Button, 
  message, 
  Typography, 
  Space, 
  Alert,
  Row,
  Col
} from 'antd'
import { 
  UserOutlined, 
  LockOutlined
} from '@ant-design/icons'
import { useMutation } from 'react-query'

import { useAuthStore } from '@/stores/authStore'
import { authAPI } from '@/services/api'

const { Title, Text } = Typography

const Admin: React.FC = () => {
  const [passwordForm] = Form.useForm()
  const { user } = useAuthStore()

  // 修改密码 mutation
  const changePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) => 
      authAPI.changePassword(data),
    onSuccess: () => {
      message.success('密码修改成功')
      passwordForm.resetFields()
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || '密码修改失败')
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
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>管理员设置</Title>
        <Text type="secondary">
          管理您的账户设置和安全选项
        </Text>
      </div>

      <Row gutter={[16, 16]}>
        {/* 账户信息 */}
        <Col xs={24} lg={12}>
          <Card title={
            <span>
              <UserOutlined style={{ marginRight: 8 }} />
              账户信息
            </span>
          }>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text strong>用户名: </Text>
                <Text>{user?.username}</Text>
              </div>
              <div>
                <Text strong>邮箱: </Text>
                <Text>{user?.email}</Text>
              </div>
              <div>
                <Text strong>角色: </Text>
                <Text type="success">{user?.role}</Text>
              </div>
              <div>
                <Text strong>Telegram ID: </Text>
                <Text>{user?.telegramId || '未绑定'}</Text>
              </div>
            </Space>
          </Card>
        </Col>

      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* 修改密码 */}
        <Col xs={24} lg={24}>
          <Card title={
            <span>
              <LockOutlined style={{ marginRight: 8 }} />
              修改密码
            </span>
          }>
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
                <Input.Password
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
                <Input.Password
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
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="请再次输入新密码"
                />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
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
