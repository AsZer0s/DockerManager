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
        /* Apple-style 设置页面 */
        .settings-container {
          background: #f8fafc;
          min-height: 100vh;
          padding: 24px;
        }
        
        .settings-header {
          background: white;
          border-radius: 20px;
          padding: 32px;
          margin-bottom: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .page-title {
          font-size: 2.5rem !important;
          font-weight: 700 !important;
          margin-bottom: 8px !important;
          background: linear-gradient(135deg, #007AFF 0%, #5856D6 100%) !important;
          -webkit-background-clip: text !important;
          -webkit-text-fill-color: transparent !important;
          background-clip: text !important;
          color: transparent !important;
          letter-spacing: -0.02em !important;
        }
        
        .page-description {
          color: #6b7280 !important;
          font-size: 1.1rem !important;
          font-weight: 400 !important;
        }
        
        .settings-card {
          background: white;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          border: none !important;
        }
        
        .settings-tabs .ant-tabs-nav {
          background: #f8fafc;
          margin: 0 !important;
          padding: 24px 24px 0 24px;
        }
        
        .settings-tabs .ant-tabs-tab {
          background: transparent !important;
          border: none !important;
          border-radius: 12px !important;
          margin: 0 0 12px 0 !important;
          padding: 16px 20px !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          font-weight: 500 !important;
          color: #6b7280 !important;
        }
        
        .settings-tabs .ant-tabs-tab:hover {
          background: #e5e7eb !important;
          color: #374151 !important;
          transform: translateX(4px) !important;
        }
        
        .settings-tabs .ant-tabs-tab-active {
          background: linear-gradient(135deg, #007AFF 0%, #5856D6 100%) !important;
          color: white !important;
          box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3) !important;
        }
        
        .settings-tabs .ant-tabs-tab-active .anticon {
          color: white !important;
        }
        
        .settings-tabs .ant-tabs-content-holder {
          padding: 32px;
          background: white;
        }
        
        .settings-tabs .ant-tabs-tabpane {
          animation: fadeInUp 0.5s ease-out;
        }
        
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .anticon {
          font-size: 18px !important;
          margin-right: 12px !important;
        }
      `}</style>
      
      <div className="settings-container">
        <motion.div 
          className="settings-header"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <Typography.Title level={1} className="page-title">
            系统设置
          </Typography.Title>
          <Typography.Text className="page-description">
            管理您的账户偏好、系统配置和通知设置
          </Typography.Text>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <Card className="settings-card">
            <Tabs
              activeKey={activeTab}
              onChange={handleTabChange}
              items={tabItems}
              size="large"
              tabPosition="left"
              className="settings-tabs"
              style={{ minHeight: 600 }}
            />
          </Card>
        </motion.div>
      </div>
    </div>
  )
}

export default Settings
