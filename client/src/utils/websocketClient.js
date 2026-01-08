/**
 * WebSocket 客户端库
 * 提供统一的 WebSocket 通信接口
 */

class WebSocketClient {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.eventListeners = new Map();
    this.subscriptions = new Set();
    
    // 自动重连配置
    this.autoReconnect = true;
    this.reconnectTimer = null;
    
    // 心跳配置
    this.heartbeatInterval = null;
    this.heartbeatTimeout = null;
    this.lastPong = Date.now();
  }

  /**
   * 连接到 WebSocket 服务器
   * @param {string} token - JWT 认证令牌
   * @param {Object} options - 连接选项
   */
  connect(token, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = options.host || window.location.host;
        const url = `${protocol}//${host}/ws?token=${encodeURIComponent(token)}`;
        
        console.log('🔌 连接 WebSocket:', url);
        
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
          console.log('✅ WebSocket 连接成功');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          
          // 重新订阅之前的事件
          if (this.subscriptions.size > 0) {
            this.subscribe(Array.from(this.subscriptions));
          }
          
          this.emit('connected');
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
        
        this.ws.onclose = (event) => {
          console.log('🔌 WebSocket 连接关闭:', event.code, event.reason);
          this.isConnected = false;
          this.stopHeartbeat();
          
          // 清理待处理的请求
          for (const [requestId, { reject }] of this.pendingRequests) {
            reject(new Error('连接已关闭'));
          }
          this.pendingRequests.clear();
          
          this.emit('disconnected', { code: event.code, reason: event.reason });
          
          // 自动重连
          if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect(token, options);
          }
        };
        
        this.ws.onerror = (error) => {
          console.error('❌ WebSocket 错误:', error);
          this.emit('error', error);
          reject(error);
        };
        
      } catch (error) {
        console.error('❌ WebSocket 连接失败:', error);
        reject(error);
      }
    });
  }

  /**
   * 处理接收到的消息
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      
      // 处理心跳响应
      if (message.type === 'pong') {
        this.lastPong = Date.now();
        return;
      }
      
      // 处理请求响应
      if (message.requestId && this.pendingRequests.has(message.requestId)) {
        const { resolve, reject } = this.pendingRequests.get(message.requestId);
        this.pendingRequests.delete(message.requestId);
        
        if (message.type === 'error') {
          reject(new Error(message.error));
        } else {
          resolve(message);
        }
        return;
      }
      
      // 触发事件监听器
      this.emit(message.type, message);
      
    } catch (error) {
      console.error('❌ 解析 WebSocket 消息失败:', error);
    }
  }

  /**
   * 发送消息
   */
  send(message) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('WebSocket 未连接'));
        return;
      }
      
      const requestId = ++this.requestId;
      const messageWithId = { ...message, requestId };
      
      // 存储请求回调
      this.pendingRequests.set(requestId, { resolve, reject });
      
      // 设置超时
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('请求超时'));
        }
      }, 30000); // 30秒超时
      
      try {
        this.ws.send(JSON.stringify(messageWithId));
      } catch (error) {
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  /**
   * SSH 会话管理
   */
  async createSSHSession(serverId) {
    return this.send({
      type: 'ssh_create_session',
      serverId
    });
  }

  async executeCommand(sessionId, command) {
    return this.send({
      type: 'ssh_execute_command',
      sessionId,
      command
    });
  }

  async sendInput(sessionId, data) {
    return this.send({
      type: 'ssh_send_input',
      sessionId,
      data
    });
  }

  async resizeTerminal(sessionId, cols, rows) {
    return this.send({
      type: 'ssh_resize_terminal',
      sessionId,
      cols,
      rows
    });
  }

  async closeSSHSession(sessionId) {
    return this.send({
      type: 'ssh_close_session',
      sessionId
    });
  }

  /**
   * 文件操作
   */
  async listDirectory(serverId, path = '.') {
    return this.send({
      type: 'file_list_directory',
      serverId,
      path
    });
  }

  async createDirectory(serverId, path, mode) {
    return this.send({
      type: 'file_create_directory',
      serverId,
      path,
      mode
    });
  }

  async deleteFile(serverId, path, recursive = false) {
    return this.send({
      type: 'file_delete',
      serverId,
      path,
      recursive
    });
  }

  /**
   * 监控和统计
   */
  async getSSHStats() {
    return this.send({
      type: 'get_ssh_stats'
    });
  }

  async getPerformanceReport() {
    return this.send({
      type: 'get_performance_report'
    });
  }

  async getConnectionPoolStatus() {
    return this.send({
      type: 'get_connection_pool_status'
    });
  }

  /**
   * 订阅事件
   */
  async subscribe(events) {
    const eventArray = Array.isArray(events) ? events : [events];
    eventArray.forEach(event => this.subscriptions.add(event));
    
    return this.send({
      type: 'subscribe',
      events: eventArray
    });
  }

  async unsubscribe(events) {
    const eventArray = Array.isArray(events) ? events : [events];
    eventArray.forEach(event => this.subscriptions.delete(event));
    
    return this.send({
      type: 'unsubscribe',
      events: eventArray
    });
  }

  /**
   * 事件监听
   */
  on(eventType, callback) {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType).add(callback);
  }

  off(eventType, callback) {
    if (this.eventListeners.has(eventType)) {
      this.eventListeners.get(eventType).delete(callback);
    }
  }

  emit(eventType, data) {
    if (this.eventListeners.has(eventType)) {
      for (const callback of this.eventListeners.get(eventType)) {
        try {
          callback(data);
        } catch (error) {
          console.error(`事件监听器错误 (${eventType}):`, error);
        }
      }
    }
  }

  /**
   * 启动心跳检测
   */
  startHeartbeat() {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        // 检查上次 pong 时间
        if (Date.now() - this.lastPong > 60000) { // 60秒无响应
          console.warn('⚠️ WebSocket 心跳超时，重新连接');
          this.ws.close();
          return;
        }
        
        // 发送 ping
        try {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        } catch (error) {
          console.error('❌ 发送心跳失败:', error);
        }
      }
    }, 30000); // 30秒间隔
  }

  /**
   * 停止心跳检测
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  /**
   * 计划重连
   */
  scheduleReconnect(token, options) {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    console.log(`🔄 ${delay}ms 后尝试重连 (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect(token, options).catch(error => {
        console.error('❌ 重连失败:', error);
      });
    }, delay);
  }

  /**
   * 断开连接
   */
  disconnect() {
    this.autoReconnect = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    console.log('🔌 WebSocket 已断开');
  }

  /**
   * 获取连接状态
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      pendingRequests: this.pendingRequests.size,
      subscriptions: Array.from(this.subscriptions),
      lastPong: this.lastPong
    };
  }
}

// 创建全局实例
const wsClient = new WebSocketClient();

// 导出类和实例
export { WebSocketClient };
export default wsClient;