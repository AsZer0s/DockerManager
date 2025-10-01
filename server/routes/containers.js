import express from 'express';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';

import database from '../config/database.js';
import logger from '../utils/logger.js';
import dockerService from '../services/dockerService.js';
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
    
    const result = await database.query(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: '令牌无效',
        message: '用户不存在或已禁用'
      });
    }

    req.user = result.rows[0];
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
      req.serverPermission = { canView: true, canControl: true, canSsh: true, hideSensitiveInfo: false };
      return next();
    }

    // 先检查服务器是否存在
    const serverExists = await database.query(
      'SELECT id FROM servers WHERE id = $1 AND is_active = true',
      [serverId]
    );

    if (serverExists.rows.length === 0) {
      return res.status(404).json({
        error: '服务器不存在',
        message: '指定的服务器不存在或已被禁用'
      });
    }

    // 检查用户权限
    const result = await database.query(
      'SELECT can_view, can_control, can_ssh, hide_sensitive_info FROM user_server_permissions WHERE user_id = $1 AND server_id = $2',
      [req.user.id, serverId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({
        error: '权限不足',
        message: '您没有权限访问此服务器'
      });
    }

    req.serverPermission = result.rows[0];
    next();
  } catch (error) {
    return res.status(500).json({
      error: '权限检查失败',
      message: '服务器内部错误'
    });
  }
};

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

      if (!req.serverPermission.canView) {
        return res.status(403).json({
          error: '权限不足',
          message: '您没有权限查看此服务器的容器'
        });
      }

      const containers = await dockerService.getContainers(serverId, all === 'true');

      // 根据权限隐藏敏感信息
      const filteredContainers = containers.map(container => {
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
        total: filteredContainers.length
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

      if (!req.serverPermission.canView) {
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

      if (!req.serverPermission.canControl) {
        return res.status(403).json({
          error: '权限不足',
          message: '您没有权限控制此服务器的容器'
        });
      }

      const result = await dockerService.startContainer(serverId, containerId);

      if (result.success) {
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

      if (!req.serverPermission.canControl) {
        return res.status(403).json({
          error: '权限不足',
          message: '您没有权限控制此服务器的容器'
        });
      }

      const result = await dockerService.stopContainer(serverId, containerId, timeout);

      if (result.success) {
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

      if (!req.serverPermission.canControl) {
        return res.status(403).json({
          error: '权限不足',
          message: '您没有权限控制此服务器的容器'
        });
      }

      const result = await dockerService.restartContainer(serverId, containerId, timeout);

      if (result.success) {
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

      if (!req.serverPermission.canControl) {
        return res.status(403).json({
          error: '权限不足',
          message: '您没有权限控制此服务器的容器'
        });
      }

      const result = await dockerService.removeContainer(serverId, containerId, force);

      if (result.success) {
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

      if (!req.serverPermission.canView) {
        return res.status(403).json({
          error: '权限不足',
          message: '您没有权限查看此服务器的容器日志'
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
