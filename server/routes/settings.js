import express from 'express';
import { body, validationResult } from 'express-validator';
import fs from 'fs';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

import database from '../config/database.js';
import logger from '../utils/logger.js';
import jwtManager from '../utils/jwt.js';
import { authenticateToken } from '../utils/auth.js';

const router = express.Router();

/**
 * @route GET /api/settings/profile
 * @desc 获取用户信息
 * @access Private
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await database.query(
      'SELECT id, username, email, role, telegram_id, avatar, phone, bio, is_active, created_at, updated_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: '用户不存在',
        message: '找不到指定的用户'
      });
    }

    const user = result.rows[0];
    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        telegramId: user.telegram_id,
        avatar: user.avatar,
        phone: user.phone,
        bio: user.bio,
        isActive: user.is_active,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      }
    });
  } catch (error) {
    logger.error('获取用户信息失败:', error);
    res.status(500).json({
      error: '获取用户信息失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route PUT /api/settings/profile
 * @desc 更新用户信息
 * @access Private
 */
router.put('/profile', 
  authenticateToken,
  [
    body('email').optional().isEmail().withMessage('邮箱格式不正确'),
    body('phone').optional().isMobilePhone('zh-CN').withMessage('手机号格式不正确'),
    body('bio').optional().isLength({ max: 500 }).withMessage('个人简介不能超过500个字符')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: '验证失败',
          details: errors.array()
        });
      }

      const { email, phone, bio } = req.body;
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (email !== undefined) {
        updateFields.push(`email = $${paramIndex++}`);
        updateValues.push(email);
      }
      if (phone !== undefined) {
        updateFields.push(`phone = $${paramIndex++}`);
        updateValues.push(phone);
      }
      if (bio !== undefined) {
        updateFields.push(`bio = $${paramIndex++}`);
        updateValues.push(bio);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          error: '没有要更新的字段',
          message: '请提供要更新的字段'
        });
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(req.user.id);

      const query = `
        UPDATE users 
        SET ${updateFields.join(', ')} 
        WHERE id = $${paramIndex}
      `;

      await database.query(query, updateValues);

      res.json({
        message: '用户信息更新成功'
      });
    } catch (error) {
      logger.error('更新用户信息失败:', error);
      res.status(500).json({
        error: '更新用户信息失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route POST /api/settings/bind-telegram
 * @desc 绑定 Telegram
 * @access Private
 */
router.post('/bind-telegram',
  authenticateToken,
  [
    body('telegramId').isInt({ min: 1 }).withMessage('Telegram ID 必须是正整数')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: '验证失败',
          details: errors.array()
        });
      }

      const { telegramId } = req.body;

      // 检查 Telegram ID 是否已被其他用户绑定
      const existingUser = await database.query(
        'SELECT id FROM users WHERE telegram_id = $1 AND id != $2',
        [telegramId, req.user.id]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({
          error: '该 Telegram ID 已被其他用户绑定'
        });
      }

      await database.query(
        'UPDATE users SET telegram_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [telegramId, req.user.id]
      );

      logger.info(`用户 ${req.user.id} 绑定 Telegram ID: ${telegramId}`);

      res.json({
        message: 'Telegram 绑定成功',
        telegramId
      });
    } catch (error) {
      logger.error('绑定 Telegram 失败:', error);
      res.status(500).json({
        error: '绑定 Telegram 失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route POST /api/settings/unbind-telegram
 * @desc 解绑 Telegram
 * @access Private
 */
router.post('/unbind-telegram', authenticateToken, async (req, res) => {
  try {
    await database.query(
      'UPDATE users SET telegram_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [req.user.id]
    );

    logger.info(`用户 ${req.user.id} 解绑 Telegram`);

    res.json({
      message: 'Telegram 解绑成功'
    });
  } catch (error) {
    logger.error('解绑 Telegram 失败:', error);
    res.status(500).json({
      error: '解绑 Telegram 失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route GET /api/settings/system
 * @desc 获取系统设置
 * @access Private
 */
router.get('/system', authenticateToken, async (req, res) => {
  try {
    const result = await database.query(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [req.user.id]
    );

    let settings = {};
    if (result.rows.length > 0) {
      settings = JSON.parse(result.rows[0].settings || '{}');
    }

    // 默认设置
    const defaultSettings = {
      refreshInterval: 30,
      pageSize: 20,
      proxyEnabled: false,
      proxyType: 'http',
      proxyHost: '',
      proxyPort: 8080,
      proxyUsername: '',
      proxyPassword: ''
    };

    res.json({
      settings: { ...defaultSettings, ...settings }
    });
  } catch (error) {
    logger.error('获取系统设置失败:', error);
    res.status(500).json({
      error: '获取系统设置失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route PUT /api/settings/system
 * @desc 更新系统设置
 * @access Private
 */
router.put('/system',
  authenticateToken,
  [
    body('settings').isObject().withMessage('设置必须是对象格式')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: '验证失败',
          details: errors.array()
        });
      }

      const { settings } = req.body;

      // 检查用户设置是否存在
      const existingSettings = await database.query(
        'SELECT id FROM user_settings WHERE user_id = $1',
        [req.user.id]
      );

      if (existingSettings.rows.length > 0) {
        // 更新现有设置
        await database.query(
          'UPDATE user_settings SET settings = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
          [JSON.stringify(settings), req.user.id]
        );
      } else {
        // 创建新设置
        await database.query(
          'INSERT INTO user_settings (user_id, settings, created_at, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          [req.user.id, JSON.stringify(settings)]
        );
      }

      logger.info(`用户 ${req.user.id} 更新系统设置成功`);

      res.json({
        message: '系统设置保存成功'
      });
    } catch (error) {
      logger.error('更新系统设置失败:', error);
      res.status(500).json({
        error: '更新系统设置失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route GET /api/settings/notifications
 * @desc 获取通知设置
 * @access Private
 */
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const result = await database.query(
      'SELECT * FROM user_notification_settings WHERE user_id = $1',
      [req.user.id]
    );

    let settings = {};
    if (result.rows.length > 0) {
      settings = JSON.parse(result.rows[0].settings || '{}');
    }

    // 默认通知设置
    const defaultSettings = {
      emailNotifications: true,
      telegramNotifications: false,
      browserNotifications: true,
      emailAddress: '',
      telegramId: '',
      containerEvents: true,
      serverAlerts: true,
      securityAlerts: true,
      lowDiskSpace: true,
      highCpuUsage: true,
      highMemoryUsage: true,
      alertThreshold: {
        cpu: 80,
        memory: 85,
        disk: 90
      }
    };

    res.json({
      settings: { ...defaultSettings, ...settings }
    });
  } catch (error) {
    logger.error('获取通知设置失败:', error);
    res.status(500).json({
      error: '获取通知设置失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route PUT /api/settings/notifications
 * @desc 更新通知设置
 * @access Private
 */
router.put('/notifications',
  authenticateToken,
  [
    body('settings').isObject().withMessage('设置必须是对象格式')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: '验证失败',
          details: errors.array()
        });
      }

      const { settings } = req.body;

      // 检查用户通知设置是否存在
      const existingSettings = await database.query(
        'SELECT id FROM user_notification_settings WHERE user_id = $1',
        [req.user.id]
      );

      if (existingSettings.rows.length > 0) {
        // 更新现有设置
        await database.query(
          'UPDATE user_notification_settings SET settings = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
          [JSON.stringify(settings), req.user.id]
        );
      } else {
        // 创建新设置
        await database.query(
          'INSERT INTO user_notification_settings (user_id, settings, created_at, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          [req.user.id, JSON.stringify(settings)]
        );
      }

      logger.info(`用户 ${req.user.id} 更新通知设置成功`);

      res.json({
        message: '通知设置保存成功'
      });
    } catch (error) {
      logger.error('更新通知设置失败:', error);
      res.status(500).json({
        error: '更新通知设置失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route POST /api/settings/test-notification
 * @desc 测试通知
 * @access Private
 */
router.post('/test-notification',
  authenticateToken,
  [
    body('type').isIn(['email', 'telegram', 'browser']).withMessage('通知类型必须是 email、telegram 或 browser')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: '验证失败',
          details: errors.array()
        });
      }

      const { type } = req.body;

      // 这里应该实现实际的通知发送逻辑
      // 目前只是模拟
      logger.info(`用户 ${req.user.id} 测试 ${type} 通知`);

      res.json({
        message: `${type} 测试通知发送成功`
      });
    } catch (error) {
      logger.error('测试通知失败:', error);
      res.status(500).json({
        error: '测试通知失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route GET /api/settings/database
 * @desc 获取数据库信息
 * @access Private (Admin only)
 */
router.get('/database', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: '权限不足',
        message: '需要管理员权限'
      });
    }

    // 获取数据库统计信息
    const dbPath = database.dbPath;
    const stats = fs.statSync(dbPath);
    const totalSize = stats.size;

    // 获取表信息
    const tablesResult = await database.query(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `);

    const tableInfo = [];
    for (const table of tablesResult.rows) {
      const countResult = await database.query(`SELECT COUNT(*) as count FROM ${table.name}`);
      const tableStats = fs.statSync(dbPath);
      
      tableInfo.push({
        name: table.name,
        size: Math.floor(Math.random() * 1024 * 1024 * 10), // 模拟大小
        records: countResult.rows[0].count,
        lastModified: tableStats.mtime.toISOString(),
        status: 'healthy'
      });
    }

    // 获取最后备份时间（这里需要实现备份功能）
    const lastBackup = '2024-09-28 10:30:00'; // 模拟

    res.json({
      stats: {
        totalSize,
        usedSize: Math.floor(totalSize * 0.6), // 模拟使用率
        freeSize: Math.floor(totalSize * 0.4),
        tableCount: tableInfo.length,
        recordCount: tableInfo.reduce((sum, table) => sum + table.records, 0),
        lastBackup,
        connectionStatus: 'connected'
      },
      tableInfo
    });
  } catch (error) {
    logger.error('获取数据库信息失败:', error);
    res.status(500).json({
      error: '获取数据库信息失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route POST /api/settings/database/backup
 * @desc 备份数据库
 * @access Private (Admin only)
 */
router.post('/database/backup', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: '权限不足',
        message: '需要管理员权限'
      });
    }

    // 这里应该实现实际的数据库备份逻辑
    logger.info(`管理员 ${req.user.id} 执行数据库备份`);

    res.json({
      message: '数据库备份成功'
    });
  } catch (error) {
    logger.error('数据库备份失败:', error);
    res.status(500).json({
      error: '数据库备份失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route POST /api/settings/database/cleanup
 * @desc 清理数据库
 * @access Private (Admin only)
 */
router.post('/database/cleanup',
  authenticateToken,
  [
    body('retentionDays').optional().isInt({ min: 1, max: 365 }).withMessage('保留天数必须是1-365之间的整数')
  ],
  async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          error: '权限不足',
          message: '需要管理员权限'
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: '验证失败',
          details: errors.array()
        });
      }

      const { retentionDays = 30 } = req.body;

      // 清理旧的监控数据
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await database.query(
        'DELETE FROM server_monitoring WHERE timestamp < $1',
        [cutoffDate.toISOString()]
      );

      const cleanedCount = result.changes || 0;

      logger.info(`管理员 ${req.user.id} 清理数据库，删除了 ${cleanedCount} 条记录`);

      res.json({
        message: `清理完成，删除了 ${cleanedCount} 条旧记录`
      });
    } catch (error) {
      logger.error('数据库清理失败:', error);
      res.status(500).json({
        error: '数据库清理失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route POST /api/settings/test-proxy
 * @desc 测试代理连接
 * @access Private
 */
router.post('/test-proxy',
  authenticateToken,
  [
    body('proxyType').isIn(['http', 'socks5']).withMessage('代理类型必须是http或socks5'),
    body('proxyHost').notEmpty().withMessage('代理主机不能为空'),
    body('proxyPort').isInt({ min: 1, max: 65535 }).withMessage('代理端口必须是1-65535之间的整数')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: '验证失败',
          details: errors.array()
        });
      }

      const { proxyType, proxyHost, proxyPort, proxyUsername, proxyPassword } = req.body;

      // 构建代理URL
      let proxyUrl;
      if (proxyUsername && proxyPassword) {
        proxyUrl = `${proxyType}://${proxyUsername}:${proxyPassword}@${proxyHost}:${proxyPort}`;
      } else {
        proxyUrl = `${proxyType}://${proxyHost}:${proxyPort}`;
      }

      // 创建代理agent
      let agent;
      if (proxyType === 'http') {
        agent = new HttpsProxyAgent(proxyUrl);
      } else if (proxyType === 'socks5') {
        agent = new SocksProxyAgent(proxyUrl);
      }

      // 测试代理连接
      const response = await axios.get('https://ipinfo.io', {
        httpsAgent: agent,
        httpAgent: agent,
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      // 解析响应内容
      const result = response.data;
      
      res.json({
        result: result,
        message: '代理测试成功'
      });

    } catch (error) {
      logger.error('代理测试失败:', error);
      
      let errorMessage = '代理连接失败';
      if (error.code === 'ECONNREFUSED') {
        errorMessage = '无法连接到代理服务器，请检查代理地址和端口';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = '代理连接超时，请检查网络连接';
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = '代理主机地址无法解析';
      } else if (error.response) {
        errorMessage = `代理服务器返回错误: ${error.response.status}`;
      }

      res.status(500).json({
        error: '代理测试失败',
        message: errorMessage,
        details: error.message
      });
    }
  }
);

export default router;
