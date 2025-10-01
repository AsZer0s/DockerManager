import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Card, Select, Button, Space, message } from 'antd'
import { ConsoleSqlOutlined, ReloadOutlined, DisconnectOutlined, HistoryOutlined } from '@ant-design/icons'
import { sshAPI, Server } from '@/services/api'
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
  const [currentPath, setCurrentPath] = useState('/root')
  
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

  // 获取提示符
  const getPrompt = useCallback(() => {
    const serverName = onlineServers.find((s: Server) => s.id === selectedServer)?.name || 'server'
    return `[${serverName}] ${currentPath} $ `
  }, [selectedServer, currentPath, onlineServers])

  // 更新当前路径
  const updateCurrentPath = async () => {
    if (!sessionId) return
    
    try {
      const result = await sshSessionAPI.executeCommand(sessionId, 'pwd')
      const newPath = result.output?.trim() || '/root'
      setCurrentPath(newPath)
    } catch (error) {
      // 如果获取路径失败，保持当前路径
      console.warn('获取当前路径失败:', error)
    }
  }

  // 添加输出到终端
  const addToTerminal = useCallback((text: string, type: 'output' | 'error' | 'command' = 'output') => {
    const prefix = type === 'command' ? '$ ' : type === 'error' ? '! ' : ''
    setTerminalOutput(prev => [...prev, `${prefix}${text}`])
    setTimeout(scrollToBottom, 10)
  }, [scrollToBottom])

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
      
      // 初始化当前路径
      await updateCurrentPath()
      
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
        console.error('关闭SSH会话失败:', error)
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

    // 显示命令（带路径前缀）
    addToTerminal(`${getPrompt()}${trimmedCommand}`, 'command')

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

      // 更新当前路径（如果是cd命令）
      if (trimmedCommand.startsWith('cd ')) {
        await updateCurrentPath()
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
      <Card 
        title={
        <Space>
          <ConsoleSqlOutlined />
          SSH 控制台
        </Space>
        }
        extra={
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
        }
      >
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
              <span className="prompt">{getPrompt()}</span>
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
