import { Client } from 'ssh2';
import logger from '../utils/logger.js';
import { getOptimizedSSHConfig } from '../utils/sshConfig.js';
import encryption from '../utils/encryption.js';

class SSHSessionService {
  constructor() {
    this.sessions = new Map(); // 存储活跃的SSH会话
    this.cleanupInterval = null;
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
      const conn = new Client();

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          conn.end();
          reject(new Error('SSH连接超时'));
        }, 30000);

        conn.on('ready', () => {
          clearTimeout(timeout);
          
          // 创建shell会话
          conn.shell((err, stream) => {
            if (err) {
              conn.end();
              reject(err);
              return;
            }

            // 存储会话信息
            this.sessions.set(sessionId, {
              connection: conn,
              stream: stream,
              serverConfig: serverConfig,
              createdAt: Date.now(),
              lastActivity: Date.now(),
              currentPath: '/root' // 默认路径
            });

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

        conn.connect(sshConfig);
      });
    } catch (error) {
      logger.error(`创建SSH会话失败: ${sessionId}`, error);
      throw error;
    }
  }

  /**
   * 在SSH会话中执行命令
   * @param {string} sessionId - 会话ID
   * @param {string} command - 要执行的命令
   */
  async executeCommand(sessionId, command) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('SSH会话不存在');
    }

    return new Promise((resolve, reject) => {
      const { stream } = session;
      let output = '';
      let errorOutput = '';

      // 设置超时
      const timeout = setTimeout(() => {
        reject(new Error('命令执行超时'));
      }, 30000);

      // 监听数据输出
      const onData = (data) => {
        output += data.toString();
      };

      const onStderr = (data) => {
        errorOutput += data.toString();
      };

      // 添加事件监听器
      stream.on('data', onData);
      stream.stderr.on('data', onStderr);

      // 发送命令
      stream.write(command + '\n');

      // 等待命令执行完成（通过检测提示符）
      const checkCompletion = () => {
        // 简单的提示符检测逻辑
        if (output.includes('$ ') || output.includes('# ')) {
          clearTimeout(timeout);
          stream.removeListener('data', onData);
          stream.stderr.removeListener('data', onStderr);
          
          // 更新会话活动时间
          session.lastActivity = Date.now();
          
          // 更新当前路径（如果是cd命令）
          if (command.trim().startsWith('cd ')) {
            this.updateCurrentPath(sessionId);
          }

          resolve({
            command,
            output: output.trim(),
            error: errorOutput.trim(),
            timestamp: new Date()
          });
        } else {
          // 继续等待
          setTimeout(checkCompletion, 100);
        }
      };

      // 开始检查
      setTimeout(checkCompletion, 500);
    });
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
        session.currentPath = result.output.trim();
      }
    } catch (error) {
      logger.warn(`更新当前路径失败: ${sessionId}`, error);
    }
  }

  /**
   * 获取会话信息
   * @param {string} sessionId - 会话ID
   */
  getSessionInfo(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      sessionId,
      serverName: session.serverConfig.name,
      currentPath: session.currentPath,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity
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
        session.connection.end();
        this.sessions.delete(sessionId);
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
    const expireTime = 30 * 60 * 1000; // 30分钟过期

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > expireTime) {
        logger.info(`清理过期SSH会话: ${sessionId}`);
        this.closeSession(sessionId);
      }
    }

    logger.info(`当前活跃SSH会话数量: ${this.sessions.size}`);
  }

  /**
   * 获取服务统计
   */
  getStats() {
    return {
      activeSessions: this.sessions.size,
      timestamp: Date.now()
    };
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
