import React from 'react'
import { Form, Input, Button, Card, Typography, message } from 'antd'
import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { useMutation } from 'react-query'

import { useAuthStore } from '@/stores/authStore'
import { authAPI, LoginRequest } from '@/services/api'

const { Title, Text } = Typography

interface LocationState {
  from?: {
    pathname: string
  }
}

const Login: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuthStore()

  const state = location.state as LocationState
  const from = state?.from?.pathname || '/dashboard'

  // 密码登录 mutation
  const loginMutation = useMutation({
    mutationFn: (data: LoginRequest) => authAPI.login(data),
    onSuccess: (response) => {
      const { user, token } = response.data
      login(token, user)
      message.success('登录成功')
      navigate(from, { replace: true })
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || '登录失败')
    },
  })

  // 处理密码登录
  const handlePasswordLogin = (values: LoginRequest) => {
    loginMutation.mutate(values)
  }


  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '20px',
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 400,
          boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
          borderRadius: '12px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={2} style={{ margin: 0, color: '#1890ff' }}>
            Docker Manager
          </Title>
          <Text type="secondary" style={{ color: 'black' }}>
            容器管理系统
          </Text>
        </div>

        <Form
          name="password-login"
          onFinish={handlePasswordLogin}
          autoComplete="off"
          size="large"
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input
              prefix={<MailOutlined />}
              placeholder="邮箱"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loginMutation.isLoading}
              style={{ width: '100%' }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Text type="secondary" style={{ fontSize: 12, color: 'black'}}>
            © 2025 Docker Manager & Zer0Teams. 功能强大的容器管理系统
          </Text>
        </div>
      </Card>
    </div>
  )
}

export default Login
