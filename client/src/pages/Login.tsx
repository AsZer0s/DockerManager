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
      className="login-container"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isDark 
          ? 'linear-gradient(160deg, #020817 0%, #001a3c 45%, #03224f 100%)'
          : 'linear-gradient(160deg, #eaf6ff 0%, #d9edff 50%, #f4fbff 100%)',
        padding: '20px',
        position: 'relative',
        overflow: 'hidden'
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      {/* 背景装饰元素 */}
      <div className="glass-background">
        <div className="gradient-ring blue" />
        <div className="gradient-ring deep" />
        <div className="gradient-ring soft" />
      </div>
      <style>{`
        .login-title {
          font-size: 2rem;
          font-weight: 700;
          margin-bottom: 8px;
          background: linear-gradient(135deg, #00c6ff, #0072ff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .login-subtitle {
          font-size: 1rem;
          color: ${isDark ? 'rgba(195, 214, 245, 0.75)' : 'rgba(15, 28, 63, 0.68)'};
          font-weight: 500;
        }
        
        .login-copyright {
          color: ${isDark ? 'rgba(195, 214, 245, 0.45)' : 'rgba(15, 28, 63, 0.48)'};
          font-size: 12px;
        }
        
        .login-card .ant-card-body {
          padding: 32px !important;
          position: relative;
          z-index: 1;
        }
        
        .login-form .ant-input {
          background: ${isDark ? 'rgba(18, 28, 52, 0.6)' : 'rgba(255, 255, 255, 0.7)'} !important;
          border: 1px solid ${isDark ? 'rgba(93, 161, 255, 0.16)' : 'rgba(0, 114, 255, 0.12)'} !important;
          border-radius: 12px !important;
          backdrop-filter: blur(10px) !important;
          color: ${isDark ? 'rgba(229, 239, 255, 0.95)' : '#0f1c3f'} !important;
          height: 44px !important;
        }
        
        .login-form .ant-input:focus {
          border-color: #0072ff !important;
          box-shadow: 0 0 0 2px rgba(0, 114, 255, 0.2) !important;
        }
        
        .login-form .ant-input::placeholder {
          color: ${isDark ? 'rgba(195, 214, 245, 0.45)' : 'rgba(15, 28, 63, 0.48)'} !important;
        }
        
        .login-form .ant-btn {
          background: linear-gradient(135deg, #00c6ff 0%, #0072ff 100%) !important;
          border: none !important;
          border-radius: 12px !important;
          height: 44px !important;
          font-weight: 600 !important;
          box-shadow: 0 8px 24px rgba(0, 114, 255, 0.3) !important;
          transition: all 0.3s ease !important;
        }
        
        .login-form .ant-btn:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 12px 32px rgba(0, 114, 255, 0.4) !important;
        }
        
        .login-form .ant-btn:active {
          transform: translateY(0) !important;
        }
      `}</style>
      <motion.div
        initial={{ scale: 0.8, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <Card
          className="glass-card login-card"
          style={{
            width: '100%',
            maxWidth: 400,
            background: isDark 
              ? 'rgba(18, 28, 52, 0.78)' 
              : 'rgba(255, 255, 255, 0.82)',
            border: isDark 
              ? '1px solid rgba(93, 161, 255, 0.28)' 
              : '1px solid rgba(0, 114, 255, 0.22)',
            borderRadius: '22px',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
            boxShadow: isDark 
              ? '0 36px 76px rgba(0, 0, 0, 0.55)' 
              : '0 32px 68px rgba(0, 114, 255, 0.18)',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {/* 卡片内部装饰 */}
          <div className="glass-orb" style={{ top: -90, right: -60 }} />
          <div className="glass-orb-soft" style={{ bottom: -120, left: -80 }} />
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
          className="login-form"
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
