import express from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
    // 获取当前文件的目录路径
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // 读取package.json获取版本信息
    const packageJsonPath = path.join(__dirname, '../../package.json');
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonContent);
    
    res.json({
      success: true,
      version: packageJson.version,
      name: packageJson.name,
      description: packageJson.description
    });
  } catch (error) {
    logger.error('获取版本信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取版本信息失败'
    });
  }
});

/**
 * @route GET /api/system/ssh-pool-status
 * @desc 获取SSH连接池状态
 * @access Private
 */
router.get('/ssh-pool-status', authenticateToken, async (req, res) => {
  try {
    const sshConnectionPool = (await import('../services/sshConnectionPool.js')).default;
    const stats = sshConnectionPool.getStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('获取SSH连接池状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取SSH连接池状态失败'
    });
  }
});

export default router;
