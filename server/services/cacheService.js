import logger from '../utils/logger.js';
import database from '../config/database.js';
import dockerService from './dockerService.js';
import monitoringService from './monitoringService.js';

class CacheService {
  constructor() {
    this.serverStatusCache = new Map(); // 服务器状态缓存
    this.cacheDuration = 30 * 1000; // 30秒缓存时间（仅用于服务器状态）
    this.pollingInterval = null;
    this.isPolling = false;
  }

  /**
   * 启动缓存轮询服务（仅用于服务器状态）
   */
  startPolling() {
    if (this.isPolling) {
      logger.warn('缓存轮询服务已在运行');
      return;
    }

    this.isPolling = true;
    logger.info('启动服务器状态缓存轮询服务，每30秒更新一次');

    // 立即执行一次
    this.updateServerStatusCaches();

    // 设置定时器，每30秒执行一次
    this.pollingInterval = setInterval(() => {
      this.updateServerStatusCaches();
    }, this.cacheDuration);

    logger.info('服务器状态缓存轮询服务启动成功');
  }

  /**
   * 停止缓存轮询服务
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isPolling = false;
    logger.info('缓存轮询服务已停止');
  }

  /**
   * 更新服务器状态缓存
   */
  async updateServerStatusCaches() {
    try {
      logger.debug('开始更新服务器状态缓存...');
      
      // 确保数据库连接
      if (!database.isConnected) {
        await database.connect();
      }

      // 获取所有活跃的服务器
      const servers = await this.getAllActiveServers();
      
      // 并行更新服务器状态
      const updatePromises = servers.map(server => 
        this.updateServerStatusCache(server)
      );

      await Promise.allSettled(updatePromises);
      
      logger.debug(`服务器状态缓存更新完成，处理了 ${servers.length} 个服务器`);
    } catch (error) {
      logger.error('更新服务器状态缓存失败:', error);
    }
  }

  /**
   * 强制刷新服务器状态缓存（忽略缓存时间）
   */
  async forceRefreshServerStatusCaches() {
    try {
      logger.info('强制刷新服务器状态缓存...');
      
      // 清空现有缓存
      this.serverStatusCache.clear();
      
      // 确保数据库连接
      if (!database.isConnected) {
        await database.connect();
      }

      // 获取所有活跃的服务器
      const servers = await this.getAllActiveServers();
      
      // 并行更新服务器状态
      const updatePromises = servers.map(server => 
        this.updateServerStatusCache(server)
      );

      await Promise.allSettled(updatePromises);
      
      logger.info(`服务器状态缓存强制刷新完成，处理了 ${servers.length} 个服务器`);
    } catch (error) {
      logger.error('强制刷新服务器状态缓存失败:', error);
    }
  }

  /**
   * 获取所有活跃的服务器
   */
  async getAllActiveServers() {
    try {
      const result = await database.query(`
        SELECT * FROM servers 
        WHERE is_active = true 
        ORDER BY created_at DESC
      `);
      return result.rows;
    } catch (error) {
      logger.error('获取服务器列表失败:', error);
      return [];
    }
  }

  /**
   * 更新服务器状态缓存
   */
  async updateServerStatusCache(server) {
    const cacheKey = `server_status_${server.id}`;
    const now = Date.now();

    try {
      // 检查服务器连接状态
      const isOnline = await monitoringService.checkServerConnection(server.id);
      
      const statusData = {
        serverId: server.id,
        serverName: server.name,
        status: isOnline ? '在线' : '离线',
        lastChecked: now,
        timestamp: now
      };

      this.serverStatusCache.set(cacheKey, statusData);
      
      logger.debug(`服务器 ${server.name} 状态缓存已更新: ${statusData.status}`);
    } catch (error) {
      logger.error(`更新服务器 ${server.name} 状态缓存失败:`, error);
      
      // 即使失败也设置离线状态
      const statusData = {
        serverId: server.id,
        serverName: server.name,
        status: '离线',
        lastChecked: now,
        timestamp: now,
        error: error.message
      };
      
      this.serverStatusCache.set(cacheKey, statusData);
    }
  }


  /**
   * 获取服务器状态（优先从缓存）
   */
  getServerStatus(serverId) {
    const cacheKey = `server_status_${serverId}`;
    const cached = this.serverStatusCache.get(cacheKey);
    
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < this.cacheDuration) {
        return {
          ...cached,
          fromCache: true,
          cacheAge: age
        };
      }
    }
    
    return null;
  }

  /**
   * 设置服务器状态到缓存
   */
  setServerStatus(serverId, status) {
    const cacheKey = `server_status_${serverId}`;
    const now = Date.now();
    
    const statusData = {
      serverId,
      status,
      timestamp: now,
      lastChecked: now
    };
    
    this.serverStatusCache.set(cacheKey, statusData);
    logger.debug(`服务器 ${serverId} 状态已缓存: ${status}`);
  }


  /**
   * 获取所有服务器的状态
   */
  getAllServerStatuses() {
    const statuses = [];
    for (const [key, value] of this.serverStatusCache) {
      if (key.startsWith('server_status_')) {
        const age = Date.now() - value.timestamp;
        if (age < this.cacheDuration) {
          statuses.push({
            ...value,
            fromCache: true,
            cacheAge: age
          });
        }
      }
    }
    return statuses;
  }


  /**
   * 清除指定服务器的缓存
   */
  clearServerCache(serverId) {
    this.serverStatusCache.delete(`server_status_${serverId}`);
    logger.info(`已清除服务器 ${serverId} 的状态缓存`);
  }

  /**
   * 清除所有缓存
   */
  clearAllCache() {
    this.serverStatusCache.clear();
    logger.info('已清除所有服务器状态缓存');
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats() {
    const serverStatusCount = this.serverStatusCache.size;
    const now = Date.now();
    
    let validServerStatuses = 0;
    
    for (const [key, value] of this.serverStatusCache) {
      if (key.startsWith('server_status_') && (now - value.timestamp) < this.cacheDuration) {
        validServerStatuses++;
      }
    }
    
    return {
      serverStatusCache: {
        total: serverStatusCount,
        valid: validServerStatuses,
        expired: serverStatusCount - validServerStatuses
      },
      cacheDuration: this.cacheDuration,
      isPolling: this.isPolling
    };
  }

  /**
   * 强制更新指定服务器的状态缓存
   */
  async forceUpdateServerCache(serverId) {
    try {
      const servers = await this.getAllActiveServers();
      const server = servers.find(s => s.id === serverId);
      
      if (!server) {
        throw new Error(`服务器 ${serverId} 不存在或未激活`);
      }
      
      await this.updateServerStatusCache(server);
      
      logger.info(`已强制更新服务器 ${server.name} 的状态缓存`);
    } catch (error) {
      logger.error(`强制更新服务器 ${serverId} 状态缓存失败:`, error);
      throw error;
    }
  }
}

// 创建单例实例
const cacheService = new CacheService();

export default cacheService;
