import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';
import sshSessionService from './sshSessionService.js';
import database from '../config/database.js';

/**
 * SSH WebSocket 服务
 * 提供实时终端交互体验
 */
class SSHWebSocketService {
  constructor() {
    this.wss = null;
    this.connections = new Map(); // sessionId -> { ws, userId, serverId }
    this.isInitialized = false;
  }

  /**
   * 初始化 WebSocket 服务
   * @param {Object} server - HTTP 服务器实例
   */
  initialize(server) {
    if (this.isInitialized) return;

    this.wss = new WebSocketServer({
      server,
      path: '/ws/ssh',
      verifyClient: this.verifyClient.bind(this)
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.wss.on('error', (error) => {
      logger.error('WebSocket 服务器错误:', error);
    });

    this.isInitialized = true;
    logger.info('SSH WebSocket 服务初始化完成');
  }

  /**
   * 验证客户端连接
   * @param {Object} info - 连接信息
   */
  async verifyClient(info) {
    try {
      const url = new URL(info.req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      
      if (!token) {
        logger.warn('WebSocket 连接缺少认证令牌');
        return false;
      }

      // 验证 JWT 令牌
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // 验证用户是否存在且活跃
      const user = await database.db.get(
        'SELECT * FROM users WHERE id = ? AND is_active = 1',
        [decoded.userId]
      );

      if (!user) {
        logger.warn('WebSocket 连接用户不存在或已禁用:', decoded.userId);
        return false;
      }

      // 将用户信息附加到请求对象
      info.req.user = user;
      return true;
    } catch (error) {
      logger.warn('WebSocket 连接认证失败:', error.message);
      return false;
    }
  }

  /**
   * 处理新的 WebSocket 连接
   * @param {WebSocket} ws - WebSocket 连接
   * @param {Object} req - HTTP 请求对象
   */
  handleConnection(ws, req) {
    const user = req.user;
    const url = new URL(req.url, 'http://localhost');
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      ws.close(1008, '缺少会话ID');
      return;
    }

    // 检查会话是否存在
    const sessionInfo = sshSessionService.getSessionInfo(sessionId);
    if (!sessionInfo) {
      ws.close(1008, 'SSH会话不存在');
      return;
    }

    logger.info(`WebSocket SSH 连接建立: 用户 ${user.username}, 会话 ${sessionId}`);

    // 存储连接信息
    this.connections.set(sessionId, {
      ws,
      userId: user.id,
      serverId: sessionInfo.serverId,
      sessionId,
      connectedAt: Date.now()
    });

    // 设置消息处理器
    ws.on('message', (data) => {
      this.handleMessage(sessionId, data);
    });

    // 设置连接关闭处理器
    ws.on('close', (code, reason) => {
      logger.info(`WebSocket SSH 连接关闭: 会话 ${sessionId}, 代码 ${code}, 原因: ${reason}`);
      this.connections.delete(sessionId);
    });

    // 设置错误处理器
    ws.on('error', (error) => {
      logger.error(`WebSocket SSH 连接错误: 会话 ${sessionId}`, error);
      this.connections.delete(sessionId);
    });

    // 发送连接确认
    this.sendMessage(sessionId, {
      type: 'connected',
      sessionId,
      message: 'WebSocket 连接已建立'
    });

    // 设置 SSH 会话输出监听
    this.setupSSHOutputListener(sessionId);
  }

  /**
   * 设置 SSH 会话输出监听
   * @param {string} sessionId - 会话ID
   */
  setupSSHOutputListener(sessionId) {
    const session = sshSessionService.sessions.get(sessionId);
    if (!session || !session.stream) return;

    // 监听 SSH 输出并转发到 WebSocket
    const outputHandler = (data) => {
      this.sendMessage(sessionId, {
        type: 'output',
        data: data.toString()
      });
    };

    session.stream.on('data', outputHandler);

    // 清理监听器
    const connection = this.connections.get(sessionId);
    if (connection) {
      connection.outputHandler = outputHandler;
    }
  }

  /**
   * 处理 WebSocket 消息
   * @param {string} sessionId - 会话ID
   * @param {Buffer} data - 消息数据
   */
  async handleMessage(sessionId, data) {
    try {
      const connection = this.connections.get(sessionId);
      if (!connection) return;

      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'command':
          await this.handleCommand(sessionId, message);
          break;
          
        case 'input':
          await this.handleInput(sessionId, message);
          break;
          
        case 'resize':
          await this.handleResize(sessionId, message);
          break;
          
        case 'ping':
          this.sendMessage(sessionId, { type: 'pong' });
          break;
          
        default:
          logger.warn(`未知的 WebSocket 消息类型: ${message.type}`);
      }
    } catch (error) {
      logger.error(`处理 WebSocket 消息失败: 会话 ${sessionId}`, error);
      this.sendMessage(sessionId, {
        type: 'error',
        message: error.message
      });
    }
  }

  /**
   * 处理命令执行
   * @param {string} sessionId - 会话ID
   * @param {Object} message - 消息对象
   */
  async handleCommand(sessionId, message) {
    try {
      const result = await sshSessionService.executeCommand(sessionId, message.command);
      
      this.sendMessage(sessionId, {
        type: 'command_result',
        commandId: message.commandId,
        result
      });
    } catch (error) {
      this.sendMessage(sessionId, {
        type: 'command_error',
        commandId: message.commandId,
        error: error.message
      });
    }
  }

  /**
   * 处理原始输入
   * @param {string} sessionId - 会话ID
   * @param {Object} message - 消息对象
   */
  async handleInput(sessionId, message) {
    try {
      sshSessionService.sendRawData(sessionId, message.data);
    } catch (error) {
      this.sendMessage(sessionId, {
        type: 'input_error',
        error: error.message
      });
    }
  }

  /**
   * 处理终端大小调整
   * @param {string} sessionId - 会话ID
   * @param {Object} message - 消息对象
   */
  async handleResize(sessionId, message) {
    try {
      sshSessionService.resizeTerminal(sessionId, message.cols, message.rows);
      
      this.sendMessage(sessionId, {
        type: 'resize_success',
        cols: message.cols,
        rows: message.rows
      });
    } catch (error) {
      this.sendMessage(sessionId, {
        type: 'resize_error',
        error: error.message
      });
    }
  }

  /**
   * 发送消息到 WebSocket 客户端
   * @param {string} sessionId - 会话ID
   * @param {Object} message - 消息对象
   */
  sendMessage(sessionId, message) {
    const connection = this.connections.get(sessionId);
    if (!connection || connection.ws.readyState !== 1) return;

    try {
      connection.ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error(`发送 WebSocket 消息失败: 会话 ${sessionId}`, error);
    }
  }

  /**
   * 广播消息到所有连接
   * @param {Object} message - 消息对象
   */
  broadcast(message) {
    for (const [sessionId, connection] of this.connections.entries()) {
      if (connection.ws.readyState === 1) {
        try {
          connection.ws.send(JSON.stringify(message));
        } catch (error) {
          logger.error(`广播消息失败: 会话 ${sessionId}`, error);
        }
      }
    }
  }

  /**
   * 关闭指定会话的 WebSocket 连接
   * @param {string} sessionId - 会话ID
   */
  closeConnection(sessionId) {
    const connection = this.connections.get(sessionId);
    if (connection) {
      // 清理 SSH 输出监听器
      if (connection.outputHandler) {
        const session = sshSessionService.sessions.get(sessionId);
        if (session && session.stream) {
          session.stream.removeListener('data', connection.outputHandler);
        }
      }
      
      connection.ws.close(1000, '会话已关闭');
      this.connections.delete(sessionId);
    }
  }

  /**
   * 获取连接统计
   */
  getStats() {
    const connections = Array.from(this.connections.values());
    
    return {
      totalConnections: connections.length,
      connectionsByUser: connections.reduce((acc, conn) => {
        acc[conn.userId] = (acc[conn.userId] || 0) + 1;
        return acc;
      }, {}),
      connectionsByServer: connections.reduce((acc, conn) => {
        acc[conn.serverId] = (acc[conn.serverId] || 0) + 1;
        return acc;
      }, {}),
      averageConnectionTime: connections.length > 0 
        ? Math.round(connections.reduce((sum, conn) => 
            sum + (Date.now() - conn.connectedAt), 0) / connections.length)
        : 0,
      isInitialized: this.isInitialized
    };
  }

  /**
   * 销毁服务
   */
  destroy() {
    if (this.wss) {
      // 关闭所有连接
      for (const [sessionId] of this.connections.entries()) {
        this.closeConnection(sessionId);
      }
      
      this.wss.close();
      this.wss = null;
    }
    
    this.connections.clear();
    this.isInitialized = false;
    logger.info('SSH WebSocket 服务已销毁');
  }
}

export default new SSHWebSocketService();