import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';

import database from '../config/database.js';
import logger from '../utils/logger.js';
import jwtManager from '../utils/jwt.js';
import { userValidation, validate } from '../utils/validation.js';

const router = express.Router();

// 登录限制
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 20, // 增加到20次尝试
  message: {
    error: '登录尝试次数过多，请 15 分钟后重试'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // 成功请求不计入限制
});



/**
 * @route POST /api/auth/login
 * @desc 用户登录（密码方式）
 * @access Public
 */
router.post('/login',
  loginLimiter,
  validate(userValidation.login),
  async (req, res) => {
    try {
      const { email, password } = req.body;
      const clientIP = req.ip || req.connection.remoteAddress;

      // 查找用户
      const result = await database.query(
        'SELECT * FROM users WHERE email = ? AND is_active = 1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          error: '认证失败',
          message: '邮箱或密码错误'
        });
      }

      const user = result.rows[0];

      // 验证密码
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({
          error: '认证失败',
          message: '邮箱或密码错误'
        });
      }

      // 生成 JWT 令牌
      const token = jwtManager.sign(
        { 
          userId: user.id,
          username: user.username,
          role: user.role
        },
        process.env.JWT_EXPIRES_IN || '7d'
      );

      // 更新最后登录时间
      await database.query(
        'UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [user.id]
      );


      logger.info(`用户登录: ${user.username} (${email})`);

      res.json({
        message: '登录成功',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          telegramId: user.telegram_id
        },
        token
      });
    } catch (error) {
      logger.error('用户登录失败:', error);
      res.status(500).json({
        error: '登录失败',
        message: '服务器内部错误'
      });
    }
  }
);


/**
 * @route POST /api/auth/verify
 * @desc 验证令牌
 * @access Private
 */
router.post('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: '未授权',
        message: '缺少认证令牌'
      });
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwtManager.verify(token);
      
      // 获取用户信息
      const result = await database.query(
        'SELECT id, username, email, role, telegram_id FROM users WHERE id = ? AND is_active = 1',
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          error: '令牌无效',
          message: '用户不存在或已禁用'
        });
      }

      const user = result.rows[0];

      res.json({
        valid: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          telegramId: user.telegram_id
        }
      });
    } catch (jwtError) {
      return res.status(401).json({
        error: '令牌无效',
        message: '令牌已过期或格式错误'
      });
    }
  } catch (error) {
    logger.error('令牌验证失败:', error);
    res.status(500).json({
      error: '验证失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route POST /api/auth/refresh
 * @desc 刷新令牌
 * @access Private
 */
router.post('/refresh', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: '未授权',
        message: '缺少认证令牌'
      });
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwtManager.verify(token);
      
      // 检查用户是否仍然有效
      const result = await database.query(
        'SELECT id, username, role FROM users WHERE id = ? AND is_active = 1',
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          error: '令牌无效',
          message: '用户不存在或已禁用'
        });
      }

      const user = result.rows[0];

      // 生成新的令牌
      const newToken = jwtManager.sign(
        { 
          userId: user.id,
          username: user.username,
          role: user.role
        },
        process.env.JWT_EXPIRES_IN || '7d'
      );

      res.json({
        message: '令牌刷新成功',
        token: newToken
      });
    } catch (jwtError) {
      return res.status(401).json({
        error: '令牌无效',
        message: '无法刷新令牌'
      });
    }
  } catch (error) {
    logger.error('令牌刷新失败:', error);
    res.status(500).json({
      error: '刷新失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route POST /api/auth/logout
 * @desc 用户登出
 * @access Private
 */
router.post('/logout', async (req, res) => {
  try {
    // 在实际应用中，这里可以将令牌加入黑名单
    // 或者使用数据库来管理令牌状态
    
    logger.info('用户登出');
    
    res.json({
      message: '登出成功'
    });
  } catch (error) {
    logger.error('用户登出失败:', error);
    res.status(500).json({
      error: '登出失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route POST /api/auth/bind-telegram
 * @desc 绑定 Telegram ID
 * @access Private
 */
router.post('/bind-telegram',
  [
    body('telegramId').isNumeric().withMessage('Telegram ID 必须是数字')
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

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: '未授权',
          message: '缺少认证令牌'
        });
      }

      const token = authHeader.substring(7);
      const decoded = jwtManager.verify(token);
      const { telegramId } = req.body;

      // 检查 Telegram ID 是否已被使用
      const existingUser = await database.query(
        'SELECT id FROM users WHERE telegram_id = ? AND id != ?',
        [telegramId, decoded.userId]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({
          error: '绑定失败',
          message: '该 Telegram ID 已被其他用户绑定'
        });
      }

      // 更新用户的 Telegram ID
      await database.query(
        'UPDATE users SET telegram_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [telegramId, decoded.userId]
      );

      logger.info(`用户 ${decoded.userId} 绑定 Telegram ID: ${telegramId}`);

      res.json({
        message: 'Telegram ID 绑定成功',
        telegramId
      });
    } catch (error) {
      logger.error('绑定 Telegram ID 失败:', error);
      res.status(500).json({
        error: '绑定失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route POST /api/auth/unbind-telegram
 * @desc 解绑 Telegram ID
 * @access Private
 */
router.post('/unbind-telegram', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: '未授权',
        message: '缺少认证令牌'
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwtManager.verify(token);

    // 解绑用户的 Telegram ID
    await database.query(
      'UPDATE users SET telegram_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [decoded.userId]
    );

    logger.info(`用户 ${decoded.userId} 解绑 Telegram ID`);

    res.json({
      message: 'Telegram ID 解绑成功'
    });
  } catch (error) {
    logger.error('解绑 Telegram ID 失败:', error);
    res.status(500).json({
      error: '解绑失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route POST /api/auth/change-password
 * @desc 修改密码
 * @access Private
 */
router.post('/change-password',
  [
    body('currentPassword').notEmpty().withMessage('当前密码不能为空'),
    body('newPassword').isLength({ min: 6 }).withMessage('新密码至少6个字符')
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

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: '未授权',
          message: '缺少认证令牌'
        });
      }

      const token = authHeader.substring(7);
      const decoded = jwtManager.verify(token);
      const { currentPassword, newPassword } = req.body;

      // 获取用户当前密码
      const result = await database.query(
        'SELECT password_hash FROM users WHERE id = ?',
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: '用户不存在'
        });
      }

      const user = result.rows[0];

      // 验证当前密码
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          error: '当前密码错误'
        });
      }

      // 加密新密码
      const saltRounds = 12;
      const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

      // 更新密码
      await database.query(
        'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newPasswordHash, decoded.userId]
      );


      logger.info(`用户 ${decoded.userId} 修改密码成功`);

      res.json({
        message: '密码修改成功'
      });
    } catch (error) {
      logger.error('修改密码失败:', error);
      res.status(500).json({
        error: '修改密码失败',
        message: '服务器内部错误'
      });
    }
  }
);

export default router;
