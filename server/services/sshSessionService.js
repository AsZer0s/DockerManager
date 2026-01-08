import { Client } from 'ssh2';
import logger from '../utils/logger.js';
import { getOptimizedSSHConfig } from '../utils/sshConfig.js';
import encryption from '../utils/encryption.js';

class SSHSessionService {
  constructor() {
    this.sessions = new Map(); // 存储活跃的SSH会话
    this.cleanupInterval = null;
    this.commandHistory = new Map(); // 存储命令历史
    this.sessionMetrics = new Map(); // 存储会话性能指标
  }

  /**
   * 初始化SSH会话服务
   */
  initialize() {
    // 启动清理任务，定期清理过期的会话
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000); // 每5分钟清理一次

    logger.info('SSH会话服务初始化完成');
  }

  /**
   * 创建SSH会话
   * @param {string} sessionId - 会话ID
   * @param {Object} serverConfig - 服务器配置
   */
  async createSession(sessionId, serverConfig) {
    try {
      // 如果会话已存在，先关闭
      if (this.sessions.has(sessionId)) {
        await this.closeSession(sessionId);
      }

      const sshConfig = getOptimizedSSHConfig(serverConfig);
      
      // 增强SSH配置以提高性能和稳定性
      const enhancedConfig = {
        ...sshConfig,
        // 增加缓冲区大小以提高性能
        readyTimeout: 20000, // 20秒连接超时
        keepaliveInterval: 15000, // 15秒心跳间隔
        keepaliveCountMax: 5, // 最大心跳失败次数
        // 启用压缩以提高网络性能
        compress: true,
        // 优化窗口大小
        windowSize: 2 * 1024 * 1024, // 2MB窗口
        packetSize: 32768, // 32KB包大小
        // 更宽松的算法配置以提高兼容性
        algorithms: {
          kex: [
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384',
            'ecdh-sha2-nistp521',
            'diffie-hellman-group14-sha256',
            'diffie-hellman-group16-sha512',
            'diffie-hellman-group14-sha1'
          ],
          cipher: [
            'aes128-gcm',
            'aes256-gcm',
            'aes128-ctr',
            'aes192-ctr',
            'aes256-ctr',
            'aes128-cbc',
            'aes192-cbc',
            'aes256-cbc'
          ],
          hmac: [
            'hmac-sha2-256',
            'hmac-sha2-512',
            'hmac-sha1'
          ]
        }
      };

      const conn = new Client();

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          conn.end();
          reject(new Error('SSH连接超时'));
        }, enhancedConfig.readyTimeout);

        conn.on('ready', () => {
          clearTimeout(timeout);
          
          // 创建shell会话，启用PTY以获得更好的终端体验
          conn.shell({
            term: 'xterm-256color',
            cols: 120,
            rows: 30,
            width: 1920,
            height: 1080
          }, (err, stream) => {
            if (err) {
              conn.end();
              reject(err);
              return;
            }

            // 初始化命令历史
            this.commandHistory.set(sessionId, []);
            
            // 初始化会话性能指标
            this.sessionMetrics.set(sessionId, {
              commandCount: 0,
              totalResponseTime: 0,
              averageResponseTime: 0,
              lastCommandTime: 0,
              connectionQuality: 'good'
            });

            // 存储会话信息
            this.sessions.set(sessionId, {
              connection: conn,
              stream: stream,
              serverConfig: serverConfig,
              createdAt: Date.now(),
              lastActivity: Date.now(),
              currentPath: '/root', // 默认路径
              environment: {}, // 环境变量
              isReady: false, // 是否准备好接收命令
              outputBuffer: '', // 输出缓冲区
              promptPattern: /[\$#]\s*$/, // 提示符模式
              encoding: 'utf8'
            });

            // 设置流编码
            stream.setEncoding('utf8');

            // 监听初始输出以检测提示符
            const initialOutputHandler = (data) => {
              const session = this.sessions.get(sessionId);
              if (session) {
                session.outputBuffer += data;
                
                // 检测到提示符，标记会话为就绪状态
                if (session.promptPattern.test(session.outputBuffer)) {
                  session.isReady = true;
                  stream.removeListener('data', initialOutputHandler);
                  
                  // 发送初始化命令以优化终端体验
                  this.initializeTerminal(sessionId);
                }
              }
            };

            stream.on('data', initialOutputHandler);

            // 设置超时检测会话就绪状态
            setTimeout(() => {
              const session = this.sessions.get(sessionId);
              if (session && !session.isReady) {
                session.isReady = true; // 强制标记为就绪
                stream.removeListener('data', initialOutputHandler);
                this.initializeTerminal(sessionId);
              }
            }, 3000); // 3秒后强制就绪

            logger.info(`SSH会话创建成功: ${sessionId}`);
            resolve({
              sessionId,
              message: 'SSH会话创建成功'
            });
          });
        });

        conn.on('error', (err) => {
          clearTimeout(timeout);
          logger.error(`SSH连接失败: ${sessionId}`, err);
          reject(err);
        });

        conn.on('close', () => {
          logger.info(`SSH连接已关闭: ${sessionId}`);
          this.sessions.delete(sessionId);
          this.commandHistory.delete(sessionId);
          this.sessionMetrics.delete(sessionId);
        });

        conn.connect(enhancedConfig);
      });
    } catch (error) {
      logger.error(`创建SSH会话失败: ${sessionId}`, error);
      throw error;
    }
  }

  /**
   * 初始化终端环境
   * @param {string} sessionId - 会话ID
   */
  async initializeTerminal(sessionId) {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) return;

      // 发送初始化命令以优化终端体验
      const initCommands = [
        'export TERM=xterm-256color', // 设置终端类型
        'export LANG=en_US.UTF-8', // 设置语言环境
        'stty -echo', // 暂时禁用回显以避免重复显示
        'PS1="\\u@\\h:\\w\\$ "', // 设置简洁的提示符
        'stty echo', // 重新启用回显
        'clear' // 清屏
      ];

      for (const cmd of initCommands) {
        session.stream.write(cmd + '\n');
        await new Promise(resolve => setTimeout(resolve, 100)); // 短暂延迟
      }

      // 获取当前工作目录
      await this.updateCurrentPath(sessionId);
      
      logger.debug(`终端初始化完成: ${sessionId}`);
    } catch (error) {
      logger.warn(`终端初始化失败: ${sessionId}`, error);
    }
  }

  /**
   * 智能清理终端输出
   * @param {string} text - 原始文本
   * @param {string} command - 执行的命令
   * @returns {string} - 清理后的文本
   */
  cleanTerminalOutput(text, command = '') {
    if (!text) return '';
    
    let cleaned = text;
    
    // 移除 ANSI 转义序列（保留颜色代码）
    cleaned = cleaned
      // 移除 bracketed paste mode 序列
      .replace(/\x1b\[\?2004[hl]/g, '')
      // 移除光标控制序列
      .replace(/\x1b\[[0-9]*[ABCD]/g, '')
      // 移除清屏序列
      .replace(/\x1b\[2J/g, '')
      // 移除光标位置序列
      .replace(/\x1b\[[0-9;]*H/g, '')
      // 移除其他控制序列（但保留颜色）
      .replace(/\x1b\[[0-9;]*[JKmsu]/g, '')
      // 统一换行符
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    // 智能移除命令回显
    if (command) {
      const lines = cleaned.split('\n');
      const commandLines = command.split('\n');
      
      // 移除开头的命令回显行
      let startIndex = 0;
      for (let i = 0; i < Math.min(lines.length, commandLines.length + 2); i++) {
        const line = lines[i].trim();
        if (line === command.trim() || 
            line.endsWith(command.trim()) ||
            commandLines.some(cmdLine => line.includes(cmdLine.trim()))) {
          startIndex = i + 1;
          break;
        }
      }
      
      // 移除结尾的提示符行
      let endIndex = lines.length;
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.match(/[\$#]\s*$/) || line.match(/.*@.*:.*[\$#]\s*$/)) {
          endIndex = i;
          break;
        }
      }
      
      cleaned = lines.slice(startIndex, endIndex).join('\n');
    }
    
    // 移除多余的空行
    cleaned = cleaned
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    return cleaned;
  }

  /**
   * 在SSH会话中执行命令（优化版）
   * @param {string} sessionId - 会话ID
   * @param {string} command - 要执行的命令
   */
  async executeCommand(sessionId, command) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('SSH会话不存在');
    }

    if (!session.isReady) {
      throw new Error('SSH会话尚未就绪，请稍后重试');
    }

    const startTime = Date.now();
    const metrics = this.sessionMetrics.get(sessionId);

    return new Promise((resolve, reject) => {
      const { stream } = session;
      let output = '';
      let errorOutput = '';
      let isCompleted = false;

      // 设置超时
      const timeout = setTimeout(() => {
        if (!isCompleted) {
          isCompleted = true;
          reject(new Error('命令执行超时'));
        }
      }, 60000); // 60秒超时

      // 创建唯一的命令标识符
      const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      
      // 监听数据输出
      const onData = (data) => {
        output += data;
        
        // 检测命令完成（通过提示符模式）
        if (session.promptPattern.test(output)) {
          if (!isCompleted) {
            isCompleted = true;
            clearTimeout(timeout);
            stream.removeListener('data', onData);
            
            // 更新会话活动时间
            session.lastActivity = Date.now();
            
            // 更新性能指标
            const responseTime = Date.now() - startTime;
            metrics.commandCount++;
            metrics.totalResponseTime += responseTime;
            metrics.averageResponseTime = metrics.totalResponseTime / metrics.commandCount;
            metrics.lastCommandTime = responseTime;
            
            // 评估连接质量
            if (responseTime < 1000) {
              metrics.connectionQuality = 'excellent';
            } else if (responseTime < 3000) {
              metrics.connectionQuality = 'good';
            } else if (responseTime < 5000) {
              metrics.connectionQuality = 'fair';
            } else {
              metrics.connectionQuality = 'poor';
            }
            
            // 添加到命令历史
            const history = this.commandHistory.get(sessionId);
            history.push({
              command: command.trim(),
              timestamp: new Date(),
              responseTime,
              success: true
            });
            
            // 限制历史记录数量
            if (history.length > 100) {
              history.shift();
            }
            
            // 更新当前路径（如果是cd命令）
            if (command.trim().startsWith('cd ')) {
              this.updateCurrentPath(sessionId);
            }

            // 清理输出
            const cleanedOutput = this.cleanTerminalOutput(output, command);
            
            resolve({
              command: command.trim(),
              output: cleanedOutput,
              error: errorOutput,
              timestamp: new Date(),
              responseTime,
              commandId
            });
          }
        }
      };

      // 添加事件监听器
      stream.on('data', onData);

      // 发送命令
      try {
        stream.write(command.trim() + '\n');
      } catch (writeError) {
        clearTimeout(timeout);
        stream.removeListener('data', onData);
        reject(new Error(`命令发送失败: ${writeError.message}`));
      }
    });
  }

  /**
   * 批量执行命令
   * @param {string} sessionId - 会话ID
   * @param {Array} commands - 命令数组
   */
  async executeBatchCommands(sessionId, commands) {
    const results = [];
    
    for (const command of commands) {
      try {
        const result = await this.executeCommand(sessionId, command);
        results.push(result);
        
        // 短暂延迟以避免命令冲突
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        results.push({
          command,
          error: error.message,
          timestamp: new Date()
        });
      }
    }
    
    return results;
  }

  /**
   * 发送原始数据到终端（用于特殊按键处理）
   * @param {string} sessionId - 会话ID
   * @param {string} data - 原始数据
   */
  sendRawData(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('SSH会话不存在');
    }

    session.stream.write(data);
    session.lastActivity = Date.now();
  }

  /**
   * 调整终端大小
   * @param {string} sessionId - 会话ID
   * @param {number} cols - 列数
   * @param {number} rows - 行数
   */
  resizeTerminal(sessionId, cols, rows) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('SSH会话不存在');
    }

    try {
      session.stream.setWindow(rows, cols);
      logger.debug(`终端大小已调整: ${sessionId} (${cols}x${rows})`);
    } catch (error) {
      logger.warn(`调整终端大小失败: ${sessionId}`, error);
    }
  }

  /**
   * 更新当前路径
   * @param {string} sessionId - 会话ID
   */
  async updateCurrentPath(sessionId) {
    try {
      const result = await this.executeCommand(sessionId, 'pwd');
      const session = this.sessions.get(sessionId);
      if (session && result.output) {
        const path = result.output.trim();
        if (path && path.startsWith('/')) {
          session.currentPath = path;
        }
      }
    } catch (error) {
      logger.warn(`更新当前路径失败: ${sessionId}`, error);
    }
  }

  /**
   * 获取命令历史
   * @param {string} sessionId - 会话ID
   * @param {number} limit - 限制数量
   */
  getCommandHistory(sessionId, limit = 20) {
    const history = this.commandHistory.get(sessionId) || [];
    return history.slice(-limit);
  }

  /**
   * 获取会话性能指标
   * @param {string} sessionId - 会话ID
   */
  getSessionMetrics(sessionId) {
    return this.sessionMetrics.get(sessionId) || null;
  }

  /**
   * 获取会话信息（增强版）
   * @param {string} sessionId - 会话ID
   */
  getSessionInfo(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const metrics = this.sessionMetrics.get(sessionId);
    const history = this.commandHistory.get(sessionId) || [];

    return {
      sessionId,
      serverName: session.serverConfig.name,
      serverHost: session.serverConfig.host,
      currentPath: session.currentPath,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      isReady: session.isReady,
      commandCount: history.length,
      metrics: metrics,
      recentCommands: history.slice(-5) // 最近5个命令
    };
  }

  /**
   * 关闭SSH会话
   * @param {string} sessionId - 会话ID
   */
  async closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        // 发送退出命令
        if (session.stream && !session.stream.destroyed) {
          session.stream.write('exit\n');
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        session.connection.end();
        this.sessions.delete(sessionId);
        this.commandHistory.delete(sessionId);
        this.sessionMetrics.delete(sessionId);
        logger.info(`SSH会话已关闭: ${sessionId}`);
      } catch (error) {
        logger.error(`关闭SSH会话失败: ${sessionId}`, error);
      }
    }
  }

  /**
   * 清理过期的会话
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    const expireTime = 60 * 60 * 1000; // 60分钟过期

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > expireTime) {
        logger.info(`清理过期SSH会话: ${sessionId}`);
        this.closeSession(sessionId);
      }
    }

    logger.debug(`当前活跃SSH会话数量: ${this.sessions.size}`);
  }

  /**
   * 获取服务统计（增强版）
   */
  getStats() {
    const sessions = Array.from(this.sessions.values());
    const totalCommands = Array.from(this.commandHistory.values())
      .reduce((sum, history) => sum + history.length, 0);
    
    const avgResponseTime = Array.from(this.sessionMetrics.values())
      .reduce((sum, metrics, index, array) => {
        return sum + (metrics.averageResponseTime || 0) / array.length;
      }, 0);

    return {
      activeSessions: this.sessions.size,
      totalCommands,
      averageResponseTime: Math.round(avgResponseTime),
      connectionQuality: this.getOverallConnectionQuality(),
      timestamp: Date.now()
    };
  }

  /**
   * 获取整体连接质量
   */
  getOverallConnectionQuality() {
    const qualities = Array.from(this.sessionMetrics.values())
      .map(metrics => metrics.connectionQuality);
    
    if (qualities.length === 0) return 'unknown';
    
    const qualityScores = {
      'excellent': 4,
      'good': 3,
      'fair': 2,
      'poor': 1
    };
    
    const avgScore = qualities.reduce((sum, quality) => 
      sum + (qualityScores[quality] || 0), 0) / qualities.length;
    
    if (avgScore >= 3.5) return 'excellent';
    if (avgScore >= 2.5) return 'good';
    if (avgScore >= 1.5) return 'fair';
    return 'poor';
  }

  /**
   * 销毁服务
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // 关闭所有会话
    for (const sessionId of this.sessions.keys()) {
      this.closeSession(sessionId);
    }

    logger.info('SSH会话服务已销毁');
  }
}

export default new SSHSessionService();
