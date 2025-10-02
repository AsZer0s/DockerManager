import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Card, Select, Button, Space, message, Typography } from 'antd'
import { motion } from 'framer-motion'
import { ConsoleSqlOutlined, ReloadOutlined, DisconnectOutlined, HistoryOutlined } from '@ant-design/icons'
import { Server } from '@/services/api'
import sshSessionAPI from '@/services/sshSessionAPI'
import { useGlobalServers } from '@/hooks/useGlobalServers'
import './SSHConsole.css'

const { Option } = Select

interface CommandHistory {
  command: string
  timestamp: number
}

const SSHConsole: React.FC = () => {
  const [selectedServer, setSelectedServer] = useState<number | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [terminalOutput, setTerminalOutput] = useState<string[]>([])
  const [currentCommand, setCurrentCommand] = useState('')
  const [commandHistory, setCommandHistory] = useState<CommandHistory[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  
  const terminalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 获取服务器列表
  const { data: serversData } = useGlobalServers()

  const servers = serversData?.data.servers || []
  const onlineServers = servers.filter((server: Server) => server.is_active && server.status === '在线')

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [])

  // 清理终端控制序列
  const cleanTerminalOutput = useCallback((text: string) => {
    if (!text) return '';
    
    return text
      // 移除 bracketed paste mode 序列
      .replace(/\x1b\[\?2004[hl]/g, '')
      // 移除其他常见的 ANSI 转义序列，但保留一些基本的颜色和格式
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      // 移除回车符和换行符的重复
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // 移除多余的空行，但保留必要的换行
      .replace(/\n{3,}/g, '\n\n')
      // 移除行尾的空白字符，但保留行首的缩进
      .split('\n').map(line => line.replace(/\s+$/, '')).join('\n')
      .trim();
  }, [])

  // 添加输出到终端
  const addToTerminal = useCallback((text: string, type: 'output' | 'error' | 'command' = 'output') => {
    const prefix = type === 'command' ? '$ ' : type === 'error' ? '! ' : ''
    const cleanedText = cleanTerminalOutput(text)
    setTerminalOutput(prev => [...prev, `${prefix}${cleanedText}`])
    setTimeout(scrollToBottom, 10)
  }, [scrollToBottom, cleanTerminalOutput])

  // 连接SSH
  const connectSSH = async () => {
    if (!selectedServer) {
      message.warning('请选择服务器')
      return
    }

    setIsLoading(true)
    try {
      addToTerminal(`正在连接到服务器 ${onlineServers.find((s: Server) => s.id === selectedServer)?.name}...`)
      
      // 创建SSH会话
      const result = await sshSessionAPI.createSession(selectedServer)
      
      setIsConnected(true)
      setSessionId(result.sessionId)
      addToTerminal('SSH连接已建立')
      addToTerminal('欢迎使用DockerManager SSH控制台')
      
      setIsLoading(false)
      message.success('SSH连接成功')
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || '连接失败'
      addToTerminal(`连接失败: ${errorMessage}`, 'error')
      setIsLoading(false)
      message.error(errorMessage)
    }
  }

  // 断开SSH连接
  const disconnectSSH = async () => {
    if (sessionId) {
      try {
        await sshSessionAPI.closeSession(sessionId)
      } catch (error) {
        // 关闭SSH会话失败，静默处理
      }
    }
    
    setIsConnected(false)
    setSessionId(null)
    setTerminalOutput([])
    setCurrentCommand('')
    setCommandHistory([])
    setHistoryIndex(-1)
    addToTerminal('SSH连接已断开')
  }

  // 执行命令
  const executeCommand = async (command: string) => {
    if (!command.trim() || !sessionId) return

    const trimmedCommand = command.trim()

    // 添加到历史记录
    const newHistory: CommandHistory = {
      command: trimmedCommand,
      timestamp: Date.now()
    }
    setCommandHistory(prev => [newHistory, ...prev.slice(0, 99)]) // 保留最近100条
    setHistoryIndex(-1)

    // 不手动显示命令，让SSH服务器返回的完整输出自然显示

    // 处理特殊命令
    if (trimmedCommand === 'clear') {
      setTerminalOutput([])
      return
    } else if (trimmedCommand === 'exit') {
      disconnectSSH()
      return
    }

    // 执行真实的SSH命令
    try {
      const result = await sshSessionAPI.executeCommand(sessionId, trimmedCommand)
      
      if (result.output) {
        addToTerminal(result.output)
      }
      
      if (result.error) {
        addToTerminal(result.error, 'error')
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || '命令执行失败'
      addToTerminal(errorMessage, 'error')
    }
  }

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      executeCommand(currentCommand)
      setCurrentCommand('')
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? 0 : Math.min(historyIndex + 1, commandHistory.length - 1)
        setHistoryIndex(newIndex)
        setCurrentCommand(commandHistory[newIndex].command)
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setCurrentCommand(commandHistory[newIndex].command)
      } else if (historyIndex === 0) {
        setHistoryIndex(-1)
        setCurrentCommand('')
      }
    } else if (e.key === 'Tab') {
      e.preventDefault()
      // Tab补全功能
      handleTabCompletion()
    }
  }

  // Tab补全功能
  const handleTabCompletion = () => {
    const command = currentCommand.trim()
    if (!command) return

    // 扩展的bash命令补全
    const commands = [
      // 基本命令
      'ls', 'pwd', 'whoami', 'date', 'uptime', 'free', 'df', 'ps', 'clear', 'exit',
      // 目录操作
      'cd', 'mkdir', 'rmdir', 'rm', 'cp', 'mv', 'ln',
      // 文件操作
      'cat', 'less', 'more', 'head', 'tail', 'grep', 'find', 'locate',
      // 权限和用户
      'chmod', 'chown', 'chgrp', 'su', 'sudo', 'passwd', 'useradd', 'userdel',
      // 系统信息
      'uname', 'hostname', 'id', 'w', 'who', 'last', 'history',
      // 网络
      'ping', 'netstat', 'ss', 'curl', 'wget', 'ssh', 'scp', 'rsync',
      // 进程管理
      'kill', 'killall', 'top', 'htop', 'nohup', 'bg', 'fg', 'jobs',
      // 压缩和解压
      'tar', 'gzip', 'gunzip', 'zip', 'unzip',
      // 编辑器
      'vi', 'vim', 'nano', 'emacs',
      // 其他常用命令
      'which', 'whereis', 'man', 'info', 'help', 'alias', 'export', 'env'
    ]
    
    const matches = commands.filter(cmd => cmd.startsWith(command))
    
    if (matches.length === 1) {
      setCurrentCommand(matches[0] + ' ')
    } else if (matches.length > 1) {
      // 显示可能的补全选项
      addToTerminal(`可能的补全: ${matches.join(' ')}`)
    }
  }

  // 清屏
  const clearTerminal = () => {
    setTerminalOutput([])
  }

  // 显示历史记录
  const showHistory = () => {
    if (commandHistory.length === 0) {
      addToTerminal('没有命令历史记录')
      return
    }
    
    const historyText = commandHistory
      .slice(0, 20) // 显示最近20条
      .map((item, index) => `${index + 1}  ${item.command}`)
      .join('\n')
    
    addToTerminal(`命令历史记录:\n${historyText}`)
  }

  // 聚焦到输入框
  useEffect(() => {
    if (isConnected && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isConnected])

  return (
    <div className="ssh-console">
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
        style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <Typography.Title level={1} className="page-title">
          SSH 控制台
        </Typography.Title>
        <Space>
          <Select
            placeholder="选择服务器"
            style={{ width: 200 }}
            value={selectedServer}
            onChange={setSelectedServer}
            disabled={isConnected}
          >
            {onlineServers.map((server: Server) => (
              <Option key={server.id} value={server.id}>
                {server.name} ({server.host})
              </Option>
            ))}
          </Select>
          
          {!isConnected ? (
            <Button 
              type="primary" 
              icon={<ConsoleSqlOutlined />}
              onClick={connectSSH}
              loading={isLoading}
              disabled={!selectedServer}
            >
              连接
            </Button>
          ) : (
            <Space>
              <Button 
                icon={<HistoryOutlined />}
                onClick={showHistory}
                title="显示命令历史"
              />
              <Button 
                icon={<ReloadOutlined />}
                onClick={clearTerminal}
                title="清屏"
              />
              <Button 
                danger
                icon={<DisconnectOutlined />}
                onClick={disconnectSSH}
              >
                断开连接
              </Button>
            </Space>
          )}
        </Space>
      </motion.div>
      
      <Card>
        <div className="terminal-container">
          <div 
            ref={terminalRef}
            className="terminal-output"
          >
            {terminalOutput.map((line, index) => (
              <div key={index} className="terminal-line">
                {line}
              </div>
            ))}
          </div>
          
          {isConnected && (
            <div className="terminal-input">
              <input
                ref={inputRef}
                type="text"
                value={currentCommand}
                onChange={(e) => setCurrentCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                className="command-input"
                placeholder=""
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

export default SSHConsole
