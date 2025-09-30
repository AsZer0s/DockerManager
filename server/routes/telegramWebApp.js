import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

import database from '../config/database.js';
import logger from '../utils/logger.js';
import dockerService from '../services/dockerService.js';

const router = express.Router();

// 验证 Telegram Web App 数据
function verifyTelegramWebAppData(initData, botToken) {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    
    // 按字母顺序排序参数
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    // 创建密钥
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    
    // 计算哈希
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    
    return calculatedHash === hash;
  } catch (error) {
    logger.error('验证 Telegram Web App 数据失败:', error);
    return false;
  }
}

// 中间件：验证 JWT Token
const authenticateJWT = async (req, res, next) => {
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
    
    // 查找数据库中的用户
    const user = await database.db.get(
      'SELECT * FROM users WHERE id = ? AND is_active = 1',
      [decoded.userId]
    );

    if (!user) {
      return res.status(403).json({
        error: '用户不存在',
        message: '用户已被删除或禁用'
      });
    }

    req.user = user;
    req.telegramUser = { id: decoded.telegramId };
    next();
  } catch (error) {
    logger.error('JWT 认证失败:', error);
    return res.status(401).json({
      error: '认证失败',
      message: '令牌无效或已过期'
    });
  }
};

// 中间件：验证 Telegram Web App 认证
const authenticateTelegramWebApp = async (req, res, next) => {
  try {
    // 首先尝试 JWT 认证（用于 GET 请求）
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const user = await database.db.get(
          'SELECT * FROM users WHERE id = ? AND is_active = 1',
          [decoded.userId]
        );

        if (user) {
          req.user = user;
          req.telegramUser = { id: decoded.telegramId };
          next();
          return;
        }
      } catch (jwtError) {
        // JWT 认证失败，继续尝试其他方式
        logger.warn('JWT 认证失败，尝试其他认证方式:', jwtError.message);
      }
    }

    // 尝试从请求体获取 user_id（用于 POST 请求）
    const { user_id, chat_id, message_id, initData } = req.body;
    
    if (user_id) {
      logger.info(`使用 user_id 认证: ${user_id}`);
      
      // 查找数据库中的用户
      const user = await database.db.get(
        'SELECT * FROM users WHERE telegram_id = ? AND is_active = 1',
        [user_id]
      );

      if (!user) {
        return res.status(403).json({
          error: '用户未注册',
          message: '请先在 Web 界面中注册并绑定 Telegram ID'
        });
      }

      req.user = user;
      req.telegramUser = { id: user_id };
      req.chat_id = chat_id;
      req.message_id = message_id;
      next();
      return;
    }
    
    // 回退到 initData 方式认证
    if (!initData) {
      return res.status(401).json({
        error: '未授权',
        message: '缺少用户ID或 Telegram Web App 初始化数据'
      });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken || botToken === 'your_telegram_bot_token_here') {
      return res.status(500).json({
        error: '配置错误',
        message: 'Telegram Bot Token 未配置'
      });
    }

    // 验证 Telegram Web App 数据
    if (!verifyTelegramWebAppData(initData, botToken)) {
      return res.status(401).json({
        error: '验证失败',
        message: 'Telegram Web App 数据验证失败'
      });
    }

    // 解析用户数据
    const urlParams = new URLSearchParams(initData);
    const userParam = urlParams.get('user');
    
    if (!userParam) {
      return res.status(401).json({
        error: '用户数据缺失',
        message: '无法获取用户信息'
      });
    }

    const telegramUser = JSON.parse(userParam);
    req.telegramUser = telegramUser;

    // 查找数据库中的用户
    const user = await database.db.get(
      'SELECT * FROM users WHERE telegram_id = ? AND is_active = 1',
      [telegramUser.id]
    );

    if (!user) {
      return res.status(403).json({
        error: '用户未注册',
        message: '请先在 Web 界面中注册并绑定 Telegram ID'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Telegram Web App 认证失败:', error);
    return res.status(401).json({
      error: '认证失败',
      message: '用户认证过程中发生错误'
    });
  }
};

/**
 * @route POST /api/telegram-webapp/log
 * @desc 接收前端日志
 * @access Public
 */
router.post('/log', async (req, res) => {
  try {
    const { level, message, data, timestamp, userAgent, url } = req.body;
    
    // 构建日志消息
    let logMessage = `[Telegram WebApp] ${message}`;
    if (data) {
      logMessage += ` | 数据: ${JSON.stringify(data)}`;
    }
    if (userAgent) {
      logMessage += ` | UA: ${userAgent}`;
    }
    if (url) {
      logMessage += ` | URL: ${url}`;
    }
    
    // 根据日志级别输出
    switch (level) {
      case 'error':
        logger.error(logMessage);
        break;
      case 'warn':
        logger.warn(logMessage);
        break;
      case 'info':
      default:
        logger.info(logMessage);
        break;
    }
    
    res.json({ success: true });
  } catch (error) {
    logger.error('处理前端日志失败:', error);
    res.status(500).json({ success: false, error: '日志处理失败' });
  }
});

/**
 * @route POST /api/telegram-webapp/auth
 * @desc 验证 Telegram Web App 用户身份
 * @access Public
 */
router.post('/auth', authenticateTelegramWebApp, async (req, res) => {
  try {
    // 生成 JWT token
    const token = jwt.sign(
      { 
        userId: req.user.id,
        telegramId: req.telegramUser.id,
        username: req.user.username,
        role: req.user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role,
        telegramId: req.telegramUser.id
      }
    });
  } catch (error) {
    logger.error('生成认证令牌失败:', error);
    res.status(500).json({
      error: '认证失败',
      message: '生成认证令牌时发生错误'
    });
  }
});

/**
 * @route GET /api/telegram-webapp/servers
 * @desc 获取用户可访问的服务器列表
 * @access Private (Telegram Web App)
 */
router.get('/servers', authenticateTelegramWebApp, async (req, res) => {
  try {
    const servers = await getUserServers(req.user.id);
    
    // 检查服务器状态
    const serversWithStatus = await Promise.all(servers.map(async (server) => {
      const status = await checkServerStatus(server.id);
      return {
        ...server,
        status: status ? 'online' : 'offline',
        statusIcon: status ? '🟢' : '🔴'
      };
    }));

    res.json({
      success: true,
      servers: serversWithStatus,
      total: serversWithStatus.length
    });
  } catch (error) {
    logger.error('获取服务器列表失败:', error);
    res.status(500).json({
      error: '获取服务器列表失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route POST /api/telegram-webapp/servers
 * @desc 获取用户可访问的服务器列表（POST 方式）
 * @access Private (Telegram Web App)
 */
router.post('/servers', authenticateTelegramWebApp, async (req, res) => {
  try {
    const servers = await getUserServers(req.user.id);
    
    // 检查服务器状态
    const serversWithStatus = await Promise.all(servers.map(async (server) => {
      const status = await checkServerStatus(server.id);
      return {
        ...server,
        status: status ? 'online' : 'offline',
        statusIcon: status ? '🟢' : '🔴'
      };
    }));

    res.json({
      success: true,
      servers: serversWithStatus,
      total: serversWithStatus.length
    });
  } catch (error) {
    logger.error('获取服务器列表失败:', error);
    res.status(500).json({
      error: '获取服务器列表失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route GET /api/telegram-webapp/servers/:serverId/containers
 * @desc 获取指定服务器的容器列表
 * @access Private (Telegram Web App)
 */
router.get('/servers/:serverId/containers', authenticateTelegramWebApp, async (req, res) => {
  try {
    const serverId = parseInt(req.params.serverId);
    
    // 检查用户是否有权限访问此服务器
    const hasPermission = await checkUserServerPermission(req.user.id, serverId);
    if (!hasPermission) {
      return res.status(403).json({
        error: '权限不足',
        message: '您没有权限访问此服务器'
      });
    }

    const containers = await dockerService.getContainers(serverId);
    
    // 统计容器状态
    const runningCount = containers.filter(c => c.status === 'running').length;
    const stoppedCount = containers.filter(c => c.status !== 'running').length;

    res.json({
      success: true,
      serverId,
      containers,
      statistics: {
        total: containers.length,
        running: runningCount,
        stopped: stoppedCount
      }
    });
  } catch (error) {
    logger.error('获取容器列表失败:', error);
    res.status(500).json({
      error: '获取容器列表失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route POST /api/telegram-webapp/servers/:serverId/containers
 * @desc 获取指定服务器的容器列表（POST 方式）
 * @access Private (Telegram Web App)
 */
router.post('/servers/:serverId/containers', authenticateTelegramWebApp, async (req, res) => {
  try {
    const serverId = parseInt(req.params.serverId);
    
    // 检查用户是否有权限访问此服务器
    const hasPermission = await checkUserServerPermission(req.user.id, serverId);
    if (!hasPermission) {
      return res.status(403).json({
        error: '权限不足',
        message: '您没有权限访问此服务器'
      });
    }

    // 获取容器列表
    const containers = await dockerService.getContainers(serverId);
    
    res.json({
      success: true,
      containers: containers,
      total: containers.length
    });
  } catch (error) {
    logger.error('获取容器列表失败:', error);
    res.status(500).json({
      error: '获取容器列表失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route GET /api/telegram-webapp/containers/:serverId/:containerId
 * @desc 获取容器详细信息
 * @access Private (Telegram Web App)
 */
router.get('/containers/:serverId/:containerId', authenticateTelegramWebApp, async (req, res) => {
  try {
    const serverId = parseInt(req.params.serverId);
    const containerId = req.params.containerId;
    
    // 检查用户是否有权限访问此服务器
    const hasPermission = await checkUserServerPermission(req.user.id, serverId);
    if (!hasPermission) {
      return res.status(403).json({
        error: '权限不足',
        message: '您没有权限访问此服务器'
      });
    }

    const container = await dockerService.getContainer(serverId, containerId);
    
    if (!container) {
      return res.status(404).json({
        error: '容器不存在',
        message: '未找到指定的容器'
      });
    }

    res.json({
      success: true,
      container
    });
  } catch (error) {
    logger.error('获取容器详情失败:', error);
    res.status(500).json({
      error: '获取容器详情失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route POST /api/telegram-webapp/containers/:serverId/:containerId
 * @desc 获取容器详细信息（POST 方式）
 * @access Private (Telegram Web App)
 */
router.post('/containers/:serverId/:containerId', authenticateTelegramWebApp, async (req, res) => {
  try {
    const serverId = parseInt(req.params.serverId);
    const containerId = req.params.containerId;
    
    // 检查用户是否有权限访问此服务器
    const hasPermission = await checkUserServerPermission(req.user.id, serverId);
    if (!hasPermission) {
      return res.status(403).json({
        error: '权限不足',
        message: '您没有权限访问此服务器'
      });
    }

    // 获取容器详细信息
    const container = await dockerService.getContainerInfo(serverId, containerId);
    
    if (!container) {
      return res.status(404).json({
        error: '容器不存在',
        message: '找不到指定的容器'
      });
    }
    
    res.json({
      success: true,
      container: container
    });
  } catch (error) {
    logger.error('获取容器详情失败:', error);
    res.status(500).json({
      error: '获取容器详情失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route POST /api/telegram-webapp/containers/:serverId/:containerId/:action
 * @desc 执行容器操作（启动、停止、重启）
 * @access Private (Telegram Web App)
 */
router.post('/containers/:serverId/:containerId/:action', authenticateTelegramWebApp, async (req, res) => {
  try {
    const serverId = parseInt(req.params.serverId);
    const containerId = req.params.containerId;
    const action = req.params.action;
    
    // 检查用户是否有权限控制此服务器
    const hasControlPermission = await checkUserServerControlPermission(req.user.id, serverId);
    if (!hasControlPermission) {
      return res.status(403).json({
        error: '权限不足',
        message: '您没有权限控制此服务器的容器'
      });
    }

    let result;
    let actionText;

    switch (action) {
      case 'start':
        result = await dockerService.startContainer(serverId, containerId);
        actionText = '启动';
        break;
      case 'stop':
        result = await dockerService.stopContainer(serverId, containerId);
        actionText = '停止';
        break;
      case 'restart':
        result = await dockerService.restartContainer(serverId, containerId);
        actionText = '重启';
        break;
      default:
        return res.status(400).json({
          error: '不支持的操作',
          message: `不支持的操作: ${action}`
        });
    }

    if (result.success) {
      res.json({
        success: true,
        message: `容器${actionText}成功`,
        result
      });
    } else {
      res.status(400).json({
        success: false,
        message: `容器${actionText}失败`,
        error: result.message
      });
    }
  } catch (error) {
    logger.error('执行容器操作失败:', error);
    res.status(500).json({
      error: '操作失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route GET /api/telegram-webapp/containers/:serverId/:containerId/logs
 * @desc 获取容器日志
 * @access Private (Telegram Web App)
 */
router.get('/containers/:serverId/:containerId/logs', authenticateTelegramWebApp, async (req, res) => {
  try {
    const serverId = parseInt(req.params.serverId);
    const containerId = req.params.containerId;
    const { tail = 50 } = req.query;
    
    // 检查用户是否有权限访问此服务器
    const hasPermission = await checkUserServerPermission(req.user.id, serverId);
    if (!hasPermission) {
      return res.status(403).json({
        error: '权限不足',
        message: '您没有权限访问此服务器'
      });
    }

    const logs = await dockerService.getContainerLogs(serverId, containerId, { tail: parseInt(tail) });

    res.json({
      success: true,
      logs: logs || [],
      tail: parseInt(tail)
    });
  } catch (error) {
    logger.error('获取容器日志失败:', error);
    res.status(500).json({
      error: '获取日志失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route GET /api/telegram-webapp/containers/:serverId/:containerId/stats
 * @desc 获取容器监控数据
 * @access Private (Telegram Web App)
 */
router.get('/containers/:serverId/:containerId/stats', authenticateTelegramWebApp, async (req, res) => {
  try {
    const serverId = parseInt(req.params.serverId);
    const containerId = req.params.containerId;
    
    // 检查用户是否有权限访问此服务器
    const hasPermission = await checkUserServerPermission(req.user.id, serverId);
    if (!hasPermission) {
      return res.status(403).json({
        error: '权限不足',
        message: '您没有权限访问此服务器'
      });
    }

    const stats = await dockerService.getContainerStats(serverId, containerId);

    res.json({
      success: true,
      stats: stats || {},
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('获取容器监控数据失败:', error);
    res.status(500).json({
      error: '获取监控数据失败',
      message: '服务器内部错误'
    });
  }
});

// 辅助函数
async function getUserServers(userId) {
  try {
    // 首先检查用户是否是管理员
    const user = await database.db.get(
      'SELECT role FROM users WHERE id = ? AND is_active = 1',
      [userId]
    );

    if (!user) {
      logger.error('用户不存在:', userId);
      return [];
    }

    // 如果是管理员，返回所有服务器
    if (user.role === 'admin') {
      const servers = await database.db.all(`
        SELECT s.*, 1 as can_view, 1 as can_control, 1 as can_ssh, 0 as hide_sensitive_info
        FROM servers s
        WHERE s.is_active = 1
        ORDER BY s.name
      `);
      logger.info(`管理员用户 ${userId} 获取所有服务器: ${servers.length} 个`);
      return servers;
    }

    // 普通用户，只返回有权限的服务器
    const servers = await database.db.all(`
      SELECT s.*, p.can_view, p.can_control, p.can_ssh, p.hide_sensitive_info
      FROM servers s
      JOIN user_server_permissions p ON s.id = p.server_id
      WHERE p.user_id = ? AND s.is_active = 1 AND p.can_view = 1
      ORDER BY s.name
    `, [userId]);
    logger.info(`普通用户 ${userId} 获取有权限的服务器: ${servers.length} 个`);
    return servers;
  } catch (error) {
    logger.error('获取用户服务器失败:', error);
    return [];
  }
}

async function checkServerStatus(serverId) {
  try {
    // 获取服务器信息
    const server = await database.db.get(
      'SELECT * FROM servers WHERE id = ? AND is_active = 1',
      [serverId]
    );
    
    if (!server) {
      logger.warn(`服务器 ${serverId} 不存在或未激活`);
      return false;
    }
    
    // 使用监控服务实时检查服务器连接状态
    const monitoringService = (await import('../services/monitoringService.js')).default;
    const isOnline = await monitoringService.checkServerConnection(serverId);
    
    logger.info(`服务器 ${server.name} (${serverId}) 状态检测: ${isOnline ? '在线' : '离线'}`);
    return isOnline;
  } catch (error) {
    logger.error('检查服务器状态失败:', error);
    return false;
  }
}

async function checkUserServerPermission(userId, serverId) {
  try {
    // 首先检查用户是否是管理员
    const user = await database.db.get(
      'SELECT role FROM users WHERE id = ? AND is_active = 1',
      [userId]
    );

    if (!user) {
      logger.error('用户不存在:', userId);
      return false;
    }

    // 如果是管理员，默认有所有权限
    if (user.role === 'admin') {
      logger.info(`管理员用户 ${userId} 访问服务器 ${serverId} 权限检查: 通过`);
      return true;
    }

    // 普通用户检查具体权限
    const permission = await database.db.get(
      'SELECT can_view FROM user_server_permissions WHERE user_id = ? AND server_id = ?',
      [userId, serverId]
    );
    const hasPermission = permission && permission.can_view;
    logger.info(`普通用户 ${userId} 访问服务器 ${serverId} 权限检查: ${hasPermission ? '通过' : '拒绝'}`);
    return hasPermission;
  } catch (error) {
    logger.error('检查用户服务器权限失败:', error);
    return false;
  }
}

async function checkUserServerControlPermission(userId, serverId) {
  try {
    // 首先检查用户是否是管理员
    const user = await database.db.get(
      'SELECT role FROM users WHERE id = ? AND is_active = 1',
      [userId]
    );

    if (!user) {
      logger.error('用户不存在:', userId);
      return false;
    }

    // 如果是管理员，默认有所有权限
    if (user.role === 'admin') {
      logger.info(`管理员用户 ${userId} 控制服务器 ${serverId} 权限检查: 通过`);
      return true;
    }

    // 普通用户检查具体权限
    const permission = await database.db.get(
      'SELECT can_control FROM user_server_permissions WHERE user_id = ? AND server_id = ?',
      [userId, serverId]
    );
    const hasPermission = permission && permission.can_control;
    logger.info(`普通用户 ${userId} 控制服务器 ${serverId} 权限检查: ${hasPermission ? '通过' : '拒绝'}`);
    return hasPermission;
  } catch (error) {
    logger.error('检查用户服务器控制权限失败:', error);
    return false;
  }
}

export default router;
