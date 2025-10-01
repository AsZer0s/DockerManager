import express from 'express';
import jwt from 'jsonwebtoken';

import database from '../config/database.js';
import logger from '../utils/logger.js';
import monitoringService from '../services/monitoringService.js';
import { monitoringValidation, validateQuery, validateParams, commonValidation } from '../utils/validation.js';

const router = express.Router();

// 中间件：验证 JWT 令牌
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: '未授权',
        message: '缺少认证令牌'
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const result = await database.db.get(
      'SELECT * FROM users WHERE id = ? AND is_active = 1',
      [decoded.userId]
    );

    if (!result) {
      return res.status(401).json({
        error: '令牌无效',
        message: '用户不存在或已禁用'
      });
    }

    req.user = result;
    next();
  } catch (error) {
    return res.status(401).json({
      error: '令牌无效',
      message: '认证失败'
    });
  }
};

// 中间件：检查服务器权限
const checkServerPermission = async (req, res, next) => {
  try {
    const serverId = parseInt(req.params.serverId || req.query.serverId);
    
    if (req.user.role === 'admin') {
      req.serverPermission = { canView: true, hideSensitiveInfo: false };
      return next();
    }

    const result = await database.db.get(
      'SELECT can_view, hide_sensitive_info FROM user_server_permissions WHERE user_id = ? AND server_id = ?',
      [req.user.id, serverId]
    );

    if (!result) {
      return res.status(403).json({
        error: '权限不足',
        message: '您没有权限访问此服务器'
      });
    }

    req.serverPermission = result;
    next();
  } catch (error) {
    return res.status(500).json({
      error: '权限检查失败',
      message: '服务器内部错误'
    });
  }
};

/**
 * @route GET /api/monitoring/servers/:serverId
 * @desc 获取服务器监控数据
 * @access Private
 */
router.get('/servers/:serverId',
  authenticateToken,
  validateParams(commonValidation.serverId),
  checkServerPermission,
  validateQuery(monitoringValidation.getServerData),
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);
      const { timeRange = '24h', interval = '5m' } = req.query;

      if (!req.serverPermission.canView) {
        return res.status(403).json({
          error: '权限不足',
          message: '您没有权限查看此服务器的监控数据'
        });
      }

      const data = await monitoringService.getHistoricalData(serverId, 'server', {
        timeRange,
        interval
      });

      // 根据权限隐藏敏感信息
      const filteredData = data.map(item => {
        if (req.serverPermission.hide_sensitive_info) {
          return {
            ...item,
            // 可以在这里隐藏特定的监控数据
          };
        }
        return item;
      });

      res.json({
        serverId,
        type: 'server',
        timeRange,
        interval,
        data: filteredData,
        total: filteredData.length
      });
    } catch (error) {
      logger.error('获取服务器监控数据失败:', error);
      res.status(500).json({
        error: '获取服务器监控数据失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route GET /api/monitoring/containers/:serverId/:containerId
 * @desc 获取容器监控数据
 * @access Private
 */
router.get('/containers/:serverId/:containerId',
  authenticateToken,
  validateParams(commonValidation.serverId.concat(commonValidation.containerId)),
  checkServerPermission,
  validateQuery(monitoringValidation.getContainerData),
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);
      const containerId = req.params.containerId;
      const { timeRange = '24h', interval = '5m' } = req.query;

      if (!req.serverPermission.canView) {
        return res.status(403).json({
          error: '权限不足',
          message: '您没有权限查看此服务器的监控数据'
        });
      }

      const data = await monitoringService.getHistoricalData(serverId, 'container', {
        timeRange,
        interval,
        containerId
      });

      res.json({
        serverId,
        containerId,
        type: 'container',
        timeRange,
        interval,
        data,
        total: data.length
      });
    } catch (error) {
      logger.error('获取容器监控数据失败:', error);
      res.status(500).json({
        error: '获取容器监控数据失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route GET /api/monitoring/current/:serverId
 * @desc 获取服务器当前监控数据
 * @access Private
 */
router.get('/current/:serverId',
  authenticateToken,
  validateParams(commonValidation.serverId),
  checkServerPermission,
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);

      if (!req.serverPermission.canView) {
        return res.status(403).json({
          error: '权限不足',
          message: '您没有权限查看此服务器的监控数据'
        });
      }

      // 直接收集实时监控数据
      const realTimeData = await monitoringService.collectSystemData(serverId);
      
      if (!realTimeData) {
        return res.status(404).json({
          error: '无法获取实时数据',
          message: '服务器可能离线或连接失败'
        });
      }

      res.json({
        serverId,
        type: 'server',
        data: realTimeData,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('获取当前监控数据失败:', error);
      res.status(500).json({
        error: '获取当前监控数据失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route GET /api/monitoring/containers/current/:serverId/:containerId
 * @desc 获取容器当前监控数据
 * @access Private
 */
router.get('/containers/current/:serverId/:containerId',
  authenticateToken,
  validateParams(commonValidation.serverId.concat(commonValidation.containerId)),
  checkServerPermission,
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);
      const containerId = req.params.containerId;

      if (!req.serverPermission.canView) {
        return res.status(403).json({
          error: '权限不足',
          message: '您没有权限查看此服务器的监控数据'
        });
      }

      // 首先获取容器在数据库中的 ID
      const containerResult = await database.db.get(
        'SELECT id FROM containers WHERE server_id = ? AND container_id = ?',
        [serverId, containerId]
      );

      if (!containerResult) {
        return res.status(404).json({
          error: '容器不存在',
          message: '未找到指定的容器'
        });
      }

      const dbContainerId = containerResult.id;

      // 直接收集容器实时监控数据
      const realTimeData = await monitoringService.collectContainerData(serverId);
      const containerData = realTimeData.find(c => c.containerId === containerId);
      
      if (!containerData) {
        return res.status(404).json({
          error: '无法获取容器实时数据',
          message: '容器可能不存在或已停止'
        });
      }

      res.json({
        serverId,
        containerId,
        type: 'container',
        data: containerData.metrics,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('获取容器当前监控数据失败:', error);
      res.status(500).json({
        error: '获取容器当前监控数据失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route GET /api/monitoring/stats
 * @desc 获取监控服务统计信息
 * @access Private (Admin only)
 */
router.get('/stats',
  authenticateToken,
  async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          error: '权限不足',
          message: '需要管理员权限'
        });
      }

      const stats = monitoringService.getStatus();

      // 获取数据库统计信息
      const serverCountResult = await database.db.get('SELECT COUNT(*) as count FROM servers WHERE is_active = 1');
      const containerCountResult = await database.db.get('SELECT COUNT(*) as count FROM containers');
      const monitoringDataCountResult = await database.db.get('SELECT COUNT(*) as count FROM server_monitoring WHERE timestamp > datetime(\'now\', \'-24 hours\')');

      res.json({
        monitoring: stats,
        database: {
          activeServers: parseInt(serverCountResult.count),
          totalContainers: parseInt(containerCountResult.count),
          monitoringDataLast24h: parseInt(monitoringDataCountResult.count)
        }
      });
    } catch (error) {
      logger.error('获取监控统计信息失败:', error);
      res.status(500).json({
        error: '获取监控统计信息失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route POST /api/monitoring/cleanup
 * @desc 清理旧的监控数据
 * @access Private (Admin only)
 */
router.post('/cleanup',
  authenticateToken,
  async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          error: '权限不足',
          message: '需要管理员权限'
        });
      }

      const { retentionDays = 30 } = req.body;

      if (retentionDays < 1 || retentionDays > 365) {
        return res.status(400).json({
          error: '参数错误',
          message: '保留天数必须在 1-365 之间'
        });
      }

      await monitoringService.cleanupOldData(retentionDays);

      logger.info(`管理员 ${req.user.username} 清理了 ${retentionDays} 天前的监控数据`);

      res.json({
        message: `成功清理 ${retentionDays} 天前的监控数据`
      });
    } catch (error) {
      logger.error('清理监控数据失败:', error);
      res.status(500).json({
        error: '清理监控数据失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route GET /api/monitoring/alerts
 * @desc 获取监控告警
 * @access Private
 */
router.get('/alerts',
  authenticateToken,
  async (req, res) => {
    try {
      const { serverId, severity = 'all' } = req.query;
      
      let query = `
        SELECT s.name as server_name, sm.cpu_usage, sm.memory_usage, sm.disk_usage,
               sm.timestamp, sm.load_average
        FROM server_monitoring sm
        JOIN servers s ON sm.server_id = s.id
        WHERE sm.timestamp > datetime('now', '-1 hour')
        AND (sm.cpu_usage > 90 OR sm.memory_usage > 90 OR sm.disk_usage > 90 OR sm.load_average > 5)
      `;
      
      let params = [];
      
      if (serverId) {
        query += ' AND sm.server_id = ?';
        params.push(serverId);
      }
      
      query += ' ORDER BY sm.timestamp DESC LIMIT 100';

      const result = await database.db.all(query, params);
      
      // 生成告警信息
      const alerts = result.map(row => {
        const alerts_list = [];
        
        if (row.cpu_usage > 90) {
          alerts_list.push({
            type: 'cpu',
            severity: 'high',
            message: `CPU 使用率过高: ${row.cpu_usage}%`,
            value: row.cpu_usage
          });
        }
        
        if (row.memory_usage > 90) {
          alerts_list.push({
            type: 'memory',
            severity: 'high',
            message: `内存使用率过高: ${row.memory_usage}%`,
            value: row.memory_usage
          });
        }
        
        if (row.disk_usage > 90) {
          alerts_list.push({
            type: 'disk',
            severity: 'high',
            message: `磁盘使用率过高: ${row.disk_usage}%`,
            value: row.disk_usage
          });
        }
        
        if (row.load_average > 5) {
          alerts_list.push({
            type: 'load',
            severity: 'high',
            message: `系统负载过高: ${row.load_average}`,
            value: row.load_average
          });
        }
        
        return {
          serverId: row.server_id,
          serverName: row.server_name,
          timestamp: row.timestamp,
          alerts: alerts_list
        };
      }).filter(alert => alert.alerts.length > 0);

      res.json({
        alerts,
        total: alerts.length
      });
    } catch (error) {
      logger.error('获取监控告警失败:', error);
      res.status(500).json({
        error: '获取监控告警失败',
        message: '服务器内部错误'
      });
    }
  }
);

export default router;
