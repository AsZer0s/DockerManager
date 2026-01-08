import { Client } from 'ssh2';
import logger from '../utils/logger.js';
import encryption from '../utils/encryption.js';
import database from '../config/database.js';
import sshPerformanceMonitor from './sshPerformanceMonitor.js';

class SSHConnectionPool {
  constructor() {
    this.connections = new Map(); // serverId -> connection info
    this.connectionTimeout = 30 * 60 * 1000; // 30分钟超时
    this.keepAliveInterval = 30 * 1000; // 30秒心跳
    this.cleanupInterval = 5 * 60 * 1000; // 5分钟清理一次
    this.isInitialized = false;
    this.maxConnectionsPerServer = 1; // 每个服务器最多1个连接
    this.connectionAttempts = new Map(); // 跟踪连接尝试次数 {count, lastAttempt, resetTime}
    this.maxConnectionAttempts = 5; // 增加最大连接尝试次数
    this.connectionResetInterval = 10 * 60 * 1000; // 10分钟后重置连接尝试次数
    this.commandQueues = new Map(); // serverId -> command queue
    this.executingCommands = new Map(); // serverId -> boolean (是否正在执行命令)
    this.retryDelays = new Map(); // serverId -> 当前重试延迟时间
    this.failedServers = new Map(); // serverId -> {lastFailure, failureCount, nextRetry}
    this.autoRecoveryInterval = 5 * 60 * 1000; // 5分钟自动恢复检查
  }

  /**
   * 初始化连接池
   */
  initialize() {
    if (this.isInitialized) return;
    
    // 初始化性能监控
    sshPerformanceMonitor.initialize();
    
    // 启动定期清理
    this.startCleanupTimer();
    
    // 启动心跳检测
    this.startKeepAliveTimer();
    
    // 启动自动恢复机制
    this.startAutoRecoveryTimer();
    
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

      // 检查连接尝试次数和重置时间
      const now = Date.now();
      const attemptInfo = this.connectionAttempts.get(serverId) || { count: 0, lastAttempt: 0, resetTime: now };
      
      // 如果超过重置间隔，重置尝试次数
      if (now - attemptInfo.resetTime > this.connectionResetInterval) {
        attemptInfo.count = 0;
        attemptInfo.resetTime = now;
        this.retryDelays.delete(serverId); // 清除重试延迟
        logger.info(`重置服务器 ${serverId} 的连接尝试次数`);
      }
      
      // 检查是否超过最大尝试次数
      if (attemptInfo.count >= this.maxConnectionAttempts) {
        const timeUntilReset = this.connectionResetInterval - (now - attemptInfo.resetTime);
        const minutesUntilReset = Math.ceil(timeUntilReset / (60 * 1000));
        throw new Error(`服务器 ${serverId} 连接尝试次数过多，将在 ${minutesUntilReset} 分钟后自动重置`);
      }

      // 计算指数退避延迟
      const retryDelay = this.calculateRetryDelay(serverId, attemptInfo.count);
      if (retryDelay > 0) {
        logger.info(`服务器 ${serverId} 连接失败，等待 ${retryDelay}ms 后重试`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }

      // 创建新连接
      logger.info(`创建新的SSH连接: 服务器ID ${serverId} (尝试 ${attemptInfo.count + 1}/${this.maxConnectionAttempts})`);
      attemptInfo.count += 1;
      attemptInfo.lastAttempt = now;
      this.connectionAttempts.set(serverId, attemptInfo);
      
      const client = await this.createConnection(serverId);
      
      // 连接成功后重置尝试次数和重试延迟
      this.connectionAttempts.delete(serverId);
      this.retryDelays.delete(serverId);
      
      return client;
    } catch (error) {
      // 记录连接失败到自动恢复系统
      this.recordConnectionFailure(serverId, error);
      
      logger.error(`获取SSH连接失败 (服务器 ${serverId}):`, error);
      throw error;
    }
  }

  /**
   * 记录连接失败到自动恢复系统
   * @param {number} serverId - 服务器ID
   * @param {Error} error - 连接错误
   */
  recordConnectionFailure(serverId, error) {
    const now = Date.now();
    const existingFailure = this.failedServers.get(serverId);
    
    if (existingFailure) {
      // 更新现有失败记录
      existingFailure.lastFailure = now;
      existingFailure.failureCount += 1;
      existingFailure.nextRetry = now + (existingFailure.failureCount * 2 * 60 * 1000);
    } else {
      // 创建新的失败记录
      this.failedServers.set(serverId, {
        lastFailure: now,
        failureCount: 1,
        nextRetry: now + (2 * 60 * 1000) // 2分钟后第一次重试
      });
    }
    
    logger.debug(`记录服务器 ${serverId} 连接失败，将在自动恢复中重试`);
  }

  /**
   * 检测代理环境下的连接问题
   * @param {Error} error - 连接错误
   * @param {Object} server - 服务器信息
   * @returns {Object} 诊断信息
   */
  diagnoseConnectionIssue(error, server) {
    const diagnosis = {
      isProxyRelated: false,
      suggestions: [],
      errorType: 'unknown'
    };

    // 检查常见的代理相关错误
    if (error.code === 'ECONNREFUSED') {
      diagnosis.errorType = 'connection_refused';
      diagnosis.suggestions.push('检查服务器是否在线');
      diagnosis.suggestions.push('检查SSH端口是否正确');
      diagnosis.suggestions.push('检查防火墙设置');
    } else if (error.code === 'ETIMEDOUT') {
      diagnosis.errorType = 'timeout';
      diagnosis.isProxyRelated = true;
      diagnosis.suggestions.push('可能是代理环境导致的连接超时');
      diagnosis.suggestions.push('尝试增加连接超时时间');
      diagnosis.suggestions.push('检查代理配置');
    } else if (error.code === 'ENOTFOUND') {
      diagnosis.errorType = 'dns_resolution';
      diagnosis.suggestions.push('检查主机名是否正确');
      diagnosis.suggestions.push('检查DNS解析');
    } else if (error.message.includes('authentication')) {
      diagnosis.errorType = 'authentication';
      diagnosis.suggestions.push('检查用户名和密码/密钥');
      diagnosis.suggestions.push('检查SSH密钥权限');
    } else if (error.message.includes('host key')) {
      diagnosis.errorType = 'host_key';
      diagnosis.suggestions.push('检查主机密钥');
      diagnosis.suggestions.push('可能需要接受新的主机密钥');
    }

    // 记录诊断信息
    logger.warn(`连接诊断 - 服务器 ${server.name} (${server.host}):`, {
      errorType: diagnosis.errorType,
      isProxyRelated: diagnosis.isProxyRelated,
      suggestions: diagnosis.suggestions,
      originalError: error.message
    });

    return diagnosis;
  }

  /**
   * 计算重试延迟（指数退避）
   * @param {number} serverId - 服务器ID
   * @param {number} attemptCount - 当前尝试次数
   * @returns {number} 延迟时间（毫秒）
   */
  calculateRetryDelay(serverId, attemptCount) {
    if (attemptCount <= 1) {
      return 0; // 第一次和第二次尝试不延迟
    }
    
    // 指数退避：1s, 2s, 4s, 8s, 16s
    const baseDelay = 1000; // 1秒基础延迟
    const maxDelay = 30000; // 最大30秒延迟
    const delay = Math.min(baseDelay * Math.pow(2, attemptCount - 2), maxDelay);
    
    // 添加随机抖动，避免多个服务器同时重试
    const jitter = Math.random() * 1000; // 0-1秒随机抖动
    
    return delay + jitter;
  }

  /**
   * 创建新的SSH连接
   * @param {number} serverId - 服务器ID
   * @returns {Promise<Client>} SSH客户端
   */
  async createConnection(serverId) {
    let server = null;
    try {
      // 获取服务器信息
      server = await this.getServerInfo(serverId);
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
      
      // 优化的连接配置
      const connectConfig = {
        host: server.host,
        port: server.ssh_port || server.port || 22,
        username: server.username || 'root',
        readyTimeout: 25000, // 增加到25秒，适应代理环境
        keepaliveInterval: 15000, // 15秒心跳间隔
        keepaliveCountMax: 5, // 最大心跳失败次数
        // 启用压缩以提高网络性能
        compress: true,
        // 优化缓冲区大小
        windowSize: 2 * 1024 * 1024, // 2MB窗口
        packetSize: 32768, // 32KB包大小
        // 更宽松的算法配置，适应不同的网络环境
        algorithms: {
          kex: [
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384',
            'ecdh-sha2-nistp521',
            'diffie-hellman-group14-sha256',
            'diffie-hellman-group16-sha512',
            'diffie-hellman-group1-sha1', // 添加更多兼容性
            'diffie-hellman-group14-sha1'
          ],
          cipher: [
            'aes128-gcm',
            'aes256-gcm',
            'aes128-ctr',
            'aes192-ctr',
            'aes256-ctr',
            'aes128-cbc', // 添加CBC模式支持
            'aes192-cbc',
            'aes256-cbc'
          ],
          hmac: [
            'hmac-sha2-256',
            'hmac-sha2-512',
            'hmac-sha1'
          ]
        },
        // 调试选项（生产环境可关闭）
        debug: process.env.NODE_ENV === 'development' ? 
          (msg) => logger.debug(`SSH Debug [${server.name}]: ${msg}`) : undefined
      };

      // 添加认证信息
      if (credentials.password) {
        connectConfig.password = credentials.password;
      }
      if (credentials.privateKey) {
        connectConfig.privateKey = credentials.privateKey;
      }

      // 建立连接
      const connectionStartTime = Date.now();
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.destroy();
          const responseTime = Date.now() - connectionStartTime;
          sshPerformanceMonitor.recordConnectionEvent(serverId, 'connect_failure', responseTime, {
            reason: 'timeout',
            server: server.name
          });
          reject(new Error(`SSH连接超时: ${server.name} (${server.host}) - 可能是代理环境导致的延迟`));
        }, 35000); // 增加到35秒，适应代理环境

        client.on('ready', () => {
          clearTimeout(timeout);
          const responseTime = Date.now() - connectionStartTime;
          sshPerformanceMonitor.recordConnectionEvent(serverId, 'connect_success', responseTime, {
            server: server.name,
            host: server.host
          });
          logger.info(`SSH连接建立成功: ${server.name} (${server.host}) - 响应时间: ${responseTime}ms`);
          resolve();
        });

        client.on('error', (err) => {
          clearTimeout(timeout);
          const responseTime = Date.now() - connectionStartTime;
          sshPerformanceMonitor.recordConnectionEvent(serverId, 'connect_failure', responseTime, {
            reason: err.message,
            code: err.code,
            server: server.name
          });
          
          // 提供更详细的错误信息，帮助诊断代理相关问题
          const errorDetails = {
            error: err.message,
            code: err.code,
            level: err.level,
            description: err.description,
            reason: err.reason
          };
          
          // 检查是否是代理相关的错误
          if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
            errorDetails.suggestion = '可能是代理配置问题或网络连接问题';
          }
          
          logger.error(`SSH连接失败: ${server.name} (${server.host})`, errorDetails);
          reject(err);
        });

        client.on('close', () => {
          logger.debug(`SSH连接已关闭: ${server.name} (${server.host})`);
        });

        // 添加连接事件监听以提供更好的调试信息
        client.on('greeting', (msg) => {
          logger.debug(`SSH服务器问候: ${server.name} - ${msg}`);
        });

        client.on('banner', (msg) => {
          logger.debug(`SSH服务器横幅: ${server.name} - ${msg}`);
        });

        try {
          client.connect(connectConfig);
        } catch (connectError) {
          clearTimeout(timeout);
          logger.error(`SSH连接配置错误: ${server.name} (${server.host})`, connectError);
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
        isAlive: true,
        connectionQuality: 'good', // 初始连接质量
        commandCount: 0, // 执行的命令数量
        totalResponseTime: 0, // 总响应时间
        averageResponseTime: 0 // 平均响应时间
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
      // 使用诊断方法分析连接问题
      const diagnosis = server ? this.diagnoseConnectionIssue(error, server) : '服务器信息获取失败';
      
      logger.error(`创建SSH连接失败 (服务器 ${serverId}):`, {
        error: error.message,
        code: error.code,
        diagnosis: diagnosis,
        serverName: server?.name || '未知',
        serverHost: server?.host || '未知'
      });
      
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
    const startTime = Date.now();
    
    try {
      const client = await this.getConnection(serverId);
      const connectionInfo = this.connections.get(serverId);
      
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`命令执行超时: ${command}`));
        }, timeout);

        client.exec(command, { 
          pty: false, // 禁用PTY以获得更清洁的输出
          env: {
            LANG: 'en_US.UTF-8',
            LC_ALL: 'en_US.UTF-8'
          }
        }, (err, stream) => {
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
          let isCompleted = false;

          // 设置流编码
          stream.setEncoding('utf8');

          stream.on('data', (data) => {
            output += data;
          });

          stream.stderr.on('data', (data) => {
            errorOutput += data;
          });

          stream.on('close', (code, signal) => {
            if (isCompleted) return;
            isCompleted = true;
            
            clearTimeout(timeoutId);
            
            // 更新连接性能指标
            const responseTime = Date.now() - startTime;
            if (connectionInfo) {
              connectionInfo.lastUsed = Date.now();
              connectionInfo.commandCount++;
              connectionInfo.totalResponseTime += responseTime;
              connectionInfo.averageResponseTime = connectionInfo.totalResponseTime / connectionInfo.commandCount;
              
              // 更新连接质量评估
              if (responseTime < 500) {
                connectionInfo.connectionQuality = 'excellent';
              } else if (responseTime < 1500) {
                connectionInfo.connectionQuality = 'good';
              } else if (responseTime < 3000) {
                connectionInfo.connectionQuality = 'fair';
              } else {
                connectionInfo.connectionQuality = 'poor';
              }
            }
            
            // 清理输出
            const cleanedOutput = this.cleanCommandOutput(output);
            const cleanedError = this.cleanCommandOutput(errorOutput);
            
            if (code === 0) {
              // 记录成功的命令执行
              sshPerformanceMonitor.recordCommandEvent(serverId, 'command_success', responseTime, {
                command: command.substring(0, 50) + (command.length > 50 ? '...' : ''),
                outputLength: cleanedOutput.length
              });
              
              logger.debug(`SSH命令执行成功 (服务器 ${serverId}):`, {
                command: command.substring(0, 50) + (command.length > 50 ? '...' : ''),
                responseTime,
                outputLength: cleanedOutput.length
              });
              resolve(cleanedOutput);
            } else if (code === null) {
              // exitCode: null 是后台进程的正常现象，不是错误
              sshPerformanceMonitor.recordCommandEvent(serverId, 'command_success', responseTime, {
                command: command.substring(0, 50) + (command.length > 50 ? '...' : ''),
                outputLength: cleanedOutput.length,
                background: true
              });
              
              logger.debug(`SSH命令后台执行完成 (服务器 ${serverId}):`, {
                command: command.substring(0, 50) + (command.length > 50 ? '...' : ''),
                exitCode: code,
                signal,
                responseTime
              });
              resolve(cleanedOutput);
            } else {
              // 记录失败的命令执行
              sshPerformanceMonitor.recordCommandEvent(serverId, 'command_failure', responseTime, {
                command: command.substring(0, 50) + (command.length > 50 ? '...' : ''),
                exitCode: code,
                signal,
                error: cleanedError
              });
              
              const errorMsg = `命令执行失败 (退出码: ${code}${signal ? ', 信号: ' + signal : ''}): ${cleanedError || '未知错误'}`;
              logger.warn(`SSH命令执行失败 (服务器 ${serverId}):`, {
                command: command.substring(0, 50) + (command.length > 50 ? '...' : ''),
                exitCode: code,
                signal,
                errorOutput: cleanedError,
                responseTime
              });
              reject(new Error(errorMsg));
            }
          });

          stream.on('error', (streamErr) => {
            if (isCompleted) return;
            isCompleted = true;
            
            clearTimeout(timeoutId);
            logger.error(`SSH流错误 (服务器 ${serverId}):`, {
              command: command.substring(0, 50) + (command.length > 50 ? '...' : ''),
              error: streamErr.message
            });
            reject(streamErr);
          });
        });
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error(`执行SSH命令失败 (服务器 ${serverId}):`, {
        command: command.substring(0, 50) + (command.length > 50 ? '...' : ''),
        error: error.message,
        responseTime
      });
      throw error;
    }
  }

  /**
   * 清理命令输出
   * @param {string} output - 原始输出
   * @returns {string} - 清理后的输出
   */
  cleanCommandOutput(output) {
    if (!output) return '';
    
    return output
      // 移除ANSI转义序列
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      // 移除回车符
      .replace(/\r/g, '')
      // 移除多余的空行
      .replace(/\n{3,}/g, '\n\n')
      // 移除首尾空白
      .trim();
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
      if (!database.db) {
        logger.error(`数据库未连接 (服务器 ${serverId})`);
        return null;
      }
      
      const result = await database.db.get(
        'SELECT * FROM servers WHERE id = ? AND (is_active = 1 OR is_active = true)',
        [serverId]
      );
      
      if (!result) {
        logger.warn(`服务器不存在或未激活 (服务器 ${serverId})`);
        return null;
      }
      
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
    this.retryDelays.delete(serverId);
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
   * 启动自动恢复定时器
   */
  startAutoRecoveryTimer() {
    setInterval(() => {
      this.performAutoRecovery();
    }, this.autoRecoveryInterval);
  }

  /**
   * 执行自动恢复检查
   */
  async performAutoRecovery() {
    const now = Date.now();
    const recoveryPromises = [];
    
    for (const [serverId, failureInfo] of this.failedServers.entries()) {
      // 检查是否到了重试时间
      if (now >= failureInfo.nextRetry) {
        recoveryPromises.push(
          this.attemptServerRecovery(serverId, failureInfo)
        );
      }
    }
    
    // 并行执行恢复尝试
    if (recoveryPromises.length > 0) {
      await Promise.allSettled(recoveryPromises);
    }
  }

  /**
   * 尝试恢复单个服务器连接
   * @param {number} serverId - 服务器ID
   * @param {Object} failureInfo - 失败信息
   */
  async attemptServerRecovery(serverId, failureInfo) {
    try {
      logger.info(`尝试自动恢复服务器 ${serverId} 连接 (失败次数: ${failureInfo.failureCount})`);
      
      // 尝试执行一个简单的命令来测试连接
      await this.executeCommand(serverId, 'echo "recovery test"', 10000);
      
      // 恢复成功，从失败列表中移除
      this.failedServers.delete(serverId);
      logger.info(`服务器 ${serverId} 自动恢复成功`);
      
    } catch (error) {
      // 恢复失败，更新失败信息
      const nextRetryDelay = Math.min(
        failureInfo.failureCount * 2 * 60 * 1000, // 指数退避：2分钟, 4分钟, 8分钟...
        30 * 60 * 1000 // 最大30分钟
      );
      
      failureInfo.failureCount += 1;
      failureInfo.lastFailure = Date.now();
      failureInfo.nextRetry = Date.now() + nextRetryDelay;
      
      logger.warn(`服务器 ${serverId} 自动恢复失败，将在 ${Math.ceil(nextRetryDelay / 60000)} 分钟后重试`, {
        failureCount: failureInfo.failureCount,
        error: error.message
      });
    }
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
    const now = Date.now();
    const heartbeatPromises = [];
    
    for (const [serverId, connectionInfo] of this.connections.entries()) {
      // 跳过最近使用过的连接（避免频繁心跳）
      if (now - connectionInfo.lastUsed < 60000) { // 1分钟内使用过的连接跳过
        continue;
      }
      
      heartbeatPromises.push(
        this.performSingleHeartbeat(serverId, connectionInfo)
      );
    }
    
    // 并行执行心跳检测
    if (heartbeatPromises.length > 0) {
      await Promise.allSettled(heartbeatPromises);
    }
  }

  /**
   * 执行单个服务器的心跳检测
   * @param {number} serverId - 服务器ID
   * @param {Object} connectionInfo - 连接信息
   */
  async performSingleHeartbeat(serverId, connectionInfo) {
    try {
      // 发送简单的命令来保持连接活跃
      await this.executeCommand(serverId, 'echo "keepalive"', 5000);
      connectionInfo.lastUsed = Date.now();
      logger.debug(`心跳检测成功: 服务器 ${serverId}`);
    } catch (error) {
      logger.warn(`心跳检测失败，关闭连接: 服务器 ${serverId}`, {
        error: error.message,
        serverName: connectionInfo.serverName,
        host: connectionInfo.host
      });
      
      // 关闭失效的连接
      this.closeConnection(serverId);
      
      // 如果是代理相关的问题，记录诊断信息
      if (error.message.includes('超时') || error.message.includes('timeout')) {
        logger.warn(`服务器 ${serverId} 心跳超时，可能是代理环境问题`);
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
        connectionAttempts: Object.fromEntries(
          Array.from(this.connectionAttempts.entries()).map(([serverId, info]) => [
            serverId, 
            { 
              count: info.count, 
              lastAttempt: info.lastAttempt, 
              resetTime: info.resetTime,
              timeUntilReset: Math.max(0, this.connectionResetInterval - (Date.now() - info.resetTime))
            }
          ])
        ),
        totalQueuedCommands,
        queueStats,
        failedServers: Object.fromEntries(
          Array.from(this.failedServers.entries()).map(([serverId, info]) => [
            serverId,
            {
              failureCount: info.failureCount,
              lastFailure: info.lastFailure,
              nextRetry: info.nextRetry,
              timeUntilRetry: Math.max(0, info.nextRetry - Date.now())
            }
          ])
        ),
        autoRecoveryEnabled: true,
        autoRecoveryInterval: this.autoRecoveryInterval
      }
    };
  }

  /**
   * 重置连接尝试次数
   * @param {number} serverId - 服务器ID
   */
  resetConnectionAttempts(serverId) {
    this.connectionAttempts.delete(serverId);
    this.retryDelays.delete(serverId);
    logger.debug(`重置服务器 ${serverId} 的连接尝试次数`);
  }

  /**
   * 强制重置服务器连接状态（用于紧急恢复）
   * @param {number} serverId - 服务器ID
   */
  forceResetServerConnection(serverId) {
    // 关闭现有连接
    this.closeConnection(serverId);
    
    // 重置所有相关状态
    this.connectionAttempts.delete(serverId);
    this.retryDelays.delete(serverId);
    this.clearCommandQueue(serverId);
    
    logger.info(`强制重置服务器 ${serverId} 的连接状态`);
  }

  /**
   * 清理所有连接尝试记录
   */
  clearAllConnectionAttempts() {
    this.connectionAttempts.clear();
    this.retryDelays.clear();
    this.failedServers.clear();
    logger.info('已清理所有连接尝试记录和失败服务器记录');
  }

  /**
   * 清理过期的连接尝试记录
   */
  cleanupConnectionAttempts() {
    const now = Date.now();
    const toRemove = [];
    
    for (const [serverId, attemptInfo] of this.connectionAttempts.entries()) {
      // 如果超过重置间隔，标记为需要清理
      if (now - attemptInfo.resetTime > this.connectionResetInterval) {
        toRemove.push(serverId);
      }
    }
    
    // 清理过期的记录
    toRemove.forEach(serverId => {
      this.connectionAttempts.delete(serverId);
      this.retryDelays.delete(serverId);
      logger.debug(`清理过期的连接尝试记录: 服务器 ${serverId}`);
    });
    
    // 清理过期的失败服务器记录（超过24小时）
    const failedServerTimeout = 24 * 60 * 60 * 1000; // 24小时
    const failedToRemove = [];
    for (const [serverId, failureInfo] of this.failedServers.entries()) {
      if (now - failureInfo.lastFailure > failedServerTimeout) {
        failedToRemove.push(serverId);
      }
    }
    
    failedToRemove.forEach(serverId => {
      this.failedServers.delete(serverId);
      logger.debug(`清理过期的失败服务器记录: 服务器 ${serverId}`);
    });
    
    if (toRemove.length > 0 || failedToRemove.length > 0) {
      logger.info(`清理了 ${toRemove.length} 个过期的连接尝试记录和 ${failedToRemove.length} 个过期的失败服务器记录`);
    }
    
    if (this.connectionAttempts.size > 0) {
      logger.debug(`当前连接尝试记录: ${this.connectionAttempts.size} 个服务器`);
    }
    
    if (this.failedServers.size > 0) {
      logger.debug(`当前失败服务器记录: ${this.failedServers.size} 个服务器`);
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
