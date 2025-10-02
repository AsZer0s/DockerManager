import express from 'express';
import logger from '../utils/logger.js';
import database from '../config/database.js';
import dockerService from '../services/dockerService.js';
import monitoringService from '../services/monitoringService.js';

const router = express.Router();

/**
 * @route POST /api/telegram-webapp/auth
 * @desc 用户认证（Telegram WebApp专用）
 * @access Public
 */
router.post('/auth', async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: '用户ID不能为空'
      });
    }

    // 验证用户权限
    const user = await database.db.get(
      'SELECT * FROM users WHERE telegram_id = ? AND (is_active = 1 OR is_active = true)',
      [user_id.toString()]
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户未找到或未激活'
      });
    }

    // 生成临时token（可选，用于后续请求验证）
    const token = `tg_${user_id}_${Date.now()}`;

    res.json({
      success: true,
      token: token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        telegram_id: user.telegram_id
      }
    });

  } catch (error) {
    logger.error('用户认证失败:', error);
    res.status(500).json({
      success: false,
      message: '用户认证失败'
    });
  }
});

/**
 * @route POST /api/telegram-webapp/log
 * @desc 记录日志（Telegram WebApp专用）
 * @access Public
 */
router.post('/log', async (req, res) => {
  try {
    const { level, message, data, timestamp, userAgent, url } = req.body;

    // 记录到服务器日志
    const logMessage = `[Telegram WebApp] ${level.toUpperCase()}: ${message}`;
    const logData = {
      level,
      message,
      data,
      timestamp,
      userAgent,
      url
    };

    switch (level.toLowerCase()) {
      case 'error':
        logger.error(logMessage, logData);
        break;
      case 'warn':
        logger.warn(logMessage, logData);
        break;
      case 'info':
      default:
        logger.info(logMessage, logData);
        break;
    }

    res.json({
      success: true,
      message: '日志记录成功'
    });

  } catch (error) {
    logger.error('记录日志失败:', error);
    res.status(500).json({
      success: false,
      message: '记录日志失败'
    });
  }
});

/**
 * @route POST /api/telegram-webapp/servers/:serverId/containers
 * @desc 获取指定服务器的容器列表（Telegram WebApp专用）
 * @access Public
 */
router.post('/servers/:serverId/containers', async (req, res) => {
  try {
    const { serverId } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: '用户ID不能为空'
      });
    }

    // 验证用户权限
    const user = await database.db.get(
      'SELECT * FROM users WHERE telegram_id = ? AND (is_active = 1 OR is_active = true)',
      [user_id.toString()]
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户未找到或未激活'
      });
    }

    // 检查用户是否有权限访问此服务器
    const hasPermission = await checkUserServerPermission(user.id, parseInt(serverId));
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: '没有权限访问此服务器'
      });
    }

    // 获取容器列表
    const containers = await dockerService.getContainers(parseInt(serverId));
    
    // 格式化容器数据
    const formattedContainers = containers.map(container => ({
      id: container.id,
      name: container.name,
      image: container.image,
      status: container.status,
      created: container.created,
      ports: container.ports || [],
      isRunning: isContainerRunning(container)
    }));

    res.json({
      success: true,
      containers: formattedContainers
    });

  } catch (error) {
    logger.error('获取容器列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取容器列表失败'
    });
  }
});

/**
 * @route POST /api/telegram-webapp/servers/:serverId/containers/:containerId/action
 * @desc 执行容器操作（Telegram WebApp专用）
 * @access Public
 */
router.post('/servers/:serverId/containers/:containerId/action', async (req, res) => {
  try {
    const { serverId, containerId } = req.params;
    const { user_id, action } = req.body;

    if (!user_id || !action) {
      return res.status(400).json({
        success: false,
        message: '用户ID和操作类型不能为空'
      });
    }

    // 验证用户权限
    const user = await database.db.get(
      'SELECT * FROM users WHERE telegram_id = ? AND (is_active = 1 OR is_active = true)',
      [user_id.toString()]
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户未找到或未激活'
      });
    }

    // 检查用户是否有权限控制此服务器
    const hasControlPermission = await checkUserServerControlPermission(user.id, parseInt(serverId));
    if (!hasControlPermission) {
      return res.status(403).json({
        success: false,
        message: '没有权限控制此服务器'
      });
    }

    // 执行容器操作
    let result;
    let actionText;

    switch (action) {
      case 'start':
        result = await dockerService.startContainer(parseInt(serverId), containerId);
        actionText = '启动';
        break;
      case 'stop':
        result = await dockerService.stopContainer(parseInt(serverId), containerId);
        actionText = '停止';
        break;
      case 'restart':
        result = await dockerService.restartContainer(parseInt(serverId), containerId);
        actionText = '重启';
        break;
      default:
        return res.status(400).json({
          success: false,
          message: '不支持的操作类型'
        });
    }

    if (result.success) {
      res.json({
        success: true,
        message: `容器${actionText}成功`
      });
    } else {
      res.json({
        success: false,
        message: `容器${actionText}失败：${result.message}`
      });
    }

  } catch (error) {
    logger.error('执行容器操作失败:', error);
    res.status(500).json({
      success: false,
      message: '执行容器操作失败'
    });
  }
});

/**
 * @route GET /api/telegram-webapp/servers
 * @desc 获取用户可访问的服务器列表（Telegram WebApp专用）
 * @access Public
 */
router.get('/servers', async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: '用户ID不能为空'
      });
    }

    // 验证用户权限
    const user = await database.db.get(
      'SELECT * FROM users WHERE telegram_id = ? AND (is_active = 1 OR is_active = true)',
      [user_id.toString()]
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户未找到或未激活'
      });
    }

    // 获取用户可访问的服务器列表
    const servers = await getUserServers(user.id);
    
    // 获取服务器状态
    const serversWithStatus = await Promise.all(
      servers.map(async (server) => {
        const isOnline = await monitoringService.checkServerConnection(server.id);
        return {
          id: server.id,
          name: server.name,
          description: server.description,
          host: server.host,
          port: server.port,
          isOnline,
          canView: server.can_view,
          canControl: server.can_control
        };
      })
    );

    res.json({
      success: true,
      servers: serversWithStatus
    });

  } catch (error) {
    logger.error('获取服务器列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取服务器列表失败'
    });
  }
});

/**
 * @route GET /api/telegram-webapp/servers/:serverId/status
 * @desc 获取服务器状态（Telegram WebApp专用）
 * @access Public
 */
router.get('/servers/:serverId/status', async (req, res) => {
  try {
    const { serverId } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: '用户ID不能为空'
      });
    }

    // 验证用户权限
    const user = await database.db.get(
      'SELECT * FROM users WHERE telegram_id = ? AND (is_active = 1 OR is_active = true)',
      [user_id.toString()]
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户未找到或未激活'
      });
    }

    // 检查用户是否有权限访问此服务器
    const hasPermission = await checkUserServerPermission(user.id, parseInt(serverId));
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: '没有权限访问此服务器'
      });
    }

    // 获取服务器状态和性能数据
    const isOnline = await monitoringService.checkServerConnection(parseInt(serverId));
    const serverStats = await monitoringService.getLatestServerStats(parseInt(serverId));

    res.json({
      success: true,
      status: {
        isOnline,
        stats: serverStats
      }
    });

  } catch (error) {
    logger.error('获取服务器状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取服务器状态失败'
    });
  }
});

// 辅助函数：检查用户服务器权限
async function checkUserServerPermission(userId, serverId) {
  try {
    // 首先检查用户是否为管理员
    const user = await database.db.get(
      'SELECT role FROM users WHERE id = ?',
      [userId]
    );

    if (user && user.role === 'admin') {
      return true;
    }

    // 普通用户查询权限表
    const result = await database.db.get(
      'SELECT can_view FROM user_server_permissions WHERE user_id = ? AND server_id = ?',
      [userId, serverId]
    );
    return result && result.can_view;
  } catch (error) {
    logger.error('检查用户服务器权限失败:', error);
    return false;
  }
}

// 辅助函数：检查用户服务器控制权限
async function checkUserServerControlPermission(userId, serverId) {
  try {
    // 首先检查用户是否为管理员
    const user = await database.db.get(
      'SELECT role FROM users WHERE id = ?',
      [userId]
    );

    if (user && user.role === 'admin') {
      return true;
    }

    // 普通用户查询权限表
    const result = await database.db.get(
      'SELECT can_control FROM user_server_permissions WHERE user_id = ? AND server_id = ?',
      [userId, serverId]
    );
    return result && result.can_control;
  } catch (error) {
    logger.error('检查用户服务器控制权限失败:', error);
    return false;
  }
}

// 辅助函数：获取用户服务器列表
async function getUserServers(userId) {
  try {
    // 首先检查用户是否为管理员
    const user = await database.db.get(
      'SELECT role FROM users WHERE id = ?',
      [userId]
    );

    if (user && user.role === 'admin') {
      // 管理员默认拥有所有服务器权限
      const servers = await database.db.all(`
        SELECT s.*, 1 as can_view, 1 as can_control, 1 as can_ssh, 0 as hide_sensitive_info
        FROM servers s
        WHERE s.is_active = 1
        ORDER BY s.name
      `);
      return servers;
    }

    // 普通用户查询权限表
    const servers = await database.db.all(`
      SELECT s.*, p.can_view, p.can_control, p.can_ssh, p.hide_sensitive_info
      FROM servers s
      JOIN user_server_permissions p ON s.id = p.server_id
      WHERE p.user_id = ? AND (s.is_active = 1 OR s.is_active = true) AND (p.can_view = 1 OR p.can_view = true)
      ORDER BY s.name
    `, [userId]);
    return servers;
  } catch (error) {
    logger.error('获取用户服务器失败:', error);
    return [];
  }
}

// 辅助函数：检查容器是否运行中
function isContainerRunning(container) {
  if (!container || !container.status) {
    return false;
  }
  
  const status = container.status.toLowerCase();
  return status === 'running' || 
         status.includes('up') || 
         status.includes('running');
}

export default router;
