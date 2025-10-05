import { Client } from 'ssh2';
import logger from '../utils/logger.js';
import encryption from '../utils/encryption.js';
import database from '../config/database.js';

class SSHConnectionPool {
  constructor() {
    this.connections = new Map(); // serverId -> connection info
    this.connectionTimeout = 30 * 60 * 1000; // 30分钟超时
    this.keepAliveInterval = 30 * 1000; // 30秒心跳
    this.cleanupInterval = 5 * 60 * 1000; // 5分钟清理一次
    this.isInitialized = false;
    this.maxConnectionsPerServer = 1; // 每个服务器最多1个连接
    this.connectionAttempts = new Map(); // 跟踪连接尝试次数
    this.maxConnectionAttempts = 3; // 最大连接尝试次数
    this.commandQueues = new Map(); // serverId -> command queue
    this.executingCommands = new Map(); // serverId -> boolean (是否正在执行命令)
  }

  /**
   * 初始化连接池
   */
  initialize() {
    if (this.isInitialized) return;
    
    // 启动定期清理
    this.startCleanupTimer();
    
    // 启动心跳检测
    this.startKeepAliveTimer();
    
    this.isInitialized = true;
    logger.info('SSH连接池初始化完成');
  }

  /**
   * 获取或创建SSH连接
   * @param {number} serverId - 服务器ID
   * @returns {Promise<Client>} SSH客户端
   */
  async getConnection(serverId) {
    try {
      // 检查是否已有连接
      const existingConnection = this.connections.get(serverId);
      if (existingConnection && this.isConnectionAlive(existingConnection)) {
        existingConnection.lastUsed = Date.now();
        logger.debug(`复用SSH连接: ${existingConnection.serverName} (${existingConnection.host})`);
        return existingConnection.client;
      }

      // 如果连接存在但已失效，先清理
      if (existingConnection) {
        logger.info(`SSH连接已失效，将重新创建: ${existingConnection.serverName} (${existingConnection.host})`);
        this.connections.delete(serverId);
      }

      // 检查连接尝试次数
      const attempts = this.connectionAttempts.get(serverId) || 0;
      if (attempts >= this.maxConnectionAttempts) {
        throw new Error(`服务器 ${serverId} 连接尝试次数过多，请稍后重试`);
      }

      // 创建新连接
      logger.info(`创建新的SSH连接: 服务器ID ${serverId} (尝试 ${attempts + 1}/${this.maxConnectionAttempts})`);
      this.connectionAttempts.set(serverId, attempts + 1);
      
      const client = await this.createConnection(serverId);
      
      // 连接成功后重置尝试次数
      this.connectionAttempts.delete(serverId);
      
      return client;
    } catch (error) {
      logger.error(`获取SSH连接失败 (服务器 ${serverId}):`, error);
      throw error;
    }
  }

  /**
   * 创建新的SSH连接
   * @param {number} serverId - 服务器ID
   * @returns {Promise<Client>} SSH客户端
   */
  async createConnection(serverId) {
    try {
      // 获取服务器信息
      const server = await this.getServerInfo(serverId);
      if (!server) {
        throw new Error('服务器不存在');
      }

      // 解密凭据
      const credentials = await this.decryptCredentials(server);
      if (!credentials.password && !credentials.privateKey) {
        throw new Error('服务器缺少认证凭据');
      }

      // 创建SSH客户端
      const client = new Client();
      
      // 连接配置
      const connectConfig = {
        host: server.host,
        port: server.ssh_port || server.port || 22,
        username: server.username || 'root',
        readyTimeout: 15000, // 增加到15秒
        keepaliveInterval: 30000,
        keepaliveCountMax: 3,
        algorithms: {
          kex: [
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384',
            'ecdh-sha2-nistp521',
            'diffie-hellman-group14-sha256',
            'diffie-hellman-group16-sha512'
          ],
          cipher: [
            'aes128-gcm',
            'aes256-gcm',
            'aes128-ctr',
            'aes192-ctr',
            'aes256-ctr'
          ],
          hmac: [
            'hmac-sha2-256',
            'hmac-sha2-512',
            'hmac-sha1'
          ]
        }
      };

      // 添加认证信息
      if (credentials.password) {
        connectConfig.password = credentials.password;
      }
      if (credentials.privateKey) {
        connectConfig.privateKey = credentials.privateKey;
      }

      // 建立连接
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.destroy();
          reject(new Error(`SSH连接超时: ${server.name} (${server.host})`));
        }, 20000); // 增加到20秒

        client.on('ready', () => {
          clearTimeout(timeout);
          logger.info(`SSH连接建立成功: ${server.name} (${server.host})`);
          resolve();
        });

        client.on('error', (err) => {
          clearTimeout(timeout);
          logger.error(`SSH连接失败: ${server.name} (${server.host})`, {
            error: err.message,
            code: err.code,
            level: err.level
          });
          reject(err);
        });

        client.on('close', () => {
          logger.debug(`SSH连接已关闭: ${server.name} (${server.host})`);
        });

        try {
          client.connect(connectConfig);
        } catch (connectError) {
          clearTimeout(timeout);
          reject(connectError);
        }
      });

      // 存储连接信息
      const connectionInfo = {
        client,
        serverId,
        serverName: server.name,
        host: server.host,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        isAlive: true
      };

      this.connections.set(serverId, connectionInfo);

      // 监听连接关闭事件
      client.on('close', () => {
        logger.info(`SSH连接已关闭: ${server.name} (${server.host})`);
        this.connections.delete(serverId);
      });

      client.on('error', (err) => {
        logger.error(`SSH连接错误: ${server.name} (${server.host})`, err);
        this.connections.delete(serverId);
      });

      return client;
    } catch (error) {
      logger.error(`创建SSH连接失败 (服务器 ${serverId}):`, error);
      throw error;
    }
  }

  /**
   * 执行SSH命令（带队列机制）
   * @param {number} serverId - 服务器ID
   * @param {string} command - 要执行的命令
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {Promise<string>} 命令输出
   */
  async executeCommand(serverId, command, timeout = 10000) {
    return new Promise((resolve, reject) => {
      // 将命令添加到队列
      this.addCommandToQueue(serverId, { command, timeout, resolve, reject });
    });
  }

  /**
   * 添加命令到队列
   * @param {number} serverId - 服务器ID
   * @param {Object} commandInfo - 命令信息
   */
  addCommandToQueue(serverId, commandInfo) {
    // 初始化队列
    if (!this.commandQueues.has(serverId)) {
      this.commandQueues.set(serverId, []);
    }
    
    // 添加到队列
    this.commandQueues.get(serverId).push(commandInfo);
    const queueLength = this.commandQueues.get(serverId).length;
    
    logger.debug(`命令已加入队列: 服务器 ${serverId}, 队列长度: ${queueLength}, 命令: ${commandInfo.command.substring(0, 50)}...`);
    
    // 如果当前没有命令在执行，开始处理队列
    if (!this.executingCommands.get(serverId)) {
      this.processCommandQueue(serverId);
    }
  }

  /**
   * 处理命令队列
   * @param {number} serverId - 服务器ID
   */
  async processCommandQueue(serverId) {
    const queue = this.commandQueues.get(serverId);
    if (!queue || queue.length === 0) {
      this.executingCommands.set(serverId, false);
      logger.debug(`队列处理完成: 服务器 ${serverId}`);
      return;
    }

    // 标记正在执行命令
    this.executingCommands.set(serverId, true);
    
    // 取出队列中的第一个命令
    const commandInfo = queue.shift();
    const remainingCommands = queue.length;
    
    logger.debug(`开始执行命令: 服务器 ${serverId}, 剩余队列: ${remainingCommands}, 命令: ${commandInfo.command.substring(0, 50)}...`);
    
    try {
      const result = await this.executeSingleCommand(serverId, commandInfo.command, commandInfo.timeout);
      logger.debug(`命令执行成功: 服务器 ${serverId}, 命令: ${commandInfo.command.substring(0, 50)}...`);
      commandInfo.resolve(result);
    } catch (error) {
      logger.debug(`命令执行失败: 服务器 ${serverId}, 命令: ${commandInfo.command.substring(0, 50)}..., 错误: ${error.message}`);
      commandInfo.reject(error);
    }
    
    // 继续处理队列中的下一个命令
    setTimeout(() => {
      this.processCommandQueue(serverId);
    }, 100); // 短暂延迟，避免过于频繁的命令执行
  }

  /**
   * 执行单个SSH命令
   * @param {number} serverId - 服务器ID
   * @param {string} command - 要执行的命令
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {Promise<string>} 命令输出
   */
  async executeSingleCommand(serverId, command, timeout = 10000) {
    try {
      const client = await this.getConnection(serverId);
      
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`命令执行超时: ${command}`));
        }, timeout);

        client.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeoutId);
            logger.error(`SSH命令执行失败 (服务器 ${serverId}):`, {
              command,
              error: err.message,
              code: err.code
            });
            reject(err);
            return;
          }

          let output = '';
          let errorOutput = '';

          stream.on('data', (data) => {
            output += data.toString();
          });

          stream.stderr.on('data', (data) => {
            errorOutput += data.toString();
          });

          stream.on('close', (code) => {
            clearTimeout(timeoutId);
            if (code === 0) {
              resolve(output.trim());
            } else {
              const errorMsg = `命令执行失败 (退出码: ${code}): ${errorOutput || '未知错误'}`;
              logger.error(`SSH命令执行失败 (服务器 ${serverId}):`, {
                command,
                exitCode: code,
                errorOutput
              });
              reject(new Error(errorMsg));
            }
          });

          stream.on('error', (streamErr) => {
            clearTimeout(timeoutId);
            logger.error(`SSH流错误 (服务器 ${serverId}):`, {
              command,
              error: streamErr.message
            });
            reject(streamErr);
          });
        });
      });
    } catch (error) {
      logger.error(`执行SSH命令失败 (服务器 ${serverId}):`, {
        command,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 检查服务器状态
   * @param {number} serverId - 服务器ID
   * @returns {Promise<boolean>} 服务器是否在线
   */
  async checkServerStatus(serverId) {
    try {
      await this.executeCommand(serverId, 'docker ps --format "table {{.Names}}\t{{.Status}}"', 5000);
      return true;
    } catch (error) {
      logger.debug(`服务器状态检查失败 (服务器 ${serverId}):`, error.message);
      return false;
    }
  }

  /**
   * 获取服务器信息
   * @param {number} serverId - 服务器ID
   * @returns {Promise<Object>} 服务器信息
   */
  async getServerInfo(serverId) {
    try {
      const result = await database.db.get(
        'SELECT * FROM servers WHERE id = ? AND (is_active = 1 OR is_active = true)',
        [serverId]
      );
      return result;
    } catch (error) {
      logger.error(`获取服务器信息失败 (服务器 ${serverId}):`, error);
      return null;
    }
  }

  /**
   * 解密服务器凭据
   * @param {Object} server - 服务器信息
   * @returns {Promise<Object>} 解密后的凭据
   */
  async decryptCredentials(server) {
    const credentials = {
      password: null,
      privateKey: null
    };

    try {
      if (server.password_encrypted) {
        credentials.password = encryption.decrypt(server.password_encrypted);
      }
      
      if (server.private_key_encrypted) {
        credentials.privateKey = encryption.decrypt(server.private_key_encrypted);
      }
    } catch (error) {
      logger.error('解密服务器凭据失败:', error);
    }

    return credentials;
  }

  /**
   * 检查连接是否存活
   * @param {Object} connectionInfo - 连接信息
   * @returns {boolean} 连接是否存活
   */
  isConnectionAlive(connectionInfo) {
    if (!connectionInfo || !connectionInfo.client) {
      return false;
    }

    // 检查连接是否超时
    const now = Date.now();
    if (now - connectionInfo.lastUsed > this.connectionTimeout) {
      logger.debug(`连接超时: ${connectionInfo.serverName} (${connectionInfo.host})`);
      return false;
    }

    // 检查客户端状态
    const isSocketAlive = connectionInfo.client._sock && !connectionInfo.client._sock.destroyed;
    if (!isSocketAlive) {
      logger.debug(`Socket已断开: ${connectionInfo.serverName} (${connectionInfo.host})`);
    }
    
    return isSocketAlive;
  }

  /**
   * 关闭指定服务器的连接
   * @param {number} serverId - 服务器ID
   */
  async closeConnection(serverId) {
    const connectionInfo = this.connections.get(serverId);
    if (connectionInfo && connectionInfo.client) {
      try {
        connectionInfo.client.end();
        logger.info(`SSH连接已关闭: 服务器 ${serverId}`);
      } catch (error) {
        logger.error(`关闭SSH连接失败: 服务器 ${serverId}`, error);
      }
    }
    this.connections.delete(serverId);
    
    // 清理相关的队列和状态
    this.clearCommandQueue(serverId);
    this.connectionAttempts.delete(serverId);
  }

  /**
   * 关闭所有连接
   */
  async closeAllConnections() {
    const promises = Array.from(this.connections.keys()).map(serverId => 
      this.closeConnection(serverId)
    );
    
    await Promise.all(promises);
    logger.info('所有SSH连接已关闭');
  }

  /**
   * 启动定期清理
   */
  startCleanupTimer() {
    setInterval(() => {
      this.cleanupInactiveConnections();
      this.cleanupConnectionAttempts();
    }, this.cleanupInterval);
  }

  /**
   * 启动心跳检测
   */
  startKeepAliveTimer() {
    setInterval(() => {
      this.performKeepAlive();
    }, this.keepAliveInterval);
  }

  /**
   * 清理非活跃连接
   */
  cleanupInactiveConnections() {
    const now = Date.now();
    const toClose = [];

    for (const [serverId, connectionInfo] of this.connections.entries()) {
      if (now - connectionInfo.lastUsed > this.connectionTimeout) {
        toClose.push(serverId);
      }
    }

    toClose.forEach(serverId => {
      logger.info(`清理非活跃SSH连接: 服务器 ${serverId}`);
      this.closeConnection(serverId);
    });

    if (toClose.length > 0) {
      logger.info(`清理了 ${toClose.length} 个非活跃SSH连接`);
    }
  }

  /**
   * 执行心跳检测
   */
  async performKeepAlive() {
    for (const [serverId, connectionInfo] of this.connections.entries()) {
      try {
        // 发送简单的命令来保持连接活跃
        await this.executeCommand(serverId, 'echo "keepalive"', 3000);
        connectionInfo.lastUsed = Date.now();
      } catch (error) {
        logger.debug(`心跳检测失败，关闭连接: 服务器 ${serverId}`, error.message);
        this.closeConnection(serverId);
      }
    }
  }

  /**
   * 获取连接池状态
   * @returns {Object} 连接池状态
   */
  getStatus() {
    const now = Date.now();
    const connections = Array.from(this.connections.values()).map(conn => ({
      serverId: conn.serverId,
      serverName: conn.serverName,
      host: conn.host,
      createdAt: conn.createdAt,
      lastUsed: conn.lastUsed,
      age: now - conn.createdAt,
      idleTime: now - conn.lastUsed,
      isAlive: this.isConnectionAlive(conn)
    }));

    const aliveConnections = connections.filter(conn => conn.isAlive);
    const deadConnections = connections.filter(conn => !conn.isAlive);

    return {
      totalConnections: this.connections.size,
      aliveConnections: aliveConnections.length,
      deadConnections: deadConnections.length,
      connections,
      isInitialized: this.isInitialized,
      connectionTimeout: this.connectionTimeout,
      keepAliveInterval: this.keepAliveInterval,
      cleanupInterval: this.cleanupInterval
    };
  }

  /**
   * 获取连接池统计信息
   * @returns {Object} 连接池统计信息
   */
  getStats() {
    const status = this.getStatus();
    const now = Date.now();
    
    // 计算队列统计
    const queueStats = {};
    let totalQueuedCommands = 0;
    for (const [serverId, queue] of this.commandQueues.entries()) {
      queueStats[serverId] = {
        queuedCommands: queue.length,
        isExecuting: this.executingCommands.get(serverId) || false
      };
      totalQueuedCommands += queue.length;
    }
    
    return {
      ...status,
      timestamp: now,
      summary: {
        totalConnections: status.totalConnections,
        activeConnections: status.aliveConnections,
        inactiveConnections: status.deadConnections,
        connectionReuseRate: status.totalConnections > 0 ? 
          (status.aliveConnections / status.totalConnections * 100).toFixed(2) + '%' : '0%',
        connectionAttempts: Object.fromEntries(this.connectionAttempts),
        totalQueuedCommands,
        queueStats
      }
    };
  }

  /**
   * 重置连接尝试次数
   * @param {number} serverId - 服务器ID
   */
  resetConnectionAttempts(serverId) {
    this.connectionAttempts.delete(serverId);
    logger.debug(`重置服务器 ${serverId} 的连接尝试次数`);
  }

  /**
   * 清理所有连接尝试记录
   */
  clearAllConnectionAttempts() {
    this.connectionAttempts.clear();
    logger.info('已清理所有连接尝试记录');
  }

  /**
   * 清理过期的连接尝试记录
   */
  cleanupConnectionAttempts() {
    const now = Date.now();
    const attemptTimeout = 5 * 60 * 1000; // 5分钟超时
    
    for (const [serverId, attempts] of this.connectionAttempts.entries()) {
      // 这里可以添加时间戳跟踪，暂时简单清理所有记录
      // 在实际使用中，连接尝试记录会在连接成功或失败后自动清理
    }
    
    if (this.connectionAttempts.size > 0) {
      logger.debug(`当前连接尝试记录: ${this.connectionAttempts.size} 个服务器`);
    }
  }

  /**
   * 清理命令队列
   * @param {number} serverId - 服务器ID
   */
  clearCommandQueue(serverId) {
    if (this.commandQueues.has(serverId)) {
      const queue = this.commandQueues.get(serverId);
      logger.info(`清理服务器 ${serverId} 的命令队列，共 ${queue.length} 个命令`);
      this.commandQueues.delete(serverId);
    }
    this.executingCommands.delete(serverId);
  }

  /**
   * 清理所有命令队列
   */
  clearAllCommandQueues() {
    for (const [serverId, queue] of this.commandQueues.entries()) {
      logger.info(`清理服务器 ${serverId} 的命令队列，共 ${queue.length} 个命令`);
    }
    this.commandQueues.clear();
    this.executingCommands.clear();
    logger.info('已清理所有命令队列');
  }
}

export default new SSHConnectionPool();
