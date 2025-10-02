import logger from '../utils/logger.js';
import database from '../config/database.js';
import dockerService from './dockerService.js';
import monitoringService from './monitoringService.js';

class CacheService {
  constructor() {
    this.serverStatusCache = new Map(); // 服务器状态缓存
    this.containerCache = new Map(); // 容器列表缓存
    this.cacheDuration = 10 * 60 * 1000; // 10分钟缓存时间
    this.pollingInterval = null;
    this.isPolling = false;
  }

  /**
   * 启动缓存轮询服务
   */
  startPolling() {
    if (this.isPolling) {
      logger.warn('缓存轮询服务已在运行');
      return;
    }

    this.isPolling = true;
    logger.info('启动缓存轮询服务，每10分钟更新一次');

    // 立即执行一次
    this.updateAllCaches();

    // 设置定时器，每10分钟执行一次
    this.pollingInterval = setInterval(() => {
      this.updateAllCaches();
    }, this.cacheDuration);

    logger.info('缓存轮询服务启动成功');
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
   * 更新所有缓存
   */
  async updateAllCaches() {
    try {
      logger.info('开始更新缓存数据...');
      
      // 确保数据库连接
      if (!database.isConnected) {
        await database.connect();
      }

      // 获取所有活跃的服务器
      const servers = await this.getAllActiveServers();
      
      // 并行更新服务器状态和容器列表
      const updatePromises = servers.map(server => 
        Promise.allSettled([
          this.updateServerStatusCache(server),
          this.updateContainerCache(server)
        ])
      );

      await Promise.all(updatePromises);
      
      logger.info(`缓存更新完成，处理了 ${servers.length} 个服务器`);
    } catch (error) {
      logger.error('更新缓存失败:', error);
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
   * 更新容器列表缓存
   */
  async updateContainerCache(server) {
    const cacheKey = `containers_${server.id}`;
    const now = Date.now();

    try {
      // 获取容器列表
      const containers = await dockerService.getContainers(server.id, true);
      
      const containerData = {
        serverId: server.id,
        serverName: server.name,
        containers: containers,
        total: containers.length,
        lastUpdated: now,
        timestamp: now
      };

      this.containerCache.set(cacheKey, containerData);
      
      logger.debug(`服务器 ${server.name} 容器缓存已更新: ${containers.length} 个容器`);
    } catch (error) {
      logger.error(`更新服务器 ${server.name} 容器缓存失败:`, error);
      
      // 即使失败也设置空列表
      const containerData = {
        serverId: server.id,
        serverName: server.name,
        containers: [],
        total: 0,
        lastUpdated: now,
        timestamp: now,
        error: error.message
      };
      
      this.containerCache.set(cacheKey, containerData);
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
   * 获取容器列表（优先从缓存）
   */
  getContainers(serverId) {
    const cacheKey = `containers_${serverId}`;
    const cached = this.containerCache.get(cacheKey);
    
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
   * 获取所有服务器的容器列表
   */
  getAllContainers() {
    const allContainers = [];
    for (const [key, value] of this.containerCache) {
      if (key.startsWith('containers_')) {
        const age = Date.now() - value.timestamp;
        if (age < this.cacheDuration) {
          const containersWithServerInfo = value.containers.map(container => ({
            ...container,
            serverName: value.serverName,
            serverId: value.serverId
          }));
          allContainers.push(...containersWithServerInfo);
        }
      }
    }
    return allContainers;
  }

  /**
   * 清除指定服务器的缓存
   */
  clearServerCache(serverId) {
    this.serverStatusCache.delete(`server_status_${serverId}`);
    this.containerCache.delete(`containers_${serverId}`);
    logger.info(`已清除服务器 ${serverId} 的缓存`);
  }

  /**
   * 清除所有缓存
   */
  clearAllCache() {
    this.serverStatusCache.clear();
    this.containerCache.clear();
    logger.info('已清除所有缓存');
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats() {
    const serverStatusCount = this.serverStatusCache.size;
    const containerCacheCount = this.containerCache.size;
    const now = Date.now();
    
    let validServerStatuses = 0;
    let validContainerCaches = 0;
    
    for (const [key, value] of this.serverStatusCache) {
      if (key.startsWith('server_status_') && (now - value.timestamp) < this.cacheDuration) {
        validServerStatuses++;
      }
    }
    
    for (const [key, value] of this.containerCache) {
      if (key.startsWith('containers_') && (now - value.timestamp) < this.cacheDuration) {
        validContainerCaches++;
      }
    }
    
    return {
      serverStatusCache: {
        total: serverStatusCount,
        valid: validServerStatuses,
        expired: serverStatusCount - validServerStatuses
      },
      containerCache: {
        total: containerCacheCount,
        valid: validContainerCaches,
        expired: containerCacheCount - validContainerCaches
      },
      cacheDuration: this.cacheDuration,
      isPolling: this.isPolling
    };
  }

  /**
   * 强制更新指定服务器的缓存
   */
  async forceUpdateServerCache(serverId) {
    try {
      const servers = await this.getAllActiveServers();
      const server = servers.find(s => s.id === serverId);
      
      if (!server) {
        throw new Error(`服务器 ${serverId} 不存在或未激活`);
      }
      
      await Promise.all([
        this.updateServerStatusCache(server),
        this.updateContainerCache(server)
      ]);
      
      logger.info(`已强制更新服务器 ${server.name} 的缓存`);
    } catch (error) {
      logger.error(`强制更新服务器 ${serverId} 缓存失败:`, error);
      throw error;
    }
  }
}

// 创建单例实例
const cacheService = new CacheService();

export default cacheService;
