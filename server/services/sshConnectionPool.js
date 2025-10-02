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
        return existingConnection.client;
      }

      // 创建新连接
      return await this.createConnection(serverId);
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
        readyTimeout: 10000,
        keepaliveInterval: 30000,
        keepaliveCountMax: 3
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
          reject(new Error('SSH连接超时'));
        }, 15000);

        client.on('ready', () => {
          clearTimeout(timeout);
          logger.info(`SSH连接建立成功: ${server.name} (${server.host})`);
          resolve();
        });

        client.on('error', (err) => {
          clearTimeout(timeout);
          logger.error(`SSH连接失败: ${server.name} (${server.host})`, err);
          reject(err);
        });

        client.connect(connectConfig);
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
   * 执行SSH命令
   * @param {number} serverId - 服务器ID
   * @param {string} command - 要执行的命令
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {Promise<string>} 命令输出
   */
  async executeCommand(serverId, command, timeout = 10000) {
    try {
      const client = await this.getConnection(serverId);
      
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('命令执行超时'));
        }, timeout);

        client.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeoutId);
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
              reject(new Error(`命令执行失败 (退出码: ${code}): ${errorOutput}`));
            }
          });
        });
      });
    } catch (error) {
      logger.error(`执行SSH命令失败 (服务器 ${serverId}):`, error);
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
      return false;
    }

    // 检查客户端状态
    return connectionInfo.client._sock && !connectionInfo.client._sock.destroyed;
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

    return {
      totalConnections: this.connections.size,
      connections,
      isInitialized: this.isInitialized
    };
  }
}

export default new SSHConnectionPool();
