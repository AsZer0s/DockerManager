import express from 'express';
import jwt from 'jsonwebtoken';
import database from '../config/database.js';
import pollingService from '../services/pollingService.js';
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
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
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
 * 订阅实时数据
 * POST /api/polling/subscribe
 */
router.post('/subscribe', async (req, res) => {
  try {
    const { subscriptions = [] } = req.body;
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    pollingService.subscribe(req.user.id, sessionId, subscriptions);
    
    res.json({
      success: true,
      sessionId,
      message: '订阅成功'
    });
  } catch (error) {
    logger.error('订阅失败:', error);
    res.status(500).json({ error: '订阅失败' });
  }
});

/**
 * 获取实时数据
 * GET /api/polling/data/:sessionId
 */
router.get('/data/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { types } = req.query;
    
    const dataTypes = types ? types.split(',') : [];
    const data = await pollingService.getData(sessionId, dataTypes);
    
    res.json({
      success: true,
      data,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('获取数据失败:', error);
    
    // 如果是"未找到订阅者"错误，返回401状态码，让前端知道需要重新登录
    if (error.message === '未找到订阅者，请重新订阅') {
      return res.status(401).json({ 
        error: 'SESSION_EXPIRED',
        message: '会话已过期，请重新登录',
        code: 'SESSION_EXPIRED'
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

/**
 * 取消订阅
 * DELETE /api/polling/subscribe/:sessionId
 */
router.delete('/subscribe/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    pollingService.unsubscribe(sessionId);
    
    res.json({
      success: true,
      message: '取消订阅成功'
    });
  } catch (error) {
    logger.error('取消订阅失败:', error);
    res.status(500).json({ error: '取消订阅失败' });
  }
});

/**
 * 获取服务统计
 * GET /api/polling/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = pollingService.getStats();
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
