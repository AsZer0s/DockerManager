import logger from '../utils/logger.js';
import database from '../config/database.js';
import notificationService from './notificationService.js';

class AlertService {
  constructor() {
    this.alertCooldowns = new Map(); // 告警冷却时间
    this.alertHistory = new Map(); // 告警历史记录
    this.cooldownTime = 300000; // 5分钟冷却时间
  }

  /**
   * 检查所有服务器的告警
   */
  async checkAllServers() {
    try {
      // 获取所有活跃的服务器
      const servers = await database.query(
        'SELECT id, name, host FROM servers WHERE is_active = 1'
      );

      for (const server of servers.rows) {
        await this.checkServerAlerts(server.id, server.name);
      }
    } catch (error) {
      logger.error('检查服务器告警失败:', error);
    }
  }

  /**
   * 检查单个服务器的告警
   */
  async checkServerAlerts(serverId, serverName) {
    try {
      // 获取最新的监控数据
      const monitoringData = await database.query(
        `SELECT cpu_usage, memory_usage, disk_usage, timestamp 
         FROM server_monitoring 
         WHERE server_id = ? 
         ORDER BY timestamp DESC 
         LIMIT 1`,
        [serverId]
      );

      if (monitoringData.rows.length === 0) {
        return;
      }

      const data = monitoringData.rows[0];
      const timestamp = new Date(data.timestamp);

      // 只检查最近5分钟内的数据
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (timestamp < fiveMinutesAgo) {
        return;
      }

      // 获取所有用户的告警设置
      const users = await this.getUsersWithAlerts();
      
      for (const user of users) {
        await this.checkUserAlerts(user.id, serverId, serverName, data, user.settings);
      }
    } catch (error) {
      logger.error(`检查服务器 ${serverId} 告警失败:`, error);
    }
  }

  /**
   * 检查容器告警
   */
  async checkContainerAlerts(serverId, containerId, containerName, stats) {
    try {
      // 获取所有用户的告警设置
      const users = await this.getUsersWithAlerts();
      
      for (const user of users) {
        if (user.settings.containerEvents) {
          await this.triggerAlert(
            user.id,
            'container_event',
            `容器 ${containerName} 状态异常`,
            'warning',
            {
              serverId,
              containerId,
              containerName,
              stats
            }
          );
        }
      }
    } catch (error) {
      logger.error(`检查容器 ${containerId} 告警失败:`, error);
    }
  }

  /**
   * 获取启用了告警的用户
   */
  async getUsersWithAlerts() {
    try {
      const result = await database.query(`
        SELECT u.id, u.username, uns.settings
        FROM users u
        JOIN user_notification_settings uns ON u.id = uns.user_id
        WHERE u.is_active = 1
        AND JSON_EXTRACT(uns.settings, '$.serverAlerts') = 1
      `);

      return result.rows.map(row => ({
        id: row.id,
        username: row.username,
        settings: JSON.parse(row.settings)
      }));
    } catch (error) {
      logger.error('获取告警用户失败:', error);
      return [];
    }
  }

  /**
   * 检查用户告警
   */
  async checkUserAlerts(userId, serverId, serverName, monitoringData, settings) {
    const thresholds = settings.alertThreshold || {
      cpu: 80,
      memory: 85,
      disk: 90
    };

    // 检查CPU使用率
    if (settings.highCpuUsage && monitoringData.cpu_usage > thresholds.cpu) {
      await this.triggerAlert(
        userId,
        'system_alert',
        `服务器 ${serverName} CPU使用率过高: ${monitoringData.cpu_usage.toFixed(1)}%`,
        'warning',
        {
          serverId,
          serverName,
          metric: 'cpu',
          value: monitoringData.cpu_usage,
          threshold: thresholds.cpu
        }
      );
    }

    // 检查内存使用率
    if (settings.highMemoryUsage && monitoringData.memory_usage > thresholds.memory) {
      await this.triggerAlert(
        userId,
        'system_alert',
        `服务器 ${serverName} 内存使用率过高: ${monitoringData.memory_usage.toFixed(1)}%`,
        'warning',
        {
          serverId,
          serverName,
          metric: 'memory',
          value: monitoringData.memory_usage,
          threshold: thresholds.memory
        }
      );
    }

    // 检查磁盘使用率
    if (settings.lowDiskSpace && monitoringData.disk_usage > thresholds.disk) {
      await this.triggerAlert(
        userId,
        'system_alert',
        `服务器 ${serverName} 磁盘空间不足: ${monitoringData.disk_usage.toFixed(1)}%`,
        'critical',
        {
          serverId,
          serverName,
          metric: 'disk',
          value: monitoringData.disk_usage,
          threshold: thresholds.disk
        }
      );
    }
  }

  /**
   * 触发告警
   */
  async triggerAlert(userId, alertType, message, severity, options = {}) {
    try {
      const alertKey = `${userId}-${alertType}-${options.serverId || 'global'}`;
      
      // 检查冷却时间
      if (this.checkAlertCooldown(alertKey)) {
        logger.debug(`告警 ${alertKey} 仍在冷却期内，跳过发送`);
        return { success: false, reason: 'cooldown' };
      }

      // 发送通知
      const result = await notificationService.sendNotification(
        userId,
        alertType,
        message,
        {
          serverName: options.serverName,
          containerName: options.containerName,
          severity: severity,
          ...options
        }
      );

      if (result.success) {
        // 设置冷却时间
        this.alertCooldowns.set(alertKey, Date.now());
        
        // 记录告警历史
        this.alertHistory.set(alertKey, {
          userId,
          alertType,
          message,
          severity,
          timestamp: new Date().toISOString(),
          options
        });

        logger.info(`告警发送成功: 用户${userId}, 类型${alertType}, 消息: ${message}`);
      }

      return result;
    } catch (error) {
      logger.error('触发告警失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 检查告警冷却时间
   */
  checkAlertCooldown(alertKey) {
    const lastAlert = this.alertCooldowns.get(alertKey);
    if (!lastAlert) {
      return false;
    }

    const timeSinceLastAlert = Date.now() - lastAlert;
    return timeSinceLastAlert < this.cooldownTime;
  }

  /**
   * 触发容器事件通知
   */
  async triggerContainerEvent(userId, eventType, containerName, serverName, options = {}) {
    const eventMessages = {
      'start': `容器 ${containerName} 已启动`,
      'stop': `容器 ${containerName} 已停止`,
      'restart': `容器 ${containerName} 已重启`,
      'remove': `容器 ${containerName} 已删除`,
      'create': `容器 ${containerName} 已创建`
    };

    const message = eventMessages[eventType] || `容器 ${containerName} 发生 ${eventType} 事件`;

    return await this.triggerAlert(
      userId,
      'container_event',
      message,
      'info',
      {
        serverName,
        containerName,
        eventType,
        ...options
      }
    );
  }

  /**
   * 触发服务器连接告警
   */
  async triggerServerConnectionAlert(userId, serverName, status) {
    const message = status === 'offline' 
      ? `服务器 ${serverName} 连接失败`
      : `服务器 ${serverName} 连接恢复`;

    return await this.triggerAlert(
      userId,
      'server_alert',
      message,
      status === 'offline' ? 'critical' : 'info',
      {
        serverName,
        status
      }
    );
  }

  /**
   * 触发安全告警
   */
  async triggerSecurityAlert(userId, alertType, message, options = {}) {
    return await this.triggerAlert(
      userId,
      'security_alert',
      message,
      'critical',
      options
    );
  }

  /**
   * 清理过期的告警历史
   */
  cleanupAlertHistory() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    
    for (const [key, alert] of this.alertHistory.entries()) {
      if (new Date(alert.timestamp).getTime() < oneHourAgo) {
        this.alertHistory.delete(key);
      }
    }

    // 清理过期的冷却时间
    for (const [key, timestamp] of this.alertCooldowns.entries()) {
      if (Date.now() - timestamp > this.cooldownTime) {
        this.alertCooldowns.delete(key);
      }
    }
  }

  /**
   * 获取告警统计信息
   */
  getAlertStats() {
    return {
      activeCooldowns: this.alertCooldowns.size,
      alertHistory: this.alertHistory.size,
      cooldownTime: this.cooldownTime
    };
  }
}

export default new AlertService();
