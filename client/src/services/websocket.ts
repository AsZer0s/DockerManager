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
      timeout: 10000,
      forceNew: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
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
      // Socket.IO 会自动重连，不需要手动处理
    })

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket 连接错误:', error)
      // Socket.IO 会自动重连，不需要手动处理
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
}

export const websocketService = new WebSocketService()
export default websocketService
