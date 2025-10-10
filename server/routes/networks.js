import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticateToken } from '../utils/auth.js';
import dockerService from '../services/dockerService.js';
import logger from '../utils/logger.js';
import database from '../config/database.js';

const router = express.Router();

/**
 * 检查服务器权限
 */
const checkServerPermission = async (req, res, next) => {
  try {
    const serverId = parseInt(req.params.serverId || req.body.serverId);
    
    if (req.user.role === 'admin') {
      req.serverPermission = { can_view: true, can_control: true, can_ssh: true, hide_sensitive_info: false };
      return next();
    }

    // 先检查服务器是否存在
    const serverExists = await database.db.get(
      'SELECT id FROM servers WHERE id = ? AND is_active = 1',
      [serverId]
    );

    if (!serverExists) {
      return res.status(404).json({
        error: '服务器不存在',
        message: '指定的服务器不存在或已被禁用'
      });
    }

    // 检查用户权限
    const result = await database.db.get(
      'SELECT can_view, can_control, can_ssh, hide_sensitive_info FROM user_server_permissions WHERE user_id = ? AND server_id = ?',
      [req.user.id, serverId]
    );

    if (!result || !result.can_view) {
      return res.status(403).json({
        error: '权限不足',
        message: '您没有权限访问此服务器'
      });
    }

    req.serverPermission = result;
    next();
  } catch (error) {
    logger.error('检查服务器权限失败:', error);
    return res.status(500).json({
      error: '权限检查失败',
      message: '无法验证服务器访问权限'
    });
  }
};

/**
 * 获取指定服务器上的Docker网络列表
 * GET /api/docker-networks/:serverId
 */
router.get('/:serverId',
  authenticateToken,
  checkServerPermission,
  [
    param('serverId').isInt().withMessage('服务器ID必须是整数')
  ],
  async (req, res) => {
    try {
      const { serverId } = req.params;
      const networks = await dockerService.getNetworks(serverId);
      res.json({ success: true, data: networks });
    } catch (error) {
      logger.error(`获取服务器 ${req.params.serverId} 网络列表失败:`, error);
      res.status(500).json({ success: false, message: '获取网络列表失败', error: error.message });
    }
  }
);

/**
 * 获取Docker网络详细信息
 * GET /api/docker-networks/:serverId/:id
 */
router.get('/:serverId/:id',
  authenticateToken,
  checkServerPermission,
  [
    param('serverId').isInt().withMessage('服务器ID必须是整数'),
    param('id').isString().notEmpty().withMessage('网络ID不能为空')
  ],
  async (req, res) => {
    try {
      const { serverId, id } = req.params;
      const network = await dockerService.getNetworkInfo(serverId, id);
      res.json({ success: true, data: network });
    } catch (error) {
      logger.error(`获取网络 ${req.params.id} 详细信息失败:`, error);
      res.status(500).json({ success: false, message: '获取网络详细信息失败', error: error.message });
    }
  }
);

/**
 * 创建Docker网络
 * POST /api/docker-networks/:serverId
 */
router.post('/:serverId',
  authenticateToken,
  checkServerPermission,
  [
    param('serverId').isInt().withMessage('服务器ID必须是整数'),
    body('Name').isString().notEmpty().withMessage('网络名称不能为空'),
    body('Driver').optional().isIn(['bridge', 'overlay', 'host', 'macvlan']).withMessage('不支持的驱动类型'),
    body('IPAM').optional().isObject().withMessage('IPAM配置必须是对象'),
    body('Internal').optional().isBoolean().withMessage('Internal必须是布尔值'),
    body('Attachable').optional().isBoolean().withMessage('Attachable必须是布尔值'),
    body('Labels').optional().isObject().withMessage('标签必须是对象')
  ],
  async (req, res) => {
    try {
      const { serverId } = req.params;
      const options = req.body;
      const result = await dockerService.createNetwork(serverId, options);
      res.json({ success: true, message: '网络创建成功', data: result });
    } catch (error) {
      logger.error(`创建网络失败:`, error);
      res.status(500).json({ success: false, message: '网络创建失败', error: error.message });
    }
  }
);

/**
 * 删除Docker网络
 * DELETE /api/docker-networks/:serverId/:id
 */
router.delete('/:serverId/:id',
  authenticateToken,
  checkServerPermission,
  [
    param('serverId').isInt().withMessage('服务器ID必须是整数'),
    param('id').isString().notEmpty().withMessage('网络ID不能为空')
  ],
  async (req, res) => {
    try {
      const { serverId, id } = req.params;
      
      // 检查是否为系统网络
      const systemNetworks = ['bridge', 'host', 'none'];
      const network = await dockerService.getNetworkInfo(serverId, id);
      
      if (systemNetworks.includes(network.Name)) {
        return res.status(400).json({
          success: false,
          message: '不能删除系统网络'
        });
      }
      
      const result = await dockerService.removeNetwork(serverId, id);
      res.json({ success: true, message: '网络删除成功', data: result });
    } catch (error) {
      logger.error(`删除网络 ${req.params.id} 失败:`, error);
      res.status(500).json({ success: false, message: '网络删除失败', error: error.message });
    }
  }
);

/**
 * 连接容器到网络
 * POST /api/docker-networks/:serverId/:id/connect
 */
router.post('/:serverId/:id/connect',
  authenticateToken,
  checkServerPermission,
  [
    param('serverId').isInt().withMessage('服务器ID必须是整数'),
    param('id').isString().notEmpty().withMessage('网络ID不能为空'),
    body('containerId').isString().notEmpty().withMessage('容器ID不能为空'),
    body('EndpointConfig').optional().isObject().withMessage('端点配置必须是对象')
  ],
  async (req, res) => {
    try {
      const { serverId, id } = req.params;
      const { containerId, ...options } = req.body;
      const result = await dockerService.connectContainerToNetwork(serverId, id, containerId, options);
      res.json({ success: true, message: '容器连接网络成功', data: result });
    } catch (error) {
      logger.error(`连接容器到网络失败:`, error);
      res.status(500).json({ success: false, message: '连接容器到网络失败', error: error.message });
    }
  }
);

/**
 * 断开容器与网络的连接
 * POST /api/docker-networks/:serverId/:id/disconnect
 */
router.post('/:serverId/:id/disconnect',
  authenticateToken,
  checkServerPermission,
  [
    param('serverId').isInt().withMessage('服务器ID必须是整数'),
    param('id').isString().notEmpty().withMessage('网络ID不能为空'),
    body('containerId').isString().notEmpty().withMessage('容器ID不能为空')
  ],
  async (req, res) => {
    try {
      const { serverId, id } = req.params;
      const { containerId } = req.body;
      const result = await dockerService.disconnectContainerFromNetwork(serverId, id, containerId);
      res.json({ success: true, message: '容器断开网络成功', data: result });
    } catch (error) {
      logger.error(`断开容器与网络连接失败:`, error);
      res.status(500).json({ success: false, message: '断开容器与网络连接失败', error: error.message });
    }
  }
);

/**
 * 清理未使用的网络
 * POST /api/docker-networks/:serverId/prune
 */
router.post('/:serverId/prune',
  authenticateToken,
  checkServerPermission,
  [
    param('serverId').isInt().withMessage('服务器ID必须是整数')
  ],
  async (req, res) => {
    try {
      const { serverId } = req.params;
      const result = await dockerService.pruneNetworks(serverId);
      res.json({ 
        success: true, 
        message: `清理完成，删除了 ${result.networksDeleted.length} 个未使用的网络`,
        data: result 
      });
    } catch (error) {
      logger.error(`清理未使用网络失败:`, error);
      res.status(500).json({ success: false, message: '清理未使用网络失败', error: error.message });
    }
  }
);

export default router;
