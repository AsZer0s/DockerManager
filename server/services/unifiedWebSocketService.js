import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';
import sshSessionService from './sshSessionService.js';
import sshFileTransferService from './sshFileTransferService.js';
import sshConnectionPool from './sshConnectionPool.js';
import sshPerformanceMonitor from './sshPerformanceMonitor.js';
import database from '../config/database.js';

/**
 * 统一 WebSocket 服务
 * 处理所有 SSH 相关的实时通信
 */
class UnifiedWebSocketService {
  constructor() {
    this.wss = null;
    this.connections = new Map(); // connectionId -> connection info
    this.userConnections = new Map(); // userId -> Set of connectionIds
    this.sessionConnections = new Map(); // sessionId -> Set of connectionIds
    this.isInitialized = false;
    this.heartbeatInterval = null;
  }

  /**
   * 初始化 WebSocket 服务
   * @param {Object} server - HTTP 服务器实例
   */
  initialize(server) {
    if (this.isInitialized) return;

    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      verifyClient: this.verifyClient.bind(this)
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.wss.on('error', (error) => {
      logger.error('WebSocket 服务器错误:', error);
    });

    // 启动心跳检测
    this.startHeartbeat();

    this.isInitialized = true;
    logger.info('统一 WebSocket 服务初始化完成');
  }

  /**
   * 验证客户端连接
   */
  async verifyClient(info) {
    try {
      const url = new URL(info.req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      
      if (!token) {
        logger.warn('WebSocket 连接缺少认证令牌');
        return false;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await database.db.get(
        'SELECT * FROM users WHERE id = ? AND is_active = 1',
        [decoded.userId]
      );

      if (!user) {
        logger.warn('WebSocket 连接用户不存在或已禁用:', decoded.userId);
        return false;
      }

      info.req.user = user;
      return true;
    } catch (error) {
      logger.warn('WebSocket 连接认证失败:', error.message);
      return false;
    }
  }

  /**
   * 处理新的 WebSocket 连接
   */
  handleConnection(ws, req) {
    const user = req.user;
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    logger.info(`WebSocket 连接建立: 用户 ${user.username}, 连接 ${connectionId}`);

    // 存储连接信息
    const connectionInfo = {
      ws,
      connectionId,
      userId: user.id,
      username: user.username,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      subscriptions: new Set(), // 订阅的事件类型
      sshSessions: new Set(), // 关联的 SSH 会话
      isAlive: true
    };

    this.connections.set(connectionId, connectionInfo);

    // 按用户分组连接
    if (!this.userConnections.has(user.id)) {
      this.userConnections.set(user.id, new Set());
    }
    this.userConnections.get(user.id).add(connectionId);

    // 设置消息处理器
    ws.on('message', (data) => {
      this.handleMessage(connectionId, data);
    });

    // 设置 pong 处理器（心跳响应）
    ws.on('pong', () => {
      connectionInfo.isAlive = true;
      connectionInfo.lastActivity = Date.now();
    });

    // 设置连接关闭处理器
    ws.on('close', (code, reason) => {
      logger.info(`WebSocket 连接关闭: ${connectionId}, 代码 ${code}`);
      this.cleanupConnection(connectionId);
    });

    // 设置错误处理器
    ws.on('error', (error) => {
      logger.error(`WebSocket 连接错误: ${connectionId}`, error);
      this.cleanupConnection(connectionId);
    });

    // 发送连接确认
    this.sendToConnection(connectionId, {
      type: 'connected',
      connectionId,
      message: 'WebSocket 连接已建立',
      serverTime: Date.now()
    });
  }

  /**
   * 处理 WebSocket 消息
   */
  async handleMessage(connectionId, data) {
    try {
      const connection = this.connections.get(connectionId);
      if (!connection) return;

      connection.lastActivity = Date.now();
      const message = JSON.parse(data.toString());
      
      logger.debug(`WebSocket 消息: ${connectionId} -> ${message.type}`);

      switch (message.type) {
        // SSH 会话管理
        case 'ssh_create_session':
          await this.handleCreateSSHSession(connectionId, message);
          break;
          
        case 'ssh_execute_command':
          await this.handleExecuteCommand(connectionId, message);
          break;
          
        case 'ssh_send_input':
          await this.handleSendInput(connectionId, message);
          break;
          
        case 'ssh_resize_terminal':
          await this.handleResizeTerminal(connectionId, message);
          break;
          
        case 'ssh_close_session':
          await this.handleCloseSSHSession(connectionId, message);
          break;

        // 文件传输
        case 'file_list_directory':
          await this.handleListDirectory(connectionId, message);
          break;
          
        case 'file_create_directory':
          await this.handleCreateDirectory(connectionId, message);
          break;
          
        case 'file_delete':
          await this.handleDeleteFile(connectionId, message);
          break;

        // 监控和统计
        case 'get_ssh_stats':
          await this.handleGetSSHStats(connectionId, message);
          break;
          
        case 'get_performance_report':
          await this.handleGetPerformanceReport(connectionId, message);
          break;
          
        case 'get_connection_pool_status':
          await this.handleGetConnectionPoolStatus(connectionId, message);
          break;

        // 订阅管理
        case 'subscribe':
          await this.handleSubscribe(connectionId, message);
          break;
          
        case 'unsubscribe':
          await this.handleUnsubscribe(connectionId, message);
          break;

        // 心跳
        case 'ping':
          this.sendToConnection(connectionId, { 
            type: 'pong', 
            timestamp: Date.now() 
          });
          break;
          
        default:
          logger.warn(`未知的 WebSocket 消息类型: ${message.type}`);
          this.sendError(connectionId, `未知的消息类型: ${message.type}`, message.requestId);
      }
    } catch (error) {
      logger.error(`处理 WebSocket 消息失败: ${connectionId}`, error);
      this.sendError(connectionId, error.message, message?.requestId);
    }
  }

  /**
   * 创建 SSH 会话
   */
  async handleCreateSSHSession(connectionId, message) {
    try {
      const { serverId, requestId } = message;
      const connection = this.connections.get(connectionId);
      
      // 检查服务器权限
      const hasPermission = await this.checkServerPermission(connection.userId, serverId, 'can_ssh');
      if (!hasPermission) {
        return this.sendError(connectionId, '没有SSH访问权限', requestId);
      }

      // 获取服务器信息
      const server = await database.db.get(
        'SELECT * FROM servers WHERE id = ? AND is_active = 1',
        [serverId]
      );

      if (!server) {
        return this.sendError(connectionId, '服务器不存在或未激活', requestId);
      }

      // 创建会话ID
      const sessionId = `ssh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // 解密服务器认证信息
      const serverConfig = await this.prepareServerConfig(server);
      
      // 创建 SSH 会话
      await sshSessionService.createSession(sessionId, serverConfig);

      // 关联会话和连接
      connection.sshSessions.add(sessionId);
      if (!this.sessionConnections.has(sessionId)) {
        this.sessionConnections.set(sessionId, new Set());
      }
      this.sessionConnections.get(sessionId).add(connectionId);

      // 设置 SSH 输出监听
      this.setupSSHOutputListener(sessionId);

      this.sendToConnection(connectionId, {
        type: 'ssh_session_created',
        requestId,
        sessionId,
        serverId,
        serverName: server.name,
        message: 'SSH会话创建成功'
      });

    } catch (error) {
      this.sendError(connectionId, error.message, message.requestId);
    }
  }

  /**
   * 执行 SSH 命令
   */
  async handleExecuteCommand(connectionId, message) {
    try {
      const { sessionId, command, requestId } = message;
      
      const result = await sshSessionService.executeCommand(sessionId, command);
      
      this.sendToConnection(connectionId, {
        type: 'ssh_command_result',
        requestId,
        sessionId,
        result
      });

      // 广播命令执行事件给订阅者
      this.broadcastToSubscribers('ssh_command_executed', {
        sessionId,
        command: command.substring(0, 50),
        responseTime: result.responseTime,
        success: true
      });

    } catch (error) {
      this.sendError(connectionId, error.message, message.requestId);
    }
  }

  /**
   * 发送原始输入
   */
  async handleSendInput(connectionId, message) {
    try {
      const { sessionId, data, requestId } = message;
      
      sshSessionService.sendRawData(sessionId, data);
      
      this.sendToConnection(connectionId, {
        type: 'ssh_input_sent',
        requestId,
        sessionId
      });

    } catch (error) {
      this.sendError(connectionId, error.message, message.requestId);
    }
  }

  /**
   * 调整终端大小
   */
  async handleResizeTerminal(connectionId, message) {
    try {
      const { sessionId, cols, rows, requestId } = message;
      
      sshSessionService.resizeTerminal(sessionId, cols, rows);
      
      this.sendToConnection(connectionId, {
        type: 'ssh_terminal_resized',
        requestId,
        sessionId,
        cols,
        rows
      });

    } catch (error) {
      this.sendError(connectionId, error.message, message.requestId);
    }
  }

  /**
   * 关闭 SSH 会话
   */
  async handleCloseSSHSession(connectionId, message) {
    try {
      const { sessionId, requestId } = message;
      const connection = this.connections.get(connectionId);
      
      await sshSessionService.closeSession(sessionId);
      
      // 清理关联
      connection.sshSessions.delete(sessionId);
      if (this.sessionConnections.has(sessionId)) {
        this.sessionConnections.get(sessionId).delete(connectionId);
        if (this.sessionConnections.get(sessionId).size === 0) {
          this.sessionConnections.delete(sessionId);
        }
      }

      this.sendToConnection(connectionId, {
        type: 'ssh_session_closed',
        requestId,
        sessionId
      });

    } catch (error) {
      this.sendError(connectionId, error.message, message.requestId);
    }
  }

  /**
   * 列出目录
   */
  async handleListDirectory(connectionId, message) {
    try {
      const { serverId, path = '.', requestId } = message;
      
      const list = await sshFileTransferService.listDirectory(serverId, path);
      
      this.sendToConnection(connectionId, {
        type: 'file_directory_listed',
        requestId,
        serverId,
        path,
        items: list
      });

    } catch (error) {
      this.sendError(connectionId, error.message, message.requestId);
    }
  }

  /**
   * 创建目录
   */
  async handleCreateDirectory(connectionId, message) {
    try {
      const { serverId, path, mode, requestId } = message;
      
      const result = await sshFileTransferService.createDirectory(
        serverId, 
        path, 
        { mode: mode ? parseInt(mode, 8) : undefined }
      );
      
      this.sendToConnection(connectionId, {
        type: 'file_directory_created',
        requestId,
        serverId,
        result
      });

    } catch (error) {
      this.sendError(connectionId, error.message, message.requestId);
    }
  }

  /**
   * 删除文件/目录
   */
  async handleDeleteFile(connectionId, message) {
    try {
      const { serverId, path, recursive = false, requestId } = message;
      
      const result = await sshFileTransferService.deleteRemote(
        serverId, 
        path, 
        { recursive }
      );
      
      this.sendToConnection(connectionId, {
        type: 'file_deleted',
        requestId,
        serverId,
        result
      });

    } catch (error) {
      this.sendError(connectionId, error.message, message.requestId);
    }
  }

  /**
   * 获取 SSH 统计
   */
  async handleGetSSHStats(connectionId, message) {
    try {
      const { requestId } = message;
      
      const stats = sshSessionService.getStats();
      const performanceReport = sshPerformanceMonitor.getPerformanceReport();
      
      this.sendToConnection(connectionId, {
        type: 'ssh_stats',
        requestId,
        stats: {
          ...stats,
          performance: performanceReport
        }
      });

    } catch (error) {
      this.sendError(connectionId, error.message, message.requestId);
    }
  }

  /**
   * 获取性能报告
   */
  async handleGetPerformanceReport(connectionId, message) {
    try {
      const { requestId } = message;
      
      const report = sshPerformanceMonitor.getPerformanceReport();
      
      this.sendToConnection(connectionId, {
        type: 'performance_report',
        requestId,
        report
      });

    } catch (error) {
      this.sendError(connectionId, error.message, message.requestId);
    }
  }

  /**
   * 获取连接池状态
   */
  async handleGetConnectionPoolStatus(connectionId, message) {
    try {
      const { requestId } = message;
      
      const status = sshConnectionPool.getStats();
      
      this.sendToConnection(connectionId, {
        type: 'connection_pool_status',
        requestId,
        status
      });

    } catch (error) {
      this.sendError(connectionId, error.message, message.requestId);
    }
  }

  /**
   * 处理订阅
   */
  async handleSubscribe(connectionId, message) {
    try {
      const { events, requestId } = message;
      const connection = this.connections.get(connectionId);
      
      if (Array.isArray(events)) {
        events.forEach(event => connection.subscriptions.add(event));
      } else {
        connection.subscriptions.add(events);
      }
      
      this.sendToConnection(connectionId, {
        type: 'subscribed',
        requestId,
        events: Array.from(connection.subscriptions)
      });

    } catch (error) {
      this.sendError(connectionId, error.message, message.requestId);
    }
  }

  /**
   * 处理取消订阅
   */
  async handleUnsubscribe(connectionId, message) {
    try {
      const { events, requestId } = message;
      const connection = this.connections.get(connectionId);
      
      if (Array.isArray(events)) {
        events.forEach(event => connection.subscriptions.delete(event));
      } else {
        connection.subscriptions.delete(events);
      }
      
      this.sendToConnection(connectionId, {
        type: 'unsubscribed',
        requestId,
        events: Array.from(connection.subscriptions)
      });

    } catch (error) {
      this.sendError(connectionId, error.message, message.requestId);
    }
  }

  /**
   * 设置 SSH 输出监听
   */
  setupSSHOutputListener(sessionId) {
    const session = sshSessionService.sessions.get(sessionId);
    if (!session || !session.stream) return;

    const outputHandler = (data) => {
      this.broadcastToSession(sessionId, {
        type: 'ssh_output',
        sessionId,
        data: data.toString()
      });
    };

    session.stream.on('data', outputHandler);
    
    // 存储处理器引用以便清理
    session.wsOutputHandler = outputHandler;
  }

  /**
   * 发送消息到指定连接
   */
  sendToConnection(connectionId, message) {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.ws.readyState !== 1) return false;

    try {
      connection.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error(`发送 WebSocket 消息失败: ${connectionId}`, error);
      return false;
    }
  }

  /**
   * 发送错误消息
   */
  sendError(connectionId, errorMessage, requestId = null) {
    this.sendToConnection(connectionId, {
      type: 'error',
      requestId,
      error: errorMessage,
      timestamp: Date.now()
    });
  }

  /**
   * 广播消息到会话相关的所有连接
   */
  broadcastToSession(sessionId, message) {
    const connectionIds = this.sessionConnections.get(sessionId);
    if (!connectionIds) return;

    for (const connectionId of connectionIds) {
      this.sendToConnection(connectionId, message);
    }
  }

  /**
   * 广播消息到订阅者
   */
  broadcastToSubscribers(eventType, data) {
    for (const [connectionId, connection] of this.connections.entries()) {
      if (connection.subscriptions.has(eventType)) {
        this.sendToConnection(connectionId, {
          type: 'event',
          eventType,
          data,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * 广播消息到用户的所有连接
   */
  broadcastToUser(userId, message) {
    const connectionIds = this.userConnections.get(userId);
    if (!connectionIds) return;

    for (const connectionId of connectionIds) {
      this.sendToConnection(connectionId, message);
    }
  }

  /**
   * 广播消息到所有连接
   */
  broadcast(message) {
    for (const connectionId of this.connections.keys()) {
      this.sendToConnection(connectionId, message);
    }
  }

  /**
   * 检查服务器权限
   */
  async checkServerPermission(userId, serverId, permission) {
    try {
      // 管理员有所有权限
      const user = await database.db.get('SELECT role FROM users WHERE id = ?', [userId]);
      if (user && user.role === 'admin') {
        return true;
      }

      // 检查用户权限
      const result = await database.db.get(
        `SELECT ${permission} FROM user_server_permissions WHERE user_id = ? AND server_id = ?`,
        [userId, serverId]
      );

      return result && result[permission];
    } catch (error) {
      logger.error('检查服务器权限失败:', error);
      return false;
    }
  }

  /**
   * 准备服务器配置
   */
  async prepareServerConfig(server) {
    const encryption = (await import('../utils/encryption.js')).default;
    
    const serverConfig = { ...server };
    
    if (server.password_encrypted) {
      serverConfig.password = encryption.decrypt(server.password_encrypted);
    }
    
    if (server.private_key_encrypted) {
      serverConfig.private_key = encryption.decrypt(server.private_key_encrypted);
    }
    
    return serverConfig;
  }

  /**
   * 启动心跳检测
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      for (const [connectionId, connection] of this.connections.entries()) {
        if (!connection.isAlive) {
          logger.info(`WebSocket 连接心跳超时，关闭连接: ${connectionId}`);
          connection.ws.terminate();
          this.cleanupConnection(connectionId);
        } else {
          connection.isAlive = false;
          connection.ws.ping();
        }
      }
    }, 30000); // 30秒心跳间隔
  }

  /**
   * 清理连接
   */
  cleanupConnection(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // 清理用户连接映射
    const userConnections = this.userConnections.get(connection.userId);
    if (userConnections) {
      userConnections.delete(connectionId);
      if (userConnections.size === 0) {
        this.userConnections.delete(connection.userId);
      }
    }

    // 清理 SSH 会话关联
    for (const sessionId of connection.sshSessions) {
      const sessionConnections = this.sessionConnections.get(sessionId);
      if (sessionConnections) {
        sessionConnections.delete(connectionId);
        if (sessionConnections.size === 0) {
          // 如果没有其他连接关联此会话，关闭会话
          sshSessionService.closeSession(sessionId).catch(err => {
            logger.error(`关闭孤立SSH会话失败: ${sessionId}`, err);
          });
          this.sessionConnections.delete(sessionId);
        }
      }
    }

    this.connections.delete(connectionId);
    logger.debug(`WebSocket 连接已清理: ${connectionId}`);
  }

  /**
   * 获取服务统计
   */
  getStats() {
    const connections = Array.from(this.connections.values());
    
    return {
      totalConnections: connections.length,
      connectionsByUser: connections.reduce((acc, conn) => {
        acc[conn.userId] = (acc[conn.userId] || 0) + 1;
        return acc;
      }, {}),
      activeSessions: this.sessionConnections.size,
      averageConnectionTime: connections.length > 0 
        ? Math.round(connections.reduce((sum, conn) => 
            sum + (Date.now() - conn.connectedAt), 0) / connections.length)
        : 0,
      subscriptionStats: connections.reduce((acc, conn) => {
        for (const sub of conn.subscriptions) {
          acc[sub] = (acc[sub] || 0) + 1;
        }
        return acc;
      }, {}),
      isInitialized: this.isInitialized
    };
  }

  /**
   * 销毁服务
   */
  destroy() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // 关闭所有连接
    for (const connectionId of this.connections.keys()) {
      this.cleanupConnection(connectionId);
    }

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    this.connections.clear();
    this.userConnections.clear();
    this.sessionConnections.clear();
    this.isInitialized = false;
    
    logger.info('统一 WebSocket 服务已销毁');
  }
}

export default new UnifiedWebSocketService();