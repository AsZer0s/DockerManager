import express from 'express';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';

import database from '../config/database.js';
import logger from '../utils/logger.js';
import dockerService from '../services/dockerService.js';
import cacheService from '../services/cacheService.js';
import alertService from '../services/alertService.js';
import { containerValidation, validate, validateParams, commonValidation } from '../utils/validation.js';

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
    const serverId = parseInt(req.params.serverId || req.body.serverId);
    
    if (req.user.role === 'admin') {
      req.serverPermission = { can_view: true, can_control: true, can_ssh: true, hide_sensitive_info: false };
      return next();
    }

    // 先检查服务器是否存在
    const serverExists = await database.db.get(
      'SELECT id FROM servers WHERE id = ? AND is_active = 1',
      [serverId]
    );

    if (!serverExists) {
      return res.status(404).json({
        error: '服务器不存在',
        message: '指定的服务器不存在或已被禁用'
      });
    }

    // 检查用户权限
    const result = await database.db.get(
      'SELECT can_view, can_control, can_ssh, hide_sensitive_info FROM user_server_permissions WHERE user_id = ? AND server_id = ?',
      [req.user.id, serverId]
    );

    // 调试信息：记录权限查询结果
    logger.debug(`权限检查: 用户 ${req.user.id}, 服务器 ${serverId}, 查询结果:`, result);

    if (!result) {
      // 获取服务器名称用于更友好的错误信息
      const serverInfo = await database.db.get(
        'SELECT name FROM servers WHERE id = ?',
        [serverId]
      );
      const serverName = serverInfo ? serverInfo.name : `服务器 ${serverId}`;
      
      return res.status(403).json({
        error: '权限不足',
        message: `您没有访问 ${serverName} 的权限，请联系管理员分配权限`,
        details: {
          serverId,
          serverName,
          action: 'view_containers',
          suggestion: '请联系管理员为您分配服务器访问权限',
          debug: {
            userId: req.user.id,
            userRole: req.user.role,
            permissionQuery: `SELECT can_view, can_control, can_ssh, hide_sensitive_info FROM user_server_permissions WHERE user_id = ${req.user.id} AND server_id = ${serverId}`
          }
        }
      });
    }

    // 检查用户是否有查看权限
    if (!result.can_view) {
      // 获取服务器名称用于更友好的错误信息
      const serverInfo = await database.db.get(
        'SELECT name FROM servers WHERE id = ?',
        [serverId]
      );
      const serverName = serverInfo ? serverInfo.name : `服务器 ${serverId}`;
      
      return res.status(403).json({
        error: '权限不足',
        message: `您没有查看 ${serverName} 容器的权限`,
        details: {
          serverId,
          serverName,
          action: 'view_containers',
          suggestion: '请联系管理员为您分配容器查看权限'
        }
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
 * @route GET /api/containers/all
 * @desc 获取所有服务器的容器信息
 * @access Private
 */
router.get('/all',
  authenticateToken,
  async (req, res) => {
    try {
      const { all = 'true' } = req.query;
      
      // 获取用户有权限的服务器列表
      let servers;
      if (req.user.role === 'admin') {
        servers = await database.db.all(`
          SELECT s.*
          FROM servers s
          WHERE s.is_active = 1
          ORDER BY s.created_at DESC
        `);
      } else {
        servers = await database.db.all(`
          SELECT s.*, p.can_view, p.can_control, p.can_ssh, p.hide_sensitive_info
          FROM servers s
          JOIN user_server_permissions p ON s.id = p.server_id
          WHERE p.user_id = ? AND s.is_active = 1 AND p.can_view = 1
          ORDER BY s.name
        `, [req.user.id]);
      }

      const containersData = {};
      
      for (const server of servers) {
        try {
          // 获取用户有权限的容器列表
          let userContainerIds = [];
          if (req.user.role !== 'admin') {
            const userContainers = await database.db.all(
              'SELECT container_id FROM user_containers WHERE user_id = ?',
              [req.user.id]
            );
            userContainerIds = userContainers.map(uc => uc.container_id);
          }

          // 从缓存或Docker服务获取容器列表
          let containers = cacheService.getContainers(server.id);
          if (containers) {
            containers = containers.containers;
            // 使用缓存容器列表
          } else {
            // 如果缓存中没有，从 Docker 服务获取
            containers = await dockerService.getContainers(server.id, all === 'true');
            // 从 Docker 服务获取容器列表
          }

          // 根据权限过滤容器
          const filteredContainers = containers.filter(container => {
            // 管理员可以看到所有容器
            if (req.user.role === 'admin') {
              return true;
            }
            // 普通用户只能看到有权限的容器
            return userContainerIds.includes(container.id);
          });

          containersData[server.id] = {
            serverName: server.name,
            containers: filteredContainers,
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

      res.json({
        success: true,
        data: containersData
      });
    } catch (error) {
      logger.error('获取所有容器信息失败:', error);
      res.status(500).json({
        error: '获取容器信息失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route POST /api/containers/refresh-cache
 * @desc 强制刷新容器缓存
 * @access Private (Admin only)
 */
router.post('/refresh-cache',
  authenticateToken,
  async (req, res) => {
    try {
      // 只有管理员可以强制刷新缓存
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          error: '权限不足',
          message: '只有管理员可以强制刷新缓存'
        });
      }

      // 强制刷新缓存
      await cacheService.forceRefreshAllCaches();
      
      res.json({
        success: true,
        message: '缓存已强制刷新'
      });
    } catch (error) {
      logger.error('强制刷新缓存失败:', error);
      res.status(500).json({
        error: '刷新缓存失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route GET /api/containers/:serverId
 * @desc 获取服务器的容器列表
 * @access Private
 */
router.get('/:serverId',
  authenticateToken,
  validateParams(commonValidation.serverId),
  checkServerPermission,
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);
      const { all = 'false' } = req.query;

      if (!req.serverPermission.can_view) {
        return res.status(403).json({
          error: '权限不足',
          message: '您没有权限查看此服务器的容器'
        });
      }

      // 首先尝试从缓存获取容器列表
      const cachedContainers = cacheService.getContainers(serverId);
      let containers;
      let fromCache = false;

      if (cachedContainers) {
        containers = cachedContainers.containers;
        fromCache = true;
        // 使用缓存容器列表
      } else {
        // 如果缓存中没有，从 Docker 服务获取
        containers = await dockerService.getContainers(serverId, all === 'true');
        // 从 Docker 服务获取容器列表
      }

      // 获取用户有权限的容器列表
      let userContainerIds = [];
      if (req.user.role !== 'admin') {
        const userContainers = await database.db.all(
          'SELECT container_id FROM user_containers WHERE user_id = ?',
          [req.user.id]
        );
        userContainerIds = userContainers.map(uc => uc.container_id);
        // 用户有权限的容器
      }

      // 根据权限过滤容器
      const filteredContainers = containers
        .filter(container => {
          // 管理员可以看到所有容器
          if (req.user.role === 'admin') {
            return true;
          }
          // 普通用户只能看到有权限的容器
          return userContainerIds.includes(container.id);
        })
        .map(container => {
          if (req.serverPermission.hide_sensitive_info) {
            return {
              ...container,
              id: container.id.substring(0, 12) + '...',
              ports: container.ports.map(port => ({
                ...port,
                publicPort: port.publicPort ? '***' : port.publicPort
              }))
            };
          }
          return container;
        });

      res.json({
        serverId,
        containers: filteredContainers,
        total: filteredContainers.length,
        fromCache,
        cacheAge: fromCache ? cachedContainers.cacheAge : 0
      });
    } catch (error) {
      logger.error('获取容器列表失败:', error);
      res.status(500).json({
        error: '获取容器列表失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route GET /api/containers/:serverId/:containerId
 * @desc 获取容器详细信息
 * @access Private
 */
router.get('/:serverId/:containerId',
  authenticateToken,
  validateParams(commonValidation.serverId.concat(commonValidation.containerId)),
  checkServerPermission,
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);
      const containerId = req.params.containerId;

      if (!req.serverPermission.can_view) {
        return res.status(403).json({
          error: '权限不足',
          message: '您没有权限查看此服务器的容器'
        });
      }

      const containerInfo = await dockerService.getContainerInfo(serverId, containerId);

      // 根据权限隐藏敏感信息
      if (req.serverPermission.hide_sensitive_info) {
        containerInfo.id = containerInfo.id.substring(0, 12) + '...';
        containerInfo.ports = Object.keys(containerInfo.ports).reduce((acc, key) => {
          acc[key] = containerInfo.ports[key].map(binding => ({
            ...binding,
            hostPort: '***'
          }));
          return acc;
        }, {});
      }

      res.json({
        serverId,
        container: containerInfo
      });
    } catch (error) {
      logger.error('获取容器详情失败:', error);
      res.status(500).json({
        error: '获取容器详情失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route POST /api/containers/:serverId/:containerId/start
 * @desc 启动容器
 * @access Private
 */
router.post('/:serverId/:containerId/start',
  authenticateToken,
  validateParams(commonValidation.serverId.concat(commonValidation.containerId)),
  checkServerPermission,
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);
      const containerId = req.params.containerId;

      if (!req.serverPermission.can_control) {
        return res.status(403).json({
          error: '权限不足',
          message: '您没有权限控制此服务器的容器'
        });
      }

      const result = await dockerService.startContainer(serverId, containerId);

      if (result.success) {
        // 发送容器事件通知
        try {
          const server = await database.db.get('SELECT name FROM servers WHERE id = ?', [serverId]);
          const container = await database.db.get('SELECT name FROM containers WHERE container_id = ?', [containerId]);
          
          if (server && container) {
            // 获取所有启用了容器事件通知的用户
            const users = await database.db.all(`
              SELECT u.id, uns.settings
              FROM users u
              JOIN user_notification_settings uns ON u.id = uns.user_id
              WHERE u.is_active = 1
              AND JSON_EXTRACT(uns.settings, '$.containerEvents') = 1
            `);

            for (const user of users) {
              const settings = JSON.parse(user.settings);
              await alertService.triggerContainerEvent(
                user.id,
                'start',
                container.name,
                server.name,
                { serverId, containerId }
              );
            }
          }
        } catch (notificationError) {
          logger.error('发送容器启动通知失败:', notificationError);
          // 不抛出错误，避免影响容器操作
        }

        res.json({
          message: '容器启动成功',
          result
        });
      } else {
        res.status(400).json({
          error: '容器启动失败',
          result
        });
      }
    } catch (error) {
      logger.error('启动容器失败:', error);
      res.status(500).json({
        error: '启动容器失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route POST /api/containers/:serverId/:containerId/stop
 * @desc 停止容器
 * @access Private
 */
router.post('/:serverId/:containerId/stop',
  authenticateToken,
  validateParams(commonValidation.serverId.concat(commonValidation.containerId)),
  checkServerPermission,
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);
      const containerId = req.params.containerId;
      const { timeout = 10 } = req.body;

      if (!req.serverPermission.can_control) {
        return res.status(403).json({
          error: '权限不足',
          message: '您没有权限控制此服务器的容器'
        });
      }

      const result = await dockerService.stopContainer(serverId, containerId, timeout);

      if (result.success) {
        // 发送容器事件通知
        try {
          const server = await database.db.get('SELECT name FROM servers WHERE id = ?', [serverId]);
          const container = await database.db.get('SELECT name FROM containers WHERE container_id = ?', [containerId]);
          
          if (server && container) {
            // 获取所有启用了容器事件通知的用户
            const users = await database.db.all(`
              SELECT u.id, uns.settings
              FROM users u
              JOIN user_notification_settings uns ON u.id = uns.user_id
              WHERE u.is_active = 1
              AND JSON_EXTRACT(uns.settings, '$.containerEvents') = 1
            `);

            for (const user of users) {
              await alertService.triggerContainerEvent(
                user.id,
                'stop',
                container.name,
                server.name,
                { serverId, containerId }
              );
            }
          }
        } catch (notificationError) {
          logger.error('发送容器停止通知失败:', notificationError);
        }

        res.json({
          message: '容器停止成功',
          result
        });
      } else {
        res.status(400).json({
          error: '容器停止失败',
          result
        });
      }
    } catch (error) {
      logger.error('停止容器失败:', error);
      res.status(500).json({
        error: '停止容器失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route POST /api/containers/:serverId/:containerId/restart
 * @desc 重启容器
 * @access Private
 */
router.post('/:serverId/:containerId/restart',
  authenticateToken,
  validateParams(commonValidation.serverId.concat(commonValidation.containerId)),
  checkServerPermission,
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);
      const containerId = req.params.containerId;
      const { timeout = 10 } = req.body;

      if (!req.serverPermission.can_control) {
        return res.status(403).json({
          error: '权限不足',
          message: '您没有权限控制此服务器的容器'
        });
      }

      const result = await dockerService.restartContainer(serverId, containerId, timeout);

      if (result.success) {
        // 发送容器事件通知
        try {
          const server = await database.db.get('SELECT name FROM servers WHERE id = ?', [serverId]);
          const container = await database.db.get('SELECT name FROM containers WHERE container_id = ?', [containerId]);
          
          if (server && container) {
            // 获取所有启用了容器事件通知的用户
            const users = await database.db.all(`
              SELECT u.id, uns.settings
              FROM users u
              JOIN user_notification_settings uns ON u.id = uns.user_id
              WHERE u.is_active = 1
              AND JSON_EXTRACT(uns.settings, '$.containerEvents') = 1
            `);

            for (const user of users) {
              await alertService.triggerContainerEvent(
                user.id,
                'restart',
                container.name,
                server.name,
                { serverId, containerId }
              );
            }
          }
        } catch (notificationError) {
          logger.error('发送容器重启通知失败:', notificationError);
        }

        res.json({
          message: '容器重启成功',
          result
        });
      } else {
        res.status(400).json({
          error: '容器重启失败',
          result
        });
      }
    } catch (error) {
      logger.error('重启容器失败:', error);
      res.status(500).json({
        error: '重启容器失败',
        message: '服务器内部错误'
      });
    }
  }
);


/**
 * @route DELETE /api/containers/:serverId/:containerId
 * @desc 删除容器
 * @access Private
 */
router.delete('/:serverId/:containerId',
  authenticateToken,
  validateParams(commonValidation.serverId.concat(commonValidation.containerId)),
  checkServerPermission,
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);
      const containerId = req.params.containerId;
      const { force = false } = req.body;

      if (!req.serverPermission.can_control) {
        return res.status(403).json({
          error: '权限不足',
          message: '您没有权限控制此服务器的容器'
        });
      }

      // 在删除前获取容器信息用于通知
      let containerName = null;
      let serverName = null;
      try {
        const server = await database.db.get('SELECT name FROM servers WHERE id = ?', [serverId]);
        const container = await database.db.get('SELECT name FROM containers WHERE container_id = ?', [containerId]);
        if (server && container) {
          serverName = server.name;
          containerName = container.name;
        }
      } catch (error) {
        logger.warn('获取容器信息失败:', error);
      }

      const result = await dockerService.removeContainer(serverId, containerId, force);

      if (result.success) {
        // 发送容器事件通知
        if (serverName && containerName) {
          try {
            // 获取所有启用了容器事件通知的用户
            const users = await database.db.all(`
              SELECT u.id, uns.settings
              FROM users u
              JOIN user_notification_settings uns ON u.id = uns.user_id
              WHERE u.is_active = 1
              AND JSON_EXTRACT(uns.settings, '$.containerEvents') = 1
            `);

            for (const user of users) {
              await alertService.triggerContainerEvent(
                user.id,
                'remove',
                containerName,
                serverName,
                { serverId, containerId }
              );
            }
          } catch (notificationError) {
            logger.error('发送容器删除通知失败:', notificationError);
          }
        }

        res.json({
          message: '容器删除成功',
          result
        });
      } else {
        res.status(400).json({
          error: '容器删除失败',
          result
        });
      }
    } catch (error) {
      logger.error('删除容器失败:', error);
      res.status(500).json({
        error: '删除容器失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route GET /api/containers/:serverId/:containerId/logs
 * @desc 获取容器日志
 * @access Private
 */
router.get('/:serverId/:containerId/logs',
  authenticateToken,
  validateParams(commonValidation.serverId.concat(commonValidation.containerId)),
  checkServerPermission,
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);
      const containerId = req.params.containerId;
      const { 
        tail = 100, 
        since = null, 
        until = null, 
        timestamps = true,
        follow = false 
      } = req.query;

      // 调试信息：记录权限检查结果
      logger.debug(`容器日志权限检查: 用户 ${req.user.id}, 服务器 ${serverId}, 权限:`, req.serverPermission);

      if (!req.serverPermission.can_view) {
        return res.status(403).json({
          error: '权限不足',
          message: '您没有权限查看此服务器的容器日志',
          debug: {
            userId: req.user.id,
            serverId: serverId,
            permissions: req.serverPermission,
            userRole: req.user.role
          }
        });
      }

      const options = {
        tail: parseInt(tail),
        timestamps: timestamps === 'true',
        since: since ? new Date(since) : undefined,
        until: until ? new Date(until) : undefined
      };

      const logs = await dockerService.getContainerLogs(serverId, containerId, options);

      res.json({
        serverId,
        containerId,
        logs,
        options
      });
    } catch (error) {
      logger.error('获取容器日志失败:', error);
      res.status(500).json({
        error: '获取容器日志失败',
        message: '服务器内部错误'
      });
    }
  }
);


export default router;
