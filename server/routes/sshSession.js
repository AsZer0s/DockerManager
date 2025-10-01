import express from 'express';
import jwt from 'jsonwebtoken';
import database from '../config/database.js';
import sshSessionService from '../services/sshSessionService.js';
import encryption from '../utils/encryption.js';
import logger from '../utils/logger.js';

const router = express.Router();

// 中间件：验证JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: '缺少认证令牌' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 验证用户是否存在且活跃
    const userResult = await database.query(
      'SELECT * FROM users WHERE id = ? AND is_active = 1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: '用户不存在或已禁用' });
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    logger.error('认证失败:', error);
    return res.status(401).json({ error: '认证失败' });
  }
};

// 应用认证中间件
router.use(authenticateToken);

/**
 * 创建SSH会话
 * POST /api/ssh-session/create
 */
router.post('/create', async (req, res) => {
  try {
    const { serverId } = req.body;
    
    if (!serverId) {
      return res.status(400).json({ error: '缺少服务器ID' });
    }

    // 获取服务器信息
    const serverResult = await database.query(
      'SELECT * FROM servers WHERE id = ? AND is_active = 1',
      [serverId]
    );

    if (serverResult.rows.length === 0) {
      return res.status(404).json({ error: '服务器不存在或未激活' });
    }

    const server = serverResult.rows[0];

    // 解密服务器认证信息
    let password = null;
    let privateKey = null;

    if (server.password_encrypted) {
      try {
        password = encryption.decrypt(server.password_encrypted);
      } catch (error) {
        logger.error(`解密服务器 ${server.name} 密码失败:`, error);
        return res.status(400).json({ error: '服务器认证信息解密失败' });
      }
    }

    if (server.private_key_encrypted) {
      try {
        privateKey = encryption.decrypt(server.private_key_encrypted);
      } catch (error) {
        logger.error(`解密服务器 ${server.name} 私钥失败:`, error);
        return res.status(400).json({ error: '服务器认证信息解密失败' });
      }
    }

    if (!password && !privateKey) {
      return res.status(400).json({ error: '服务器缺少认证信息' });
    }

    // 创建会话ID
    const sessionId = `ssh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 准备服务器配置
    const serverConfig = {
      ...server,
      password: password,
      private_key: privateKey
    };

    // 创建SSH会话
    await sshSessionService.createSession(sessionId, serverConfig);

    res.json({
      success: true,
      sessionId,
      message: 'SSH会话创建成功'
    });

  } catch (error) {
    logger.error('创建SSH会话失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 执行SSH命令
 * POST /api/ssh-session/execute
 */
router.post('/execute', async (req, res) => {
  try {
    const { sessionId, command } = req.body;
    
    if (!sessionId || !command) {
      return res.status(400).json({ error: '缺少会话ID或命令' });
    }

    // 执行命令
    const result = await sshSessionService.executeCommand(sessionId, command);

    res.json({
      success: true,
      result
    });

  } catch (error) {
    logger.error('执行SSH命令失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取会话信息
 * GET /api/ssh-session/info/:sessionId
 */
router.get('/info/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const sessionInfo = sshSessionService.getSessionInfo(sessionId);
    
    if (!sessionInfo) {
      return res.status(404).json({ error: '会话不存在' });
    }

    res.json({
      success: true,
      sessionInfo
    });

  } catch (error) {
    logger.error('获取会话信息失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 关闭SSH会话
 * DELETE /api/ssh-session/close/:sessionId
 */
router.delete('/close/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    await sshSessionService.closeSession(sessionId);

    res.json({
      success: true,
      message: 'SSH会话已关闭'
    });

  } catch (error) {
    logger.error('关闭SSH会话失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取服务统计
 * GET /api/ssh-session/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = sshSessionService.getStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('获取统计失败:', error);
    res.status(500).json({ error: '获取统计失败' });
  }
});

export default router;
