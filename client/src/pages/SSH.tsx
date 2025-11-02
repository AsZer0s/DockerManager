import React, { useState } from 'react'
import { Card, Select, Button, Space, Typography, Input, notification } from 'antd'
import { motion } from 'framer-motion'
import { ConsoleSqlOutlined, SendOutlined, DisconnectOutlined } from '@ant-design/icons'
import { useQuery } from 'react-query'

import { serverAPI, sshAPI } from '@/services/api'

const { Option } = Select
const { TextArea } = Input

const SSH: React.FC = () => {
  const [selectedServer, setSelectedServer] = useState<number | null>(null)
  const [command, setCommand] = useState('')
  const [output, setOutput] = useState('')
  const [isConnected, setIsConnected] = useState(false)

  // 获取服务器列表
  const { data: serversData } = useQuery({
    queryKey: ['servers'],
    queryFn: () => serverAPI.getServers(),
  })

  const servers = serversData?.data.servers || []

  // 处理连接
  const handleConnect = async () => {
    if (!selectedServer) {
      notification.error({
        message: '错误',
        description: '请选择服务器',
        placement: 'topRight',
      })
      return
    }

    try {
      await sshAPI.testConnection(selectedServer)
      setIsConnected(true)
      setOutput('SSH 连接已建立\n')
      notification.success({
        message: '连接成功',
        description: 'SSH 连接已建立',
        placement: 'topRight',
      })
    } catch (error: any) {
      notification.error({
        message: '连接失败',
        description: error.response?.data?.message || '无法连接到服务器',
        placement: 'topRight',
      })
    }
  }

  // 处理断开连接
  const handleDisconnect = () => {
    setIsConnected(false)
    setOutput('')
    notification.info({
      message: '连接断开',
      description: 'SSH 连接已断开',
      placement: 'topRight',
    })
  }

  // 处理命令执行
  const handleExecuteCommand = async () => {
    if (!selectedServer || !command.trim()) {
      notification.error({
        message: '错误',
        description: '请输入命令',
        placement: 'topRight',
      })
      return
    }

    try {
      const response = await sshAPI.executeCommand(selectedServer, command)
      setOutput(prev => prev + `$ ${command}\n${response.data.result.output}\n\n`)
      setCommand('')
    } catch (error: any) {
      setOutput(prev => prev + `$ ${command}\n错误: ${error.response?.data?.message || '命令执行失败'}\n\n`)
    }
  }

  // 处理回车键
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleExecuteCommand()
    }
  }

  return (
    <div>
      <style>{`
        /* Apple-style SSH 控制台 */
        .ssh-container {
          background: #f8fafc;
          min-height: 100vh;
          padding: 24px;
        }
        
        .ssh-header {
          background: white;
          border-radius: 20px;
          padding: 32px;
          margin-bottom: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .ssh-title {
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
        
        .ssh-controls {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-top: 16px;
        }
        
        .server-select {
          border-radius: 12px !important;
          border: 2px solid #e5e7eb !important;
          padding: 8px 12px !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        
        .server-select:hover {
          border-color: #007AFF !important;
        }
        
        .server-select:focus {
          border-color: #007AFF !important;
          box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1) !important;
        }
        
        .ssh-button {
          border-radius: 12px !important;
          font-weight: 600 !important;
          height: 44px !important;
          padding: 0 24px !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          border: none !important;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
        }
        
        .ssh-button:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15) !important;
        }
        
        .ssh-button-primary {
          background: linear-gradient(135deg, #007AFF 0%, #5856D6 100%) !important;
          box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3) !important;
        }
        
        .ssh-button-danger {
          background: linear-gradient(135deg, #FF3B30 0%, #FF2D92 100%) !important;
          box-shadow: 0 4px 12px rgba(255, 59, 48, 0.3) !important;
        }
        
        .ssh-terminal {
          background: white;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          border: 1px solid #e5e7eb;
        }
        
        .terminal-output {
          background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%) !important;
          color: #e5e5e5 !important;
          padding: 24px !important;
          border-radius: 0 !important;
          margin: 0 !important;
          overflow: auto !important;
          font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace !important;
          font-size: 14px !important;
          line-height: 1.6 !important;
          min-height: 400px !important;
          max-height: 500px !important;
        }
        
        .terminal-output::-webkit-scrollbar {
          width: 8px;
        }
        
        .terminal-output::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
        
        .terminal-output::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 4px;
        }
        
        .terminal-output::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
        
        .terminal-input-area {
          padding: 24px;
          background: #f8fafc;
          border-top: 1px solid #e5e7eb;
        }
        
        .terminal-input {
          border-radius: 12px !important;
          border: 2px solid #e5e7eb !important;
          padding: 12px 16px !important;
          font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace !important;
          font-size: 14px !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          resize: none !important;
        }
        
        .terminal-input:hover {
          border-color: #007AFF !important;
        }
        
        .terminal-input:focus {
          border-color: #007AFF !important;
          box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1) !important;
        }
        
        .empty-state {
          background: white;
          border-radius: 20px;
          padding: 60px 40px;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          border: 1px solid #e5e7eb;
        }
        
        .empty-icon {
          color: #d1d5db !important;
          font-size: 64px !important;
          margin-bottom: 24px !important;
        }
        
        .empty-title {
          color: #6b7280 !important;
          font-size: 1.2rem !important;
          font-weight: 500 !important;
          margin-bottom: 8px !important;
        }
        
        .empty-description {
          color: #9ca3af !important;
          font-size: 1rem !important;
        }
      `}</style>
      
      <div className="ssh-container">
        <motion.div 
          className="ssh-header"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <Typography.Title level={1} className="ssh-title">
            SSH 控制台
          </Typography.Title>
          <Typography.Text style={{ fontSize: '1.1rem', color: '#6b7280' }}>
            安全连接到远程服务器并执行命令
          </Typography.Text>
          
          <div className="ssh-controls">
            <Select
              placeholder="选择服务器"
              value={selectedServer}
              onChange={setSelectedServer}
              style={{ width: 240 }}
              disabled={isConnected}
              className="server-select"
              size="large"
            >
              {servers.map(server => (
                <Option key={server.id} value={server.id}>
                  {server.name}
                </Option>
              ))}
            </Select>
            {!isConnected ? (
              <Button
                type="primary"
                className="ssh-button ssh-button-primary"
                icon={<ConsoleSqlOutlined />}
                onClick={handleConnect}
                disabled={!selectedServer}
                size="large"
              >
                连接
              </Button>
            ) : (
              <Button
                danger
                className="ssh-button ssh-button-danger"
                icon={<DisconnectOutlined />}
                onClick={handleDisconnect}
                size="large"
              >
                断开连接
              </Button>
            )}
          </div>
        </motion.div>

        {selectedServer ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div className="ssh-terminal">
              {/* 终端输出区域 */}
              <div className="terminal-output">
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {output || (isConnected ? 'SSH 终端已就绪，请输入命令...\n' : '请先连接到服务器')}
                </pre>
              </div>

              {/* 命令输入区域 */}
              <div className="terminal-input-area">
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                  <TextArea
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={isConnected ? "输入命令并按回车执行..." : "请先连接到服务器"}
                    disabled={!isConnected}
                    autoSize={{ minRows: 1, maxRows: 3 }}
                    style={{ flex: 1 }}
                    className="terminal-input"
                  />
                  <Button
                    type="primary"
                    className="ssh-button ssh-button-primary"
                    icon={<SendOutlined />}
                    onClick={handleExecuteCommand}
                    disabled={!isConnected || !command.trim()}
                    size="large"
                  >
                    执行
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            className="empty-state"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <ConsoleSqlOutlined className="empty-icon" />
            <Typography.Title level={3} className="empty-title">请选择一个服务器</Typography.Title>
            <Typography.Text className="empty-description">选择服务器后即可建立 SSH 连接</Typography.Text>
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default SSH
