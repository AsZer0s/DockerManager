import express from 'express';
import jwt from 'jsonwebtoken';
import networkMonitoringService from '../services/networkMonitoringService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// 验证JWT token的中间件
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '访问令牌缺失' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'Zer0Teams', (err, user) => {
    if (err) {
      return res.status(403).json({ error: '访问令牌无效' });
    }
    req.user = user;
    next();
  });
};

/**
 * @route GET /api/network/speed
 * @desc 获取当前网络速度
 * @access Private
 */
router.get('/speed', authenticateToken, async (req, res) => {
  try {
    const networkSpeed = networkMonitoringService.getCurrentNetworkSpeed();
    
    if (!networkSpeed) {
      return res.status(503).json({
        success: false,
        message: '网络监控服务未启动或暂无数据'
      });
    }

    res.json({
      success: true,
      data: {
        interface: networkSpeed.interface,
        inSpeed: networkSpeed.inSpeed,
        outSpeed: networkSpeed.outSpeed,
        inSpeedKB: networkSpeed.inSpeedKB,
        outSpeedKB: networkSpeed.outSpeedKB,
        inSpeedMB: networkSpeed.inSpeedMB,
        outSpeedMB: networkSpeed.outSpeedMB,
        inSpeedFormatted: networkMonitoringService.formatSpeed(networkSpeed.inSpeed),
        outSpeedFormatted: networkMonitoringService.formatSpeed(networkSpeed.outSpeed),
        bytesReceived: networkSpeed.bytesReceived,
        bytesSent: networkSpeed.bytesSent,
        bytesReceivedFormatted: networkMonitoringService.formatBytes(networkSpeed.bytesReceived),
        bytesSentFormatted: networkMonitoringService.formatBytes(networkSpeed.bytesSent),
        packetsReceived: networkSpeed.packetsReceived,
        packetsSent: networkSpeed.packetsSent,
        timestamp: networkSpeed.timestamp,
        deltaTime: networkSpeed.deltaTime
      }
    });
  } catch (error) {
    logger.error('获取网络速度失败:', error);
    res.status(500).json({
      success: false,
      message: '获取网络速度失败'
    });
  }
});

/**
 * @route GET /api/network/status
 * @desc 获取网络监控服务状态
 * @access Private
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const status = networkMonitoringService.getStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('获取网络监控状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取网络监控状态失败'
    });
  }
});

/**
 * @route POST /api/network/start
 * @desc 启动网络监控服务
 * @access Private (Admin only)
 */
router.post('/start', authenticateToken, async (req, res) => {
  try {
    // 检查用户权限
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '权限不足，只有管理员可以启动网络监控服务'
      });
    }

    await networkMonitoringService.start();
    
    res.json({
      success: true,
      message: '网络监控服务已启动'
    });
  } catch (error) {
    logger.error('启动网络监控服务失败:', error);
    res.status(500).json({
      success: false,
      message: '启动网络监控服务失败'
    });
  }
});

/**
 * @route POST /api/network/stop
 * @desc 停止网络监控服务
 * @access Private (Admin only)
 */
router.post('/stop', authenticateToken, async (req, res) => {
  try {
    // 检查用户权限
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '权限不足，只有管理员可以停止网络监控服务'
      });
    }

    networkMonitoringService.stop();
    
    res.json({
      success: true,
      message: '网络监控服务已停止'
    });
  } catch (error) {
    logger.error('停止网络监控服务失败:', error);
    res.status(500).json({
      success: false,
      message: '停止网络监控服务失败'
    });
  }
});

/**
 * @route POST /api/network/reset
 * @desc 重置网络统计信息
 * @access Private (Admin only)
 */
router.post('/reset', authenticateToken, async (req, res) => {
  try {
    // 检查用户权限
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '权限不足，只有管理员可以重置网络统计信息'
      });
    }

    networkMonitoringService.resetStats();
    
    res.json({
      success: true,
      message: '网络统计信息已重置'
    });
  } catch (error) {
    logger.error('重置网络统计信息失败:', error);
    res.status(500).json({
      success: false,
      message: '重置网络统计信息失败'
    });
  }
});

/**
 * @route GET /api/network/history
 * @desc 获取网络速度历史数据
 * @access Private
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 60;
    const history = networkMonitoringService.getNetworkHistory(limit);
    
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    logger.error('获取网络历史数据失败:', error);
    res.status(500).json({
      success: false,
      message: '获取网络历史数据失败'
    });
  }
});

export default router;
