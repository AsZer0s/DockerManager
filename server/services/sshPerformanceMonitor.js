import logger from '../utils/logger.js';

/**
 * SSH性能监控服务
 * 监控SSH连接和命令执行的性能指标
 */
class SSHPerformanceMonitor {
  constructor() {
    this.metrics = new Map(); // serverId -> metrics
    this.globalMetrics = {
      totalConnections: 0,
      totalCommands: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      connectionSuccessRate: 0,
      commandSuccessRate: 0,
      startTime: Date.now()
    };
    this.isInitialized = false;
    this.monitoringInterval = null;
  }

  /**
   * 初始化性能监控
   */
  initialize() {
    if (this.isInitialized) return;

    // 启动定期监控
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, 30000); // 每30秒收集一次指标

    this.isInitialized = true;
    logger.info('SSH性能监控服务初始化完成');
  }

  /**
   * 记录连接事件
   * @param {number} serverId - 服务器ID
   * @param {string} event - 事件类型 (connect_success, connect_failure)
   * @param {number} responseTime - 响应时间
   * @param {Object} details - 详细信息
   */
  recordConnectionEvent(serverId, event, responseTime = 0, details = {}) {
    if (!this.metrics.has(serverId)) {
      this.initializeServerMetrics(serverId);
    }

    const serverMetrics = this.metrics.get(serverId);
    
    switch (event) {
      case 'connect_success':
        serverMetrics.connectionAttempts++;
        serverMetrics.connectionSuccesses++;
        serverMetrics.totalConnectionTime += responseTime;
        serverMetrics.averageConnectionTime = serverMetrics.totalConnectionTime / serverMetrics.connectionSuccesses;
        serverMetrics.lastConnectionTime = responseTime;
        serverMetrics.lastSuccessfulConnection = Date.now();
        
        // 更新全局指标
        this.globalMetrics.totalConnections++;
        break;
        
      case 'connect_failure':
        serverMetrics.connectionAttempts++;
        serverMetrics.connectionFailures++;
        serverMetrics.lastFailedConnection = Date.now();
        serverMetrics.lastFailureReason = details.reason || 'Unknown';
        break;
    }

    // 计算连接成功率
    serverMetrics.connectionSuccessRate = serverMetrics.connectionAttempts > 0 
      ? (serverMetrics.connectionSuccesses / serverMetrics.connectionAttempts * 100).toFixed(2)
      : 0;

    // 更新全局连接成功率
    this.updateGlobalConnectionSuccessRate();
  }

  /**
   * 记录命令执行事件
   * @param {number} serverId - 服务器ID
   * @param {string} event - 事件类型 (command_success, command_failure)
   * @param {number} responseTime - 响应时间
   * @param {Object} details - 详细信息
   */
  recordCommandEvent(serverId, event, responseTime = 0, details = {}) {
    if (!this.metrics.has(serverId)) {
      this.initializeServerMetrics(serverId);
    }

    const serverMetrics = this.metrics.get(serverId);
    
    switch (event) {
      case 'command_success':
        serverMetrics.commandAttempts++;
        serverMetrics.commandSuccesses++;
        serverMetrics.totalCommandTime += responseTime;
        serverMetrics.averageCommandTime = serverMetrics.totalCommandTime / serverMetrics.commandSuccesses;
        serverMetrics.lastCommandTime = responseTime;
        serverMetrics.lastSuccessfulCommand = Date.now();
        
        // 更新响应时间分布
        this.updateResponseTimeDistribution(serverMetrics, responseTime);
        
        // 更新全局指标
        this.globalMetrics.totalCommands++;
        this.globalMetrics.totalResponseTime += responseTime;
        this.globalMetrics.averageResponseTime = this.globalMetrics.totalResponseTime / this.globalMetrics.totalCommands;
        break;
        
      case 'command_failure':
        serverMetrics.commandAttempts++;
        serverMetrics.commandFailures++;
        serverMetrics.lastFailedCommand = Date.now();
        serverMetrics.lastCommandFailureReason = details.reason || 'Unknown';
        break;
    }

    // 计算命令成功率
    serverMetrics.commandSuccessRate = serverMetrics.commandAttempts > 0 
      ? (serverMetrics.commandSuccesses / serverMetrics.commandAttempts * 100).toFixed(2)
      : 0;

    // 评估连接质量
    this.evaluateConnectionQuality(serverId);

    // 更新全局命令成功率
    this.updateGlobalCommandSuccessRate();
  }

  /**
   * 初始化服务器指标
   * @param {number} serverId - 服务器ID
   */
  initializeServerMetrics(serverId) {
    this.metrics.set(serverId, {
      serverId,
      // 连接指标
      connectionAttempts: 0,
      connectionSuccesses: 0,
      connectionFailures: 0,
      connectionSuccessRate: 0,
      totalConnectionTime: 0,
      averageConnectionTime: 0,
      lastConnectionTime: 0,
      lastSuccessfulConnection: null,
      lastFailedConnection: null,
      lastFailureReason: null,
      
      // 命令执行指标
      commandAttempts: 0,
      commandSuccesses: 0,
      commandFailures: 0,
      commandSuccessRate: 0,
      totalCommandTime: 0,
      averageCommandTime: 0,
      lastCommandTime: 0,
      lastSuccessfulCommand: null,
      lastFailedCommand: null,
      lastCommandFailureReason: null,
      
      // 性能指标
      responseTimeDistribution: {
        fast: 0,    // < 500ms
        normal: 0,  // 500ms - 2s
        slow: 0,    // 2s - 5s
        verySlow: 0 // > 5s
      },
      connectionQuality: 'unknown', // excellent, good, fair, poor, unknown
      
      // 时间戳
      createdAt: Date.now(),
      lastUpdated: Date.now()
    });
  }

  /**
   * 更新响应时间分布
   * @param {Object} serverMetrics - 服务器指标
   * @param {number} responseTime - 响应时间
   */
  updateResponseTimeDistribution(serverMetrics, responseTime) {
    if (responseTime < 500) {
      serverMetrics.responseTimeDistribution.fast++;
    } else if (responseTime < 2000) {
      serverMetrics.responseTimeDistribution.normal++;
    } else if (responseTime < 5000) {
      serverMetrics.responseTimeDistribution.slow++;
    } else {
      serverMetrics.responseTimeDistribution.verySlow++;
    }
  }

  /**
   * 评估连接质量
   * @param {number} serverId - 服务器ID
   */
  evaluateConnectionQuality(serverId) {
    const metrics = this.metrics.get(serverId);
    if (!metrics) return;

    const { averageCommandTime, commandSuccessRate, responseTimeDistribution } = metrics;
    const totalCommands = metrics.commandSuccesses;
    
    if (totalCommands < 5) {
      metrics.connectionQuality = 'unknown';
      return;
    }

    // 计算质量分数 (0-100)
    let qualityScore = 0;
    
    // 成功率权重 (40%)
    qualityScore += (parseFloat(commandSuccessRate) * 0.4);
    
    // 平均响应时间权重 (30%)
    if (averageCommandTime < 500) {
      qualityScore += 30;
    } else if (averageCommandTime < 1000) {
      qualityScore += 25;
    } else if (averageCommandTime < 2000) {
      qualityScore += 20;
    } else if (averageCommandTime < 5000) {
      qualityScore += 10;
    } else {
      qualityScore += 5;
    }
    
    // 响应时间分布权重 (30%)
    const fastRatio = responseTimeDistribution.fast / totalCommands;
    const normalRatio = responseTimeDistribution.normal / totalCommands;
    qualityScore += (fastRatio * 30 + normalRatio * 20);

    // 确定质量等级
    if (qualityScore >= 85) {
      metrics.connectionQuality = 'excellent';
    } else if (qualityScore >= 70) {
      metrics.connectionQuality = 'good';
    } else if (qualityScore >= 50) {
      metrics.connectionQuality = 'fair';
    } else {
      metrics.connectionQuality = 'poor';
    }

    metrics.qualityScore = Math.round(qualityScore);
    metrics.lastUpdated = Date.now();
  }

  /**
   * 更新全局连接成功率
   */
  updateGlobalConnectionSuccessRate() {
    const allMetrics = Array.from(this.metrics.values());
    const totalAttempts = allMetrics.reduce((sum, m) => sum + m.connectionAttempts, 0);
    const totalSuccesses = allMetrics.reduce((sum, m) => sum + m.connectionSuccesses, 0);
    
    this.globalMetrics.connectionSuccessRate = totalAttempts > 0 
      ? (totalSuccesses / totalAttempts * 100).toFixed(2)
      : 0;
  }

  /**
   * 更新全局命令成功率
   */
  updateGlobalCommandSuccessRate() {
    const allMetrics = Array.from(this.metrics.values());
    const totalAttempts = allMetrics.reduce((sum, m) => sum + m.commandAttempts, 0);
    const totalSuccesses = allMetrics.reduce((sum, m) => sum + m.commandSuccesses, 0);
    
    this.globalMetrics.commandSuccessRate = totalAttempts > 0 
      ? (totalSuccesses / totalAttempts * 100).toFixed(2)
      : 0;
  }

  /**
   * 收集指标
   */
  collectMetrics() {
    const now = Date.now();
    const uptime = now - this.globalMetrics.startTime;
    
    // 更新全局指标
    this.globalMetrics.uptime = uptime;
    this.globalMetrics.timestamp = now;
    
    // 记录指标到日志
    const activeServers = this.metrics.size;
    const poorQualityServers = Array.from(this.metrics.values())
      .filter(m => m.connectionQuality === 'poor').length;
    
    if (poorQualityServers > 0) {
      logger.warn(`SSH性能监控: ${poorQualityServers}/${activeServers} 个服务器连接质量较差`);
    }
    
    logger.debug(`SSH性能监控: 活跃服务器 ${activeServers}, 总命令数 ${this.globalMetrics.totalCommands}, 平均响应时间 ${Math.round(this.globalMetrics.averageResponseTime)}ms`);
  }

  /**
   * 获取服务器指标
   * @param {number} serverId - 服务器ID
   * @returns {Object} 服务器指标
   */
  getServerMetrics(serverId) {
    return this.metrics.get(serverId) || null;
  }

  /**
   * 获取所有服务器指标
   * @returns {Array} 所有服务器指标
   */
  getAllServerMetrics() {
    return Array.from(this.metrics.values());
  }

  /**
   * 获取全局指标
   * @returns {Object} 全局指标
   */
  getGlobalMetrics() {
    return {
      ...this.globalMetrics,
      activeServers: this.metrics.size,
      timestamp: Date.now()
    };
  }

  /**
   * 获取性能报告
   * @returns {Object} 性能报告
   */
  getPerformanceReport() {
    const allMetrics = Array.from(this.metrics.values());
    
    // 按质量分组
    const qualityGroups = {
      excellent: allMetrics.filter(m => m.connectionQuality === 'excellent'),
      good: allMetrics.filter(m => m.connectionQuality === 'good'),
      fair: allMetrics.filter(m => m.connectionQuality === 'fair'),
      poor: allMetrics.filter(m => m.connectionQuality === 'poor'),
      unknown: allMetrics.filter(m => m.connectionQuality === 'unknown')
    };

    // 计算统计信息
    const stats = {
      totalServers: allMetrics.length,
      qualityDistribution: Object.fromEntries(
        Object.entries(qualityGroups).map(([quality, servers]) => [quality, servers.length])
      ),
      averageResponseTime: allMetrics.length > 0 
        ? Math.round(allMetrics.reduce((sum, m) => sum + (m.averageCommandTime || 0), 0) / allMetrics.length)
        : 0,
      overallSuccessRate: this.globalMetrics.commandSuccessRate,
      topPerformers: allMetrics
        .filter(m => m.connectionQuality === 'excellent')
        .sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))
        .slice(0, 5),
      poorPerformers: allMetrics
        .filter(m => m.connectionQuality === 'poor')
        .sort((a, b) => (a.qualityScore || 0) - (b.qualityScore || 0))
        .slice(0, 5)
    };

    return {
      global: this.getGlobalMetrics(),
      stats,
      qualityGroups,
      timestamp: Date.now()
    };
  }

  /**
   * 重置服务器指标
   * @param {number} serverId - 服务器ID
   */
  resetServerMetrics(serverId) {
    if (this.metrics.has(serverId)) {
      this.metrics.delete(serverId);
      logger.info(`已重置服务器 ${serverId} 的性能指标`);
    }
  }

  /**
   * 重置所有指标
   */
  resetAllMetrics() {
    this.metrics.clear();
    this.globalMetrics = {
      totalConnections: 0,
      totalCommands: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      connectionSuccessRate: 0,
      commandSuccessRate: 0,
      startTime: Date.now()
    };
    logger.info('已重置所有SSH性能指标');
  }

  /**
   * 销毁监控服务
   */
  destroy() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.metrics.clear();
    this.isInitialized = false;
    logger.info('SSH性能监控服务已销毁');
  }
}

export default new SSHPerformanceMonitor();