import logger from '../utils/logger.js';
import dockerService from './dockerService.js';
import monitoringService from './monitoringService.js';

class PollingService {
  constructor() {
    this.subscribers = new Map(); // 存储订阅者信息
    this.dataCache = new Map(); // 缓存最新数据
    this.cleanupInterval = null;
  }

  /**
   * 初始化轮询服务
   */
  initialize() {
    // 启动清理任务，定期清理过期的订阅者
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSubscribers();
    }, 30000); // 每30秒清理一次

    logger.info('HTTP轮询服务初始化完成');
  }

  /**
   * 订阅实时数据
   * @param {string} userId - 用户ID
   * @param {string} sessionId - 会话ID
   * @param {Array} subscriptions - 订阅的数据类型
   */
  subscribe(userId, sessionId, subscriptions = []) {
    const subscriber = {
      userId,
      sessionId,
      subscriptions,
      lastAccess: Date.now(),
      active: true
    };

    this.subscribers.set(sessionId, subscriber);
    logger.info(`用户 ${userId} 订阅实时数据: ${subscriptions.join(', ')}`);
    
    return sessionId;
  }

  /**
   * 取消订阅
   * @param {string} sessionId - 会话ID
   */
  unsubscribe(sessionId) {
    if (this.subscribers.has(sessionId)) {
      const subscriber = this.subscribers.get(sessionId);
      logger.info(`用户 ${subscriber.userId} 取消订阅`);
      this.subscribers.delete(sessionId);
    }
  }

  /**
   * 获取实时数据
   * @param {string} sessionId - 会话ID
   * @param {Array} dataTypes - 需要的数据类型
   */
  async getData(sessionId, dataTypes = []) {
    const subscriber = this.subscribers.get(sessionId);
    if (!subscriber) {
      throw new Error('未找到订阅者');
    }

    // 更新最后访问时间
    subscriber.lastAccess = Date.now();

    const data = {};
    
    try {
      // 获取系统状态
      if (dataTypes.includes('system') || dataTypes.length === 0) {
        data.system = await this.getSystemStats();
      }

      // 获取服务器列表
      if (dataTypes.includes('servers') || dataTypes.length === 0) {
        data.servers = await this.getServersList(subscriber.userId);
      }

      // 获取容器状态
      if (dataTypes.includes('containers') || dataTypes.length === 0) {
        data.containers = await this.getContainersStatus(subscriber.userId);
      }

      // 获取监控数据
      if (dataTypes.includes('monitoring') || dataTypes.length === 0) {
        data.monitoring = await this.getMonitoringData();
      }

      // 缓存数据
      this.dataCache.set(sessionId, {
        data,
        timestamp: Date.now()
      });

      return data;
    } catch (error) {
      logger.error('获取实时数据失败:', error);
      throw error;
    }
  }

  /**
   * 获取系统统计信息
   */
  async getSystemStats() {
    try {
      const monitoringStatus = monitoringService.getStatus();
      const stats = {
        timestamp: Date.now(),
        monitoring: monitoringStatus
      };
      return stats;
    } catch (error) {
      logger.error('获取系统统计失败:', error);
      return { error: '获取系统统计失败' };
    }
  }

  /**
   * 获取服务器列表
   */
  async getServersList(userId) {
    try {
      const database = (await import('../config/database.js')).default;
      
      // 确保数据库连接
      if (!database.isConnected) {
        await database.connect();
      }
      
      const result = await database.query(`
        SELECT s.*, p.can_view, p.can_control, p.can_ssh, p.hide_sensitive_info
        FROM servers s
        LEFT JOIN permissions p ON s.id = p.server_id AND p.user_id = ?
        WHERE s.is_active = true
        ORDER BY s.created_at DESC
      `, [userId]);

      return result.map(server => ({
        ...server,
        password_encrypted: server.hide_sensitive_info ? '[隐藏]' : server.password_encrypted,
        private_key_encrypted: server.hide_sensitive_info ? '[隐藏]' : server.private_key_encrypted
      }));
    } catch (error) {
      logger.error('获取服务器列表失败:', error);
      return { error: '获取服务器列表失败' };
    }
  }

  /**
   * 获取容器状态
   */
  async getContainersStatus(userId) {
    try {
      const database = (await import('../config/database.js')).default;
      
      // 确保数据库连接
      if (!database.isConnected) {
        await database.connect();
      }
      
      const serversResult = await database.query(`
        SELECT s.*, p.can_view, p.can_control
        FROM servers s
        LEFT JOIN permissions p ON s.id = p.server_id AND p.user_id = ?
        WHERE s.is_active = true AND (p.can_view = true OR p.can_control = true)
      `, [userId]);

      const containersData = {};
      
      for (const server of serversResult) {
        try {
          const containers = await dockerService.getContainers(server.id);
          containersData[server.id] = {
            serverName: server.name,
            containers: containers || [],
            lastUpdate: Date.now()
          };
        } catch (error) {
          logger.error(`获取服务器 ${server.name} 容器状态失败:`, error);
          containersData[server.id] = {
            serverName: server.name,
            containers: [],
            error: error.message,
            lastUpdate: Date.now()
          };
        }
      }

      return containersData;
    } catch (error) {
      logger.error('获取容器状态失败:', error);
      return { error: '获取容器状态失败' };
    }
  }

  /**
   * 获取监控数据
   */
  async getMonitoringData() {
    try {
      const status = monitoringService.getStatus();
      return {
        ...status,
        lastUpdate: Date.now()
      };
    } catch (error) {
      logger.error('获取监控数据失败:', error);
      return { error: '获取监控数据失败' };
    }
  }

  /**
   * 清理过期的订阅者
   */
  cleanupExpiredSubscribers() {
    const now = Date.now();
    const expireTime = 5 * 60 * 1000; // 5分钟过期

    for (const [sessionId, subscriber] of this.subscribers.entries()) {
      if (now - subscriber.lastAccess > expireTime) {
        logger.info(`清理过期订阅者: ${subscriber.userId}`);
        this.subscribers.delete(sessionId);
        this.dataCache.delete(sessionId);
      }
    }
  }

  /**
   * 获取订阅者统计
   */
  getStats() {
    return {
      activeSubscribers: this.subscribers.size,
      cachedSessions: this.dataCache.size,
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
    this.subscribers.clear();
    this.dataCache.clear();
    logger.info('HTTP轮询服务已销毁');
  }
}

export default new PollingService();
