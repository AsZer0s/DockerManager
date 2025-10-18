import React, { useState, useEffect } from 'react'
import { Layout, Menu, Avatar, Dropdown, Button, theme } from 'antd'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  DashboardOutlined,
  DatabaseOutlined,
  ContainerOutlined,
  MonitorOutlined,
  ConsoleSqlOutlined,
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SafetyOutlined,
  SunOutlined,
  MoonOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'

import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'

const { Header, Sider, Content } = Layout

const contentVariants = {
  initial: { opacity: 0, y: 24, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -20, scale: 0.98 }
}

const headerTransition = { duration: 0.45, ease: 'easeOut' }
const primaryGradient = 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)'

interface AppLayoutProps {
  children: React.ReactNode
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { isDark, toggleTheme } = useThemeStore()
  const { token } = theme.useToken()

  const siderBackground = isDark ? 'rgba(12, 21, 40, 0.88)' : 'rgba(255, 255, 255, 0.55)'
  const headerBackground = isDark ? 'rgba(13, 23, 46, 0.9)' : 'rgba(255, 255, 255, 0.62)'
  const contentBackground = isDark ? 'rgba(15, 27, 52, 0.9)' : 'rgba(255, 255, 255, 0.72)'
  const contentBorder = isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(255, 255, 255, 0.45)'
  const softBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.28)'
  const subtleText = isDark ? 'rgba(189, 203, 228, 0.82)' : 'rgba(59, 76, 117, 0.75)'

  // 检测屏幕尺寸变化
  useEffect(() => {
    const checkIsMobile = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      // 在移动端默认收起侧边栏
      if (mobile) {
        setCollapsed(true)
      }
    }
    
    checkIsMobile()
    window.addEventListener('resize', checkIsMobile)
    
    return () => window.removeEventListener('resize', checkIsMobile)
  }, [])

  // 在移动端点击菜单项后自动收起侧边栏
  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key)
    if (isMobile) {
      setCollapsed(true)
    }
  }

  // 菜单项配置
  const menuItems: MenuProps['items'] = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '仪表盘',
    },
    {
      key: '/servers',
      icon: <DatabaseOutlined />,
      label: '服务器管理',
    },
    {
      key: '/containers',
      icon: <ContainerOutlined />,
      label: '容器管理',
    },
    {
      key: '/monitoring',
      icon: <MonitorOutlined />,
      label: '监控中心',
    },
    {
      key: '/ssh',
      icon: <ConsoleSqlOutlined />,
      label: 'SSH 控制台',
    },
  ]

  // 添加设置菜单
  menuItems.push({
    key: '/settings',
    icon: <SettingOutlined />,
    label: '系统设置',
  })

  // 添加用户管理菜单（仅管理员可见）
  if (user?.role === 'admin') {
    menuItems.push({
      key: '/user-management',
      icon: <UserOutlined />,
      label: '用户管理',
    })
  }

  // 添加管理员设置菜单
  menuItems.push({
    key: '/admin',
    icon: <SafetyOutlined />,
    label: '管理员设置',
  })

  // 用户下拉菜单
  const userMenuItems: MenuProps['items'] = [
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '账户设置',
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
    },
  ]


  // 处理用户菜单点击
  const handleUserMenuClick = ({ key }: { key: string }) => {
    switch (key) {
      case 'profile':
        navigate('/settings?tab=profile')
        break
      case 'settings':
        navigate('/settings?tab=account')
        break
      case 'logout':
        logout()
        navigate('/login')
        break
    }
  }

  return (
    <Layout
      className="glass-app-layout"
      style={{
        minHeight: '100vh',
        position: 'relative',
        background: 'transparent',
        overflow: 'hidden'
      }}
    >
      <div className="glass-background">
        <div className="gradient-ring blue" />
        <div className="gradient-ring deep" />
        <div className="gradient-ring soft" />
      </div>

      <AnimatePresence>
        {isMobile && !collapsed && (
          <motion.div
            key="mobile-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(4, 14, 26, 0.55)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              zIndex: 2
            }}
            onClick={() => setCollapsed(true)}
          />
        )}
      </AnimatePresence>

      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        breakpoint="lg"
        collapsedWidth={isMobile ? 0 : 96}
        width={isMobile ? 280 : 260}
        style={{
          background: siderBackground,
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          borderRight: `1px solid ${softBorder}`,
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 3,
          transform: isMobile && collapsed ? 'translateX(-100%)' : 'translateX(0)',
          transition: 'transform 0.3s ease, width 0.3s ease',
          height: '100vh',
          overflow: 'hidden',
          boxShadow: isDark
            ? '0 26px 55px rgba(0, 0, 0, 0.55)'
            : '0 26px 55px rgba(0, 114, 255, 0.16)'
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{
            height: 72,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '0 0' : '0 24px',
            marginBottom: 12
          }}
        >
          <span
            style={{
              background: primaryGradient,
              WebkitBackgroundClip: 'text',
              color: 'transparent',
              fontWeight: 700,
              fontSize: collapsed ? 20 : 22,
              letterSpacing: 0.6,
              fontFamily: `'SF Pro Display', 'Inter', sans-serif`
            }}
          >
            {collapsed ? 'DM' : 'Docker Manager'}
          </span>
        </motion.div>
        <Menu
          className="glass-menu"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{
            border: 'none',
            background: 'transparent',
            padding: collapsed ? '0 12px' : '12px 20px'
          }}
        />
      </Sider>

      <Layout
        style={{
          marginLeft: isMobile ? 0 : (collapsed ? 96 : 260),
          transition: 'margin-left 0.3s ease',
          minHeight: '100vh',
          background: 'transparent',
          position: 'relative',
          zIndex: 1
        }}
      >
        <Header
          style={{
            padding: isMobile ? '0 18px' : '0 32px',
            background: headerBackground,
            backdropFilter: 'blur(26px)',
            WebkitBackdropFilter: 'blur(26px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${softBorder}`,
            boxShadow: isDark
              ? '0 24px 48px rgba(0, 0, 0, 0.4)'
              : '0 24px 48px rgba(0, 114, 255, 0.16)',
            position: 'fixed',
            top: 0,
            right: 0,
            left: isMobile ? 0 : (collapsed ? 96 : 260),
            transition: 'left 0.3s ease, background 0.3s ease',
            zIndex: 3
          }}
        >
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={headerTransition}
          >
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                background: isDark ? 'rgba(20, 32, 58, 0.85)' : 'rgba(255, 255, 255, 0.85)',
                color: isDark ? '#e6efff' : '#0f172a',
                border: '1px solid transparent',
                boxShadow: isDark
                  ? '0 16px 32px rgba(0, 0, 0, 0.45)'
                  : '0 16px 32px rgba(0, 114, 255, 0.18)'
              }}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={headerTransition}
            style={{ display: 'flex', alignItems: 'center', gap: 18 }}
          >
            <Button
              type="text"
              icon={isDark ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggleTheme}
              title={isDark ? '切换到浅色模式' : '切换到深色模式'}
              style={{
                width: 44,
                height: 44,
                borderRadius: 16,
                background: isDark ? 'rgba(20, 32, 58, 0.82)' : 'rgba(255, 255, 255, 0.9)',
                color: isDark ? '#f5f9ff' : '#0b2340',
                border: `1px solid ${softBorder}`,
                boxShadow: isDark
                  ? '0 12px 28px rgba(0, 0, 0, 0.45)'
                  : '0 12px 28px rgba(0, 114, 255, 0.12)'
              }}
            />
            <span
              style={{
                color: subtleText,
                fontWeight: 500,
                fontSize: 15,
                letterSpacing: 0.4
              }}
            >
              欢迎，{user?.username}
            </span>
            <Dropdown
              menu={{
                items: userMenuItems,
                onClick: handleUserMenuClick,
              }}
              placement="bottomRight"
            >
              <Avatar
                style={{
                  background: primaryGradient,
                  cursor: 'pointer',
                  boxShadow: '0 18px 36px rgba(0, 114, 255, 0.28)'
                }}
                icon={<UserOutlined />}
              />
            </Dropdown>
          </motion.div>
        </Header>

        <Content
          style={{
            margin: isMobile ? '88px 12px 20px' : '102px 24px 32px',
            padding: isMobile ? 20 : 28,
            minHeight: 280,
            background: contentBackground,
            borderRadius: token.borderRadiusLG ?? 22,
            border: `1px solid ${contentBorder}`,
            backdropFilter: 'blur(36px)',
            WebkitBackdropFilter: 'blur(36px)',
            boxShadow: isDark
              ? '0 40px 70px rgba(0, 0, 0, 0.55)'
              : '0 40px 70px rgba(0, 114, 255, 0.18)',
            overflow: 'hidden',
            position: 'relative'
          }}
        >
          <div className="glass-orb" style={{ top: -90, right: -60 }} />
          <div className="glass-orb-soft" style={{ bottom: -120, left: -80 }} />

          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              variants={contentVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={headerTransition}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </Content>
      </Layout>
    </Layout>
  )
}

export default AppLayout
