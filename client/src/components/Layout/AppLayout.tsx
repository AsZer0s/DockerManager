import React, { useState, useEffect } from 'react'
import { Layout, Menu, Avatar, Dropdown, Button, theme } from 'antd'
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
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken()

  // 检测屏幕尺寸变化
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768)
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
    <Layout style={{ minHeight: '100vh' }}>
      {/* 移动端遮罩层 */}
      {isMobile && !collapsed && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 999,
          }}
          onClick={() => setCollapsed(true)}
        />
      )}
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        breakpoint="lg"
        collapsedWidth={isMobile ? 0 : 80}
        width={isMobile ? 280 : 200}
        style={{
          background: colorBgContainer,
          boxShadow: '2px 0 8px rgba(0,0,0,0.1)',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 1000,
          transform: isMobile && collapsed ? 'translateX(-100%)' : 'translateX(0)',
          transition: 'transform 0.2s ease-in-out',
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid #f0f0f0',
            fontSize: collapsed ? 16 : 18,
            fontWeight: 'bold',
            color: '#1890ff',
          }}
        >
          {collapsed ? 'DM' : 'Docker Manager'}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ border: 'none' }}
        />
      </Sider>
      <Layout style={{ 
        marginLeft: isMobile ? 0 : (collapsed ? 80 : 200), 
        transition: 'margin-left 0.2s' 
      }}>
        <Header
          style={{
            padding: isMobile ? '0 16px' : '0 24px',
            background: colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            position: 'fixed',
            top: 0,
            right: 0,
            left: isMobile ? 0 : (collapsed ? 80 : 200),
            zIndex: 999,
            transition: 'left 0.2s',
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
              fontSize: '16px',
              width: 64,
              height: 64,
            }}
          />
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="text"
              icon={isDark ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggleTheme}
              style={{
                fontSize: '16px',
                width: 40,
                height: 40,
              }}
              title={isDark ? '切换到浅色模式' : '切换到深色模式'}
            />
            <span style={{ color: '#666' }}>
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
                  backgroundColor: '#1890ff',
                  cursor: 'pointer',
                }}
                icon={<UserOutlined />}
              />
            </Dropdown>
          </div>
        </Header>
        <Content
          style={{
            margin: isMobile ? '88px 8px 16px 8px' : '88px 16px 24px 16px',
            padding: isMobile ? 16 : 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
            overflow: 'auto',
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}

export default AppLayout
