import logger from '../utils/logger.js';
import dockerService from './dockerService.js';
import monitoringService from './monitoringService.js';
import { Client } from 'ssh2';
import database from '../config/database.js';
import encryption from '../utils/encryption.js';

class WebSocketService {
  constructor() {
    this.io = null;
    this.connectedClients = new Map(); // 存储连接的客户端信息
    this.sshSessions = new Map(); // 存储 SSH 会话
  }

  /**
   * 初始化 WebSocket 服务
   * @param {Server} io - Socket.IO 服务器实例
   */
  initialize(io) {
    this.io = io;
    this.setupEventHandlers();
    logger.info('WebSocket 服务初始化完成');
  }

  /**
   * 设置事件处理器
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`客户端连接: ${socket.id}`);
      
      // 存储客户端信息
      this.connectedClients.set(socket.id, {
        id: socket.id,
        connectedAt: new Date(),
        userId: null,
        permissions: []
      });

      // 处理连接时的认证（通过auth选项传递的token）
      if (socket.handshake.auth && socket.handshake.auth.token) {
        this.handleAuthentication(socket, { token: socket.handshake.auth.token });
      }

      // 认证事件（兼容旧版本）
      socket.on('authenticate', async (data) => {
        await this.handleAuthentication(socket, data);
      });

      // 服务器相关事件
      socket.on('get_servers', async (data) => {
        await this.handleGetServers(socket, data);
      });

      socket.on('get_containers', async (data) => {
        await this.handleGetContainers(socket, data);
      });

      socket.on('container_action', async (data) => {
        await this.handleContainerAction(socket, data);
      });

      // 监控相关事件
      socket.on('subscribe_monitoring', async (data) => {
        await this.handleSubscribeMonitoring(socket, data);
      });

      socket.on('unsubscribe_monitoring', async (data) => {
        await this.handleUnsubscribeMonitoring(socket, data);
      });

      // SSH 相关事件
      socket.on('ssh_connect', async (data) => {
        await this.handleSshConnect(socket, data);
      });

      socket.on('ssh_command', async (data) => {
        await this.handleSshCommand(socket, data);
      });

      socket.on('ssh_disconnect', async (data) => {
        await this.handleSshDisconnect(socket, data);
      });

      // 断开连接事件
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });

      // 错误处理
      socket.on('error', (error) => {
        logger.error(`Socket 错误 (${socket.id}):`, error);
      });
    });
  }

  /**
   * 处理客户端认证
   * @param {Socket} socket - Socket 实例
   * @param {Object} data - 认证数据
   */
  async handleAuthentication(socket, data) {
    try {
      const { token } = data;
      
      if (!token) {
        socket.emit('auth_error', { message: '缺少认证令牌' });
        return;
      }
      
      // 验证 JWT 令牌
      const jwt = await import('jsonwebtoken');
      const decoded = jwt.default.verify(token, process.env.JWT_SECRET);
      
      // 获取用户信息
      const database = (await import('../config/database.js')).default;
      const userResult = await database.query(
        'SELECT * FROM users WHERE id = $1 AND is_active = true',
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        socket.emit('auth_error', { message: '用户不存在或已禁用' });
        return;
      }

      const user = userResult.rows[0];
      
      // 获取用户权限
      const permissionsResult = await database.query(`
        SELECT s.id, s.name, p.can_view, p.can_control, p.can_ssh, p.hide_sensitive_info
        FROM servers s
        JOIN user_server_permissions p ON s.id = p.server_id
        WHERE p.user_id = $1 AND s.is_active = true
      `, [user.id]);

      // 更新客户端信息
      this.connectedClients.set(socket.id, {
        id: socket.id,
        connectedAt: new Date(),
        userId: user.id,
        username: user.username,
        role: user.role,
        permissions: permissionsResult.rows
      });

      socket.emit('auth_success', {
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        },
        permissions: permissionsResult.rows
      });

      logger.info(`用户 ${user.username} 认证成功 (${socket.id})`);
    } catch (error) {
      logger.error('认证失败:', error);
      socket.emit('auth_error', { message: '认证失败' });
    }
  }

  /**
   * 处理获取服务器列表请求
   * @param {Socket} socket - Socket 实例
   * @param {Object} data - 请求数据
   */
  async handleGetServers(socket, data) {
    try {
      const client = this.connectedClients.get(socket.id);
      if (!client || !client.userId) {
        socket.emit('error', { message: '未认证' });
        return;
      }

      const servers = client.permissions.map(permission => ({
        id: permission.id,
        name: permission.name,
        canView: permission.can_view,
        canControl: permission.can_control,
        canSsh: permission.can_ssh,
        hideSensitiveInfo: permission.hide_sensitive_info
      }));

      socket.emit('servers_list', { servers });
    } catch (error) {
      logger.error('获取服务器列表失败:', error);
      socket.emit('error', { message: '获取服务器列表失败' });
    }
  }

  /**
   * 处理获取容器列表请求
   * @param {Socket} socket - Socket 实例
   * @param {Object} data - 请求数据
   */
  async handleGetContainers(socket, data) {
    try {
      const { serverId } = data;
      const client = this.connectedClients.get(socket.id);
      
      if (!client || !client.userId) {
        socket.emit('error', { message: '未认证' });
        return;
      }

      // 检查权限
      const permission = client.permissions.find(p => p.id === serverId);
      if (!permission || !permission.can_view) {
        socket.emit('error', { message: '无权限访问此服务器' });
        return;
      }

      const containers = await dockerService.getContainers(serverId);
      
      // 根据权限隐藏敏感信息
      const filteredContainers = containers.map(container => {
        if (permission.hide_sensitive_info) {
          return {
            ...container,
            id: container.id.substring(0, 12) + '...',
            ports: container.ports.map(port => ({
              ...port,
              publicPort: port.publicPort ? '***' : port.publicPort
            }))
          };
        }
        return container;
      });

      socket.emit('containers_list', { 
        serverId, 
        containers: filteredContainers 
      });
    } catch (error) {
      logger.error('获取容器列表失败:', error);
      socket.emit('error', { message: '获取容器列表失败' });
    }
  }

  /**
   * 处理容器操作请求
   * @param {Socket} socket - Socket 实例
   * @param {Object} data - 请求数据
   */
  async handleContainerAction(socket, data) {
    try {
      const { serverId, containerId, action } = data;
      const client = this.connectedClients.get(socket.id);
      
      if (!client || !client.userId) {
        socket.emit('error', { message: '未认证' });
        return;
      }

      // 检查权限
      const permission = client.permissions.find(p => p.id === serverId);
      if (!permission || !permission.can_control) {
        socket.emit('error', { message: '无权限控制此服务器' });
        return;
      }

      let result;
      switch (action) {
        case 'start':
          result = await dockerService.startContainer(serverId, containerId);
          break;
        case 'stop':
          result = await dockerService.stopContainer(serverId, containerId);
          break;
        case 'restart':
          result = await dockerService.restartContainer(serverId, containerId);
          break;
        case 'pause':
          result = await dockerService.pauseContainer(serverId, containerId);
          break;
        case 'unpause':
          result = await dockerService.unpauseContainer(serverId, containerId);
          break;
        case 'remove':
          result = await dockerService.removeContainer(serverId, containerId);
          break;
        default:
          socket.emit('error', { message: '未知操作' });
          return;
      }

      socket.emit('container_action_result', {
        serverId,
        containerId,
        action,
        result
      });

      // 广播容器状态更新
      this.broadcastContainerUpdate(serverId, containerId, action, result);
    } catch (error) {
      logger.error('容器操作失败:', error);
      socket.emit('error', { message: '容器操作失败' });
    }
  }

  /**
   * 处理订阅监控数据请求
   * @param {Socket} socket - Socket 实例
   * @param {Object} data - 请求数据
   */
  async handleSubscribeMonitoring(socket, data) {
    try {
      const { serverId, type, containerId } = data;
      const client = this.connectedClients.get(socket.id);
      
      if (!client || !client.userId) {
        socket.emit('error', { message: '未认证' });
        return;
      }

      // 检查权限
      const permission = client.permissions.find(p => p.id === serverId);
      if (!permission || !permission.can_view) {
        socket.emit('error', { message: '无权限访问此服务器' });
        return;
      }

      // 加入监控房间
      const roomName = `monitoring_${serverId}_${type}${containerId ? `_${containerId}` : ''}`;
      socket.join(roomName);

      // 发送当前监控数据
      const currentData = await monitoringService.getHistoricalData(serverId, type, {
        timeRange: '1h',
        containerId
      });

      socket.emit('monitoring_data', {
        serverId,
        type,
        containerId,
        data: currentData
      });

      logger.info(`客户端 ${socket.id} 订阅监控数据: ${roomName}`);
    } catch (error) {
      logger.error('订阅监控数据失败:', error);
      socket.emit('error', { message: '订阅监控数据失败' });
    }
  }

  /**
   * 处理取消订阅监控数据请求
   * @param {Socket} socket - Socket 实例
   * @param {Object} data - 请求数据
   */
  async handleUnsubscribeMonitoring(socket, data) {
    try {
      const { serverId, type, containerId } = data;
      const roomName = `monitoring_${serverId}_${type}${containerId ? `_${containerId}` : ''}`;
      
      socket.leave(roomName);
      logger.info(`客户端 ${socket.id} 取消订阅监控数据: ${roomName}`);
    } catch (error) {
      logger.error('取消订阅监控数据失败:', error);
    }
  }

  /**
   * 处理 SSH 连接请求
   * @param {Socket} socket - Socket 实例
   * @param {Object} data - 请求数据
   */
  async handleSshConnect(socket, data) {
    try {
      const { serverId } = data;
      const client = this.connectedClients.get(socket.id);
      
      if (!client || !client.userId) {
        socket.emit('ssh_error', { message: '未认证' });
        return;
      }

      // 检查权限
      const permission = client.permissions.find(p => p.id === serverId);
      if (!permission || !permission.can_ssh) {
        socket.emit('ssh_error', { message: '无权限 SSH 访问此服务器' });
        return;
      }

      // 获取服务器信息
      const serverResult = await database.query(
        'SELECT * FROM servers WHERE id = $1 AND is_active = true',
        [serverId]
      );

      if (serverResult.rows.length === 0) {
        socket.emit('ssh_error', { message: '服务器不存在或未激活' });
        return;
      }

      const server = serverResult.rows[0];
      
      // 解密服务器凭据
      let password = null;
      let privateKey = null;
      
      if (server.password_encrypted) {
        password = encryption.decrypt(server.password_encrypted);
      }
      
      if (server.private_key_encrypted) {
        privateKey = encryption.decrypt(server.private_key_encrypted);
      }

      if (!password && !privateKey) {
        socket.emit('ssh_error', { message: '服务器缺少SSH认证信息' });
        return;
      }

      // 创建SSH客户端
      const sshClient = new Client();
      const sessionId = `ssh_${socket.id}_${Date.now()}`;

      // SSH连接配置
      const sshConfig = {
        host: server.host,
        port: server.ssh_port || 22,
        username: server.username || 'root',
        readyTimeout: 10000,
        keepaliveInterval: 1000
      };

      if (password) {
        sshConfig.password = password;
      }
      if (privateKey) {
        sshConfig.privateKey = privateKey;
      }

      // 连接SSH
      sshClient.on('ready', () => {
        logger.info(`SSH 连接成功: ${server.name} (${sessionId})`);
        
        // 创建shell
        sshClient.shell((err, stream) => {
          if (err) {
            logger.error('创建SSH shell失败:', err);
            socket.emit('ssh_error', { message: '创建SSH shell失败' });
            return;
          }

          // 存储SSH会话
          this.sshSessions.set(sessionId, {
            socketId: socket.id,
            serverId,
            serverName: server.name,
            sshClient,
            stream,
            connectedAt: new Date()
          });

          // 发送连接成功消息
          socket.emit('ssh_connected', { 
            sessionId,
            serverName: server.name,
            message: 'SSH连接已建立'
          });

          // 监听SSH输出
          stream.on('data', (data) => {
            const output = this.cleanTerminalOutput(data.toString());
            socket.emit('ssh_output', { sessionId, output });
          });

          stream.on('close', () => {
            logger.info(`SSH shell 关闭: ${sessionId}`);
            socket.emit('ssh_disconnected', { sessionId });
            this.cleanupSshSession(sessionId);
          });

          // 发送欢迎消息
          socket.emit('ssh_output', { 
            sessionId, 
            output: `欢迎使用DockerManager SSH控制台\n连接到服务器: ${server.name}\n` 
          });
        });
      });

      sshClient.on('error', (err) => {
        logger.error(`SSH 连接错误: ${server.name}`, err);
        socket.emit('ssh_error', { 
          message: `SSH连接失败: ${err.message}` 
        });
      });

      // 开始连接
      sshClient.connect(sshConfig);

    } catch (error) {
      logger.error('SSH 连接失败:', error);
      socket.emit('ssh_error', { message: 'SSH 连接失败' });
    }
  }

  /**
   * 清理终端控制序列
   * @param {string} text - 原始文本
   * @returns {string} - 清理后的文本
   */
  cleanTerminalOutput(text) {
    if (!text) return '';
    
    return text
      // 移除 bracketed paste mode 序列
      .replace(/\x1b\[\?2004[hl]/g, '')
      // 移除其他常见的 ANSI 转义序列
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      // 移除回车符和换行符的重复
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // 移除多余的空行
      .replace(/\n{3,}/g, '\n\n')
      // 移除行首行尾的空白字符
      .split('\n').map(line => line.trimEnd()).join('\n')
      .trim();
  }

  /**
   * 处理 SSH 命令请求
   * @param {Socket} socket - Socket 实例
   * @param {Object} data - 请求数据
   */
  async handleSshCommand(socket, data) {
    try {
      const { sessionId, command } = data;
      const session = this.sshSessions.get(sessionId);
      
      if (!session || session.socketId !== socket.id) {
        socket.emit('ssh_error', { message: '无效的 SSH 会话' });
        return;
      }

      if (!session.stream) {
        socket.emit('ssh_error', { message: 'SSH 流不存在' });
        return;
      }

      // 发送命令到SSH流
      session.stream.write(command + '\n');
      
      // 记录操作日志
      try {
        const client = this.connectedClients.get(socket.id);
        if (client && client.userId) {
          await database.query(`
            INSERT INTO operation_logs (user_id, server_id, action, details, timestamp)
            VALUES ($1, $2, 'ssh_command', $3, CURRENT_TIMESTAMP)
          `, [client.userId, session.serverId, `命令: ${command}`]);
        }
      } catch (logError) {
        logger.error('记录SSH操作日志失败:', logError);
      }

    } catch (error) {
      logger.error('SSH 命令执行失败:', error);
      socket.emit('ssh_error', { message: 'SSH 命令执行失败' });
    }
  }

  /**
   * 处理 SSH 断开连接请求
   * @param {Socket} socket - Socket 实例
   * @param {Object} data - 请求数据
   */
  async handleSshDisconnect(socket, data) {
    try {
      const { sessionId } = data;
      await this.cleanupSshSession(sessionId, socket.id);
      socket.emit('ssh_disconnected', { sessionId });
      logger.info(`SSH 会话断开: ${sessionId}`);
    } catch (error) {
      logger.error('SSH 断开连接失败:', error);
    }
  }

  /**
   * 清理SSH会话
   * @param {string} sessionId - 会话ID
   * @param {string} socketId - Socket ID（可选）
   */
  async cleanupSshSession(sessionId, socketId = null) {
    const session = this.sshSessions.get(sessionId);
    if (session && (!socketId || session.socketId === socketId)) {
      try {
        // 关闭SSH流
        if (session.stream) {
          session.stream.end();
        }
        // 关闭SSH客户端
        if (session.sshClient) {
          session.sshClient.end();
        }
      } catch (error) {
        logger.error(`清理SSH会话失败: ${sessionId}`, error);
      }
      // 从会话映射中移除
      this.sshSessions.delete(sessionId);
    }
  }

  /**
   * 处理客户端断开连接
   * @param {Socket} socket - Socket 实例
   */
  handleDisconnect(socket) {
    logger.info(`客户端断开连接: ${socket.id}`);
    
    // 清理客户端信息
    this.connectedClients.delete(socket.id);
    
    // 清理 SSH 会话
    for (const [sessionId, session] of this.sshSessions) {
      if (session.socketId === socket.id) {
        this.cleanupSshSession(sessionId);
      }
    }
  }

  /**
   * 广播容器状态更新
   * @param {number} serverId - 服务器 ID
   * @param {string} containerId - 容器 ID
   * @param {string} action - 操作类型
   * @param {Object} result - 操作结果
   */
  broadcastContainerUpdate(serverId, containerId, action, result) {
    const roomName = `server_${serverId}`;
    this.io.to(roomName).emit('container_updated', {
      serverId,
      containerId,
      action,
      result,
      timestamp: new Date()
    });
  }

  /**
   * 广播监控数据更新
   * @param {number} serverId - 服务器 ID
   * @param {string} type - 数据类型
   * @param {Object} data - 监控数据
   * @param {string} containerId - 容器 ID (可选)
   */
  broadcastMonitoringUpdate(serverId, type, data, containerId = null) {
    const roomName = `monitoring_${serverId}_${type}${containerId ? `_${containerId}` : ''}`;
    this.io.to(roomName).emit('monitoring_update', {
      serverId,
      type,
      containerId,
      data,
      timestamp: new Date()
    });
  }

  /**
   * 获取连接统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      connectedClients: this.connectedClients.size,
      activeSshSessions: this.sshSessions.size,
      clients: Array.from(this.connectedClients.values()).map(client => ({
        id: client.id,
        username: client.username,
        connectedAt: client.connectedAt,
        permissions: client.permissions.length
      }))
    };
  }
}

export default new WebSocketService();
