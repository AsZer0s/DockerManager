import React from 'react'
import { Form, Input, Button, Card, Typography, message } from 'antd'
import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { useMutation } from 'react-query'
import { motion } from 'framer-motion'
import { 
  GradientText, 
  FadeInText 
} from '@/components/animations/TextAnimations'

import { useAuthStore } from '@/stores/authStore'
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
          color: #6b7280;
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
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            borderRadius: '12px',
          }}
        >
          <motion.div 
            style={{ textAlign: 'center', marginBottom: 32 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <GradientText 
              text="Docker Manager" 
              className="login-title"
              gradient="from-blue-500 to-purple-600"
            />
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
      </motion.div>
    </motion.div>
  )
}

export default Login
