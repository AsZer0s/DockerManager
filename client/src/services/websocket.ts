import { io, Socket } from 'socket.io-client'
import toast from 'react-hot-toast'

class WebSocketService {
  private socket: Socket | null = null

  connect(token: string) {
    if (this.socket?.connected) {
      return this.socket
    }

    // 如果已有socket实例，先断开
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }

    this.socket = io('/', {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
      timeout: 30000, // 增加连接超时时间
      forceNew: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10, // 增加重连次数
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      // 连接优化
      upgrade: true,
      rememberUpgrade: true,
      // 缓冲配置
      forceBase64: false,
      // 网络优化
      withCredentials: false
    })

    this.setupEventHandlers()
    return this.socket
  }

  private setupEventHandlers() {
    if (!this.socket) return

    this.socket.on('connect', () => {
      console.log('WebSocket 连接成功')
      toast.success('实时连接已建立')
    })

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket 连接断开:', reason)
      
      // 根据断开原因显示不同的提示
      if (reason === 'io server disconnect') {
        toast.error('服务器主动断开连接')
      } else if (reason === 'io client disconnect') {
        console.log('客户端主动断开连接')
      } else {
        toast('连接已断开，正在尝试重连...', { icon: '🔄' })
      }
    })

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket 连接错误:', error)
      
      // 根据错误类型显示不同提示
      if (error.message.includes('timeout')) {
        toast.error('连接超时，请检查网络')
      } else if (error.message.includes('refused')) {
        toast.error('连接被拒绝，服务器可能不可用')
      } else if (error.message.includes('C4')) {
        toast.error('WebSocket协议错误，尝试降级连接...')
      } else if (error.message.includes('websocket error')) {
        toast.error('WebSocket连接失败，正在尝试其他传输方式...')
      } else {
        toast.error('连接失败，正在重试...')
      }
    })

    // 重连事件
    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`WebSocket 重连成功 (尝试 ${attemptNumber} 次)`)
      toast.success('连接已恢复')
    })

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`WebSocket 重连尝试 ${attemptNumber}`)
      if (attemptNumber === 1) {
        toast('连接断开，正在重连...', { icon: '🔄' })
      }
    })

    this.socket.on('reconnect_error', (error) => {
      console.error('WebSocket 重连错误:', error)
    })

    this.socket.on('reconnect_failed', () => {
      console.error('WebSocket 重连失败')
      toast.error('连接失败，请刷新页面重试')
    })

    this.socket.on('auth_success', (data) => {
      console.log('WebSocket 认证成功:', data)
    })

    this.socket.on('auth_error', (error) => {
      console.error('WebSocket 认证失败:', error)
      toast.error('实时连接认证失败')
    })

    this.socket.on('error', (error) => {
      console.error('WebSocket 错误:', error)
      toast.error('实时连接错误')
    })

    // 容器状态更新
    this.socket.on('container_updated', (data) => {
      console.log('容器状态更新:', data)
      // 这里可以触发状态更新或显示通知
      toast.success(`容器 ${data.containerId.substring(0, 12)} ${data.action} 成功`)
    })

    // 监控数据更新
    this.socket.on('monitoring_update', (data) => {
      console.log('监控数据更新:', data)
      // 这里可以更新监控图表
    })

    // SSH 输出
    this.socket.on('ssh_output', (data) => {
      console.log('SSH 输出:', data)
      // 这里可以更新 SSH 终端显示
    })

    this.socket.on('ssh_connected', (data) => {
      console.log('SSH 连接成功:', data)
      toast.success('SSH 连接已建立')
    })

    this.socket.on('ssh_disconnected', (data) => {
      console.log('SSH 连接断开:', data)
      toast('SSH 连接已断开', { icon: 'ℹ️' })
    })
  }


  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }

  // 订阅服务器监控数据
  subscribeMonitoring(serverId: number, type: 'server' | 'container', containerId?: string) {
    if (!this.socket?.connected) return

    this.socket.emit('subscribe_monitoring', {
      serverId,
      type,
      containerId,
    })
  }

  // 取消订阅监控数据
  unsubscribeMonitoring(serverId: number, type: 'server' | 'container', containerId?: string) {
    if (!this.socket?.connected) return

    this.socket.emit('unsubscribe_monitoring', {
      serverId,
      type,
      containerId,
    })
  }

  // 获取服务器列表
  getServers() {
    if (!this.socket?.connected) return

    this.socket.emit('get_servers')
  }

  // 获取容器列表
  getContainers(serverId: number) {
    if (!this.socket?.connected) return

    this.socket.emit('get_containers', { serverId })
  }

  // 容器操作
  containerAction(serverId: number, containerId: string, action: string) {
    if (!this.socket?.connected) return

    this.socket.emit('container_action', {
      serverId,
      containerId,
      action,
    })
  }

  // SSH 连接
  sshConnect(serverId: number) {
    if (!this.socket?.connected) return

    this.socket.emit('ssh_connect', { serverId })
  }

  // SSH 命令
  sshCommand(sessionId: string, command: string) {
    if (!this.socket?.connected) return

    this.socket.emit('ssh_command', { sessionId, command })
  }

  // SSH 断开
  sshDisconnect(sessionId: string) {
    if (!this.socket?.connected) return

    this.socket.emit('ssh_disconnect', { sessionId })
  }

  // 监听事件
  on(event: string, callback: (...args: any[]) => void) {
    if (this.socket) {
      this.socket.on(event, callback)
    }
  }

  // 移除事件监听
  off(event: string, callback?: (...args: any[]) => void) {
    if (this.socket) {
      this.socket.off(event, callback)
    }
  }

  // 获取连接状态
  get connected() {
    return this.socket?.connected || false
  }

  // 获取 socket 实例
  get socketInstance() {
    return this.socket
  }

  // 获取连接状态信息
  getConnectionStatus() {
    if (!this.socket) {
      return {
        connected: false,
        status: 'disconnected',
        transport: null,
        id: null
      }
    }

    return {
      connected: this.socket.connected,
      status: this.socket.connected ? 'connected' : 'disconnected',
      transport: this.socket.io.engine.transport.name,
      id: this.socket.id,
      ping: (this.socket.io.engine as any).ping,
      pong: (this.socket.io.engine as any).pong
    }
  }

  // 手动重连
  reconnect() {
    if (this.socket) {
      this.socket.connect()
    }
  }
}

export const websocketService = new WebSocketService()
export default websocketService
