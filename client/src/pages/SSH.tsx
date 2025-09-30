import React, { useState } from 'react'
import { Card, Select, Button, Space, Typography, Input, message } from 'antd'
import { ConsoleSqlOutlined, SendOutlined, DisconnectOutlined } from '@ant-design/icons'
import { useQuery } from 'react-query'

import { serverAPI, sshAPI } from '@/services/api'

const { Title } = Typography
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
      message.error('请选择服务器')
      return
    }

    try {
      await sshAPI.testConnection(selectedServer)
      setIsConnected(true)
      setOutput('SSH 连接已建立\n')
      message.success('SSH 连接成功')
    } catch (error: any) {
      message.error(error.response?.data?.message || '连接失败')
    }
  }

  // 处理断开连接
  const handleDisconnect = () => {
    setIsConnected(false)
    setOutput('')
    message.info('SSH 连接已断开')
  }

  // 处理命令执行
  const handleExecuteCommand = async () => {
    if (!selectedServer || !command.trim()) {
      message.error('请输入命令')
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
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={2}>SSH 控制台</Title>
        <Space>
          <Select
            placeholder="选择服务器"
            value={selectedServer}
            onChange={setSelectedServer}
            style={{ width: 200 }}
            disabled={isConnected}
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
              icon={<ConsoleSqlOutlined />}
              onClick={handleConnect}
              disabled={!selectedServer}
            >
              连接
            </Button>
          ) : (
            <Button
              danger
              icon={<DisconnectOutlined />}
              onClick={handleDisconnect}
            >
              断开连接
            </Button>
          )}
        </Space>
      </div>

      <Card>
        <div style={{ height: 500, display: 'flex', flexDirection: 'column' }}>
          {/* 终端输出区域 */}
          <div
            style={{
              flex: 1,
              background: '#1e1e1e',
              color: '#d4d4d4',
              padding: 16,
              borderRadius: 6,
              marginBottom: 16,
              overflow: 'auto',
              fontFamily: 'Consolas, Monaco, Courier New, monospace',
              fontSize: 14,
              lineHeight: 1.4,
            }}
          >
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {output || (isConnected ? 'SSH 终端已就绪，请输入命令...\n' : '请先连接到服务器')}
            </pre>
          </div>

          {/* 命令输入区域 */}
          <div style={{ display: 'flex', gap: 8 }}>
            <TextArea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={isConnected ? "输入命令并按回车执行..." : "请先连接到服务器"}
              disabled={!isConnected}
              autoSize={{ minRows: 1, maxRows: 3 }}
              style={{ flex: 1 }}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleExecuteCommand}
              disabled={!isConnected || !command.trim()}
            >
              执行
            </Button>
          </div>
        </div>
      </Card>

      {!selectedServer && (
        <Card style={{ marginTop: 16 }}>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <ConsoleSqlOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
            <Title level={4} type="secondary">请选择一个服务器进行 SSH 连接</Title>
          </div>
        </Card>
      )}
    </div>
  )
}

export default SSH
