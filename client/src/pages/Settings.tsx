import React, { useState, useEffect } from 'react'
import { Typography, Tabs, Card } from 'antd'
import { motion } from 'framer-motion'
import { 
  SettingOutlined, 
  SafetyOutlined, 
  BellOutlined,
  DatabaseOutlined
} from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'

// 导入子页面组件
import AccountSettings from '../components/Settings/AccountSettings'
import SystemSettings from '../components/Settings/SystemSettings'
import NotificationSettings from '../components/Settings/NotificationSettings'
import DatabaseSettings from '../components/Settings/DatabaseSettings'

const Settings: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('account')

  // 从URL参数获取当前激活的标签页
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab) {
      setActiveTab(tab)
    }
  }, [searchParams])

  // 处理标签页切换
  const handleTabChange = (key: string) => {
    setActiveTab(key)
    setSearchParams({ tab: key })
  }

  // 标签页配置
  const tabItems = [
    {
      key: 'account',
      label: (
        <span>
          <SafetyOutlined />
          账户设置
        </span>
      ),
      children: <AccountSettings />
    },
    {
      key: 'system',
      label: (
        <span>
          <SettingOutlined />
          系统设置
        </span>
      ),
      children: <SystemSettings />
    },
    {
      key: 'notifications',
      label: (
        <span>
          <BellOutlined />
          通知设置
        </span>
      ),
      children: <NotificationSettings />
    },
    {
      key: 'database',
      label: (
        <span>
          <DatabaseOutlined />
          数据库设置
        </span>
      ),
      children: <DatabaseSettings />
    }
  ]

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
          系统设置
        </Typography.Title>
      </motion.div>

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={tabItems}
          size="large"
          tabPosition="left"
          style={{ minHeight: 600 }}
        />
      </Card>
    </div>
  )
}

export default Settings
