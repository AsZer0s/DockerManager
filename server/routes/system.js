import express from 'express';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';

const router = express.Router();

// 中间件：验证JWT令牌
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: '访问令牌缺失',
      message: '请提供有效的访问令牌'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    logger.error('令牌验证失败:', error);
    return res.status(403).json({
      error: '无效的访问令牌',
      message: '令牌已过期或无效'
    });
  }
};

/**
 * @route GET /api/system/version
 * @desc 获取系统版本信息
 * @access Private
 */
router.get('/version', authenticateToken, async (req, res) => {
  try {
    // 读取package.json获取版本信息
    const packageJson = await import('../../package.json', { assert: { type: 'json' } });
    const version = packageJson.default.version;
    
    res.json({
      success: true,
      version: version,
      name: packageJson.default.name,
      description: packageJson.default.description
    });
  } catch (error) {
    logger.error('获取版本信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取版本信息失败'
    });
  }
});

export default router;
