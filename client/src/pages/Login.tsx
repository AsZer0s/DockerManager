import React from 'react'
import { Form, Typography, Card, Input, Button, App } from 'antd'
import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { useMutation } from 'react-query'
import { motion } from 'framer-motion'
import { 
  FadeInText 
} from '@/components/animations/TextAnimations'

import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { authAPI, LoginRequest } from '@/services/api'

const { Text } = Typography

interface LocationState {
  from?: {
    pathname: string
  }
}

const Login: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuthStore()
  const { isDark } = useThemeStore()
  const { notification } = App.useApp()

  const state = location.state as LocationState
  const from = state?.from?.pathname || '/dashboard'

  // 密码登录 mutation
  const loginMutation = useMutation({
    mutationFn: (data: LoginRequest) => authAPI.login(data),
    onSuccess: (response) => {
      const { user, token } = response.data
      login(token, user)
      notification.success({
        message: '登录成功',
        description: '欢迎回来！',
        placement: 'topRight',
      })
      navigate(from, { replace: true })
    },
    onError: (error: any) => {
      notification.error({
        message: '登录失败',
        description: error.response?.data?.message || '用户名或密码错误',
        placement: 'topRight',
      })
    },
  })

  // 处理密码登录
  const handlePasswordLogin = (values: LoginRequest) => {
    loginMutation.mutate(values)
  }


  return (
    <motion.div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '20px',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <style>{`
        .login-title {
          font-size: 2rem;
          font-weight: 700;
          margin-bottom: 8px;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        
        .login-subtitle {
          font-size: 1rem;
          color: ${isDark ? '#ffffff73' : '#6b7280'};
        }
        
        .login-copyright {
          color: ${isDark ? '#ffffff73' : '#00000073'};
        }
      `}</style>
      <motion.div
        initial={{ scale: 0.8, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <Card
          style={{
            width: '100%',
            maxWidth: 400,
          }}
        >
          <motion.div 
            style={{ textAlign: 'center', marginBottom: 32 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Typography.Title level={1} className="login-title">
              Docker Manager
            </Typography.Title>
            <FadeInText 
              text="容器管理系统"
              className="login-subtitle"
              delay={0.6}
            />
          </motion.div>

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
            <Input
              type="password"
              prefix={<LockOutlined />}
              placeholder="密码"
            />
          </Form.Item>

          <Form.Item>
            <Button
              htmlType="submit"
              loading={loginMutation.isLoading}
              style={{ width: '100%' }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Text type="secondary" className="login-copyright" style={{ fontSize: 12 }}>
            © 2025 Docker Manager & Zer0Teams.<br/> 功能强大的容器管理系统
          </Text>
        </div>
      </Card>
      </motion.div>
    </motion.div>
  )
}

export default Login
