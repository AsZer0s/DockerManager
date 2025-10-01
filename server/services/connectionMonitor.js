import logger from '../utils/logger.js';
import database from '../config/database.js';
import { executeSSHCommand } from '../utils/sshConfig.js';

/**
 * 连接监控服务
 * 监控各种连接的健康状态，提供自动恢复机制
 */
class ConnectionMonitor {
  constructor() {
    this.isRunning = false;
    this.healthChecks = new Map();
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 5;
    this.checkInterval = 30000; // 30秒检查一次
  }

  /**
   * 启动连接监控
   */
  start() {
    if (this.isRunning) {
      logger.warn('连接监控已在运行');
      return;
    }

    this.isRunning = true;
    logger.info('启动连接监控服务');

    // 注册健康检查
    this.registerHealthChecks();

    // 开始定期检查
    this.startHealthChecks();
  }

  /**
   * 停止连接监控
   */
  stop() {
    this.isRunning = false;
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    logger.info('连接监控服务已停止');
  }

  /**
   * 注册健康检查
   */
  registerHealthChecks() {
    // 数据库连接检查
    this.healthChecks.set('database', {
      name: '数据库连接',
      check: this.checkDatabaseConnection.bind(this),
      autoRecover: true,
      critical: true
    });

    // WebSocket连接检查
    this.healthChecks.set('websocket', {
      name: 'WebSocket服务',
      check: this.checkWebSocketService.bind(this),
      autoRecover: false,
      critical: false
    });

    // SSH连接池检查
    this.healthChecks.set('ssh_pool', {
      name: 'SSH连接池',
      check: this.checkSSHPool.bind(this),
      autoRecover: true,
      critical: false
    });
  }

  /**
   * 开始健康检查
   */
  startHealthChecks() {
    this.healthCheckTimer = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.performHealthChecks();
      } catch (error) {
        logger.error('健康检查执行失败:', error);
      }
    }, this.checkInterval);
  }

  /**
   * 执行所有健康检查
   */
  async performHealthChecks() {
    const results = [];

    for (const [key, healthCheck] of this.healthChecks) {
      try {
        const isHealthy = await healthCheck.check();
        results.push({
          service: key,
          name: healthCheck.name,
          healthy: isHealthy,
          timestamp: new Date()
        });

        if (!isHealthy && healthCheck.autoRecover) {
          await this.attemptRecovery(key, healthCheck);
        }
      } catch (error) {
        logger.error(`健康检查失败 [${healthCheck.name}]:`, error);
        results.push({
          service: key,
          name: healthCheck.name,
          healthy: false,
          error: error.message,
          timestamp: new Date()
        });
      }
    }

    // 记录健康状态
    this.logHealthStatus(results);
  }

  /**
   * 检查数据库连接
   */
  async checkDatabaseConnection() {
    try {
      if (!database.isConnected) {
        return false;
      }

      // 执行简单查询测试连接
      await database.query('SELECT 1 as test');
      return true;
    } catch (error) {
      logger.error('数据库连接检查失败:', error);
      return false;
    }
  }

  /**
   * 检查WebSocket服务
   */
  async checkWebSocketService() {
    try {
      // 这里可以添加WebSocket服务的健康检查逻辑
      // 例如检查活跃连接数、内存使用等
      return true;
    } catch (error) {
      logger.error('WebSocket服务检查失败:', error);
      return false;
    }
  }

  /**
   * 检查SSH连接池
   */
  async checkSSHPool() {
    try {
      // 这里可以添加SSH连接池的健康检查逻辑
      // 例如检查活跃连接数、连接超时等
      return true;
    } catch (error) {
      logger.error('SSH连接池检查失败:', error);
      return false;
    }
  }

  /**
   * 尝试恢复服务
   */
  async attemptRecovery(serviceKey, healthCheck) {
    const attempts = this.reconnectAttempts.get(serviceKey) || 0;

    if (attempts >= this.maxReconnectAttempts) {
      logger.error(`服务恢复失败，已达到最大重试次数 [${healthCheck.name}]`);
      return false;
    }

    try {
      logger.info(`尝试恢复服务 [${healthCheck.name}] (尝试 ${attempts + 1}/${this.maxReconnectAttempts})`);

      let recovered = false;

      switch (serviceKey) {
        case 'database':
          recovered = await this.recoverDatabase();
          break;
        case 'ssh_pool':
          recovered = await this.recoverSSHPool();
          break;
        default:
          logger.warn(`未知的服务恢复类型: ${serviceKey}`);
          return false;
      }

      if (recovered) {
        this.reconnectAttempts.delete(serviceKey);
        logger.info(`服务恢复成功 [${healthCheck.name}]`);
        return true;
      } else {
        this.reconnectAttempts.set(serviceKey, attempts + 1);
        return false;
      }
    } catch (error) {
      logger.error(`服务恢复失败 [${healthCheck.name}]:`, error);
      this.reconnectAttempts.set(serviceKey, attempts + 1);
      return false;
    }
  }

  /**
   * 恢复数据库连接
   */
  async recoverDatabase() {
    try {
      if (database.isConnected) {
        await database.disconnect();
      }
      await database.connect();
      return true;
    } catch (error) {
      logger.error('数据库恢复失败:', error);
      return false;
    }
  }

  /**
   * 恢复SSH连接池
   */
  async recoverSSHPool() {
    try {
      // 这里可以添加SSH连接池的恢复逻辑
      // 例如清理无效连接、重新初始化连接池等
      return true;
    } catch (error) {
      logger.error('SSH连接池恢复失败:', error);
      return false;
    }
  }

  /**
   * 记录健康状态
   */
  logHealthStatus(results) {
    const healthyCount = results.filter(r => r.healthy).length;
    const totalCount = results.length;

    if (healthyCount === totalCount) {
      logger.debug(`所有服务健康 (${healthyCount}/${totalCount})`);
    } else {
      const unhealthyServices = results.filter(r => !r.healthy);
      logger.warn(`服务健康状态: ${healthyCount}/${totalCount}`, {
        unhealthy: unhealthyServices.map(s => ({
          service: s.service,
          name: s.name,
          error: s.error
        }))
      });
    }
  }

  /**
   * 获取健康状态报告
   */
  async getHealthReport() {
    const results = [];

    for (const [key, healthCheck] of this.healthChecks) {
      try {
        const isHealthy = await healthCheck.check();
        results.push({
          service: key,
          name: healthCheck.name,
          healthy: isHealthy,
          critical: healthCheck.critical,
          autoRecover: healthCheck.autoRecover,
          reconnectAttempts: this.reconnectAttempts.get(key) || 0,
          timestamp: new Date()
        });
      } catch (error) {
        results.push({
          service: key,
          name: healthCheck.name,
          healthy: false,
          critical: healthCheck.critical,
          autoRecover: healthCheck.autoRecover,
          error: error.message,
          reconnectAttempts: this.reconnectAttempts.get(key) || 0,
          timestamp: new Date()
        });
      }
    }

    return {
      overall: results.every(r => r.healthy),
      services: results,
      timestamp: new Date()
    };
  }

  /**
   * 手动触发健康检查
   */
  async triggerHealthCheck() {
    logger.info('手动触发健康检查');
    await this.performHealthChecks();
  }

  /**
   * 重置重连计数器
   */
  resetReconnectAttempts(serviceKey) {
    this.reconnectAttempts.delete(serviceKey);
    logger.info(`重置重连计数器 [${serviceKey}]`);
  }
}

export default new ConnectionMonitor();
