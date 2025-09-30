import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout, ConfigProvider } from 'antd'

import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import { lightTheme, darkTheme } from '@/utils/theme'

// 页面组件
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Servers from '@/pages/Servers'
import Containers from '@/pages/Containers'
import Monitoring from '@/pages/Monitoring'
import SSHConsole from '@/pages/SSHConsole'
import Settings from '@/pages/Settings'
import Admin from '@/pages/Admin'
import UserManagement from '@/pages/UserManagement'
import TelegramWebApp from '@/pages/TelegramWebApp'
import TelegramDebug from '@/pages/TelegramDebug'

// 布局组件
import AppLayout from '@/components/Layout/AppLayout'
import ProtectedRoute from '@/components/Auth/ProtectedRoute'

const App: React.FC = () => {
  const { isAuthenticated } = useAuthStore()
  const { isDark, initializeTheme } = useThemeStore()
  
  // 初始化 WebSocket 连接
  useWebSocket()
  
  // 初始化主题
  useEffect(() => {
    initializeTheme()
  }, [initializeTheme])

  return (
    <ConfigProvider theme={isDark ? darkTheme : lightTheme}>
      <Layout style={{ minHeight: '100vh' }}>
        <Routes>
        {/* 公开路由 */}
        <Route 
          path="/login" 
          element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />
          } 
        />
        
        {/* Telegram Web App 路由 - 不需要认证 */}
        <Route path="/telegram-webapp" element={<TelegramWebApp />} />
        <Route path="/telegram-debug" element={<TelegramDebug />} />
        
        {/* 受保护的路由 */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/servers" element={<Servers />} />
                  <Route path="/containers" element={<Containers />} />
                  <Route path="/monitoring" element={<Monitoring />} />
            <Route path="/ssh" element={<SSHConsole />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/user-management" element={<UserManagement />} />
            <Route path="/admin" element={<Admin />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </AppLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Layout>
    </ConfigProvider>
  )
}

export default App
