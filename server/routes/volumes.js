import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticateToken } from '../utils/auth.js';
import dockerService from '../services/dockerService.js';
import logger, { createModuleLogger, logError } from '../utils/logger.js';
import database from '../config/database.js';

// 创建Docker模块日志器
const moduleLogger = createModuleLogger('docker');

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
 * 获取指定服务器上的Docker卷列表
 * GET /api/volumes/:serverId
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
      const volumes = await dockerService.getVolumes(serverId);
      res.json({ success: true, data: volumes });
    } catch (error) {
      logError('docker', error, req);
      res.status(500).json({ success: false, message: '获取卷列表失败', error: error.message });
    }
  }
);

/**
 * 获取Docker卷详细信息
 * GET /api/volumes/:serverId/:name
 */
router.get('/:serverId/:name',
  authenticateToken,
  checkServerPermission,
  [
    param('serverId').isInt().withMessage('服务器ID必须是整数'),
    param('name').isString().notEmpty().withMessage('卷名称不能为空')
  ],
  async (req, res) => {
    try {
      const { serverId, name } = req.params;
      const volume = await dockerService.getVolumeInfo(serverId, name);
      res.json({ success: true, data: volume });
    } catch (error) {
      logError('docker', error, req);
      res.status(500).json({ success: false, message: '获取卷详细信息失败', error: error.message });
    }
  }
);

/**
 * 创建Docker卷
 * POST /api/volumes/:serverId
 */
router.post('/:serverId',
  authenticateToken,
  checkServerPermission,
  [
    param('serverId').isInt().withMessage('服务器ID必须是整数'),
    body('Name').isString().notEmpty().withMessage('卷名称不能为空'),
    body('Driver').optional().isString().withMessage('驱动必须是字符串'),
    body('DriverOpts').optional().isObject().withMessage('驱动选项必须是对象'),
    body('Labels').optional().isObject().withMessage('标签必须是对象')
  ],
  async (req, res) => {
    try {
      const { serverId } = req.params;
      const options = req.body;

      // 记录创建卷操作开始
      moduleLogger.info('Creating volume', {
        serverId,
        options,
        userId: req.user.id,
        ip: req.ip
      });

      const result = await dockerService.createVolume(serverId, options);

      // 记录创建成功
      moduleLogger.info('Volume created successfully', {
        serverId,
        volumeName: options.Name,
        userId: req.user.id,
        result
      });

      res.json({ success: true, message: '卷创建成功', data: result });
    } catch (error) {
      logError('docker', error, req);
      res.status(500).json({ success: false, message: '卷创建失败', error: error.message });
    }
  }
);

/**
 * 删除Docker卷
 * DELETE /api/volumes/:serverId/:name
 */
router.delete('/:serverId/:name',
  authenticateToken,
  checkServerPermission,
  [
    param('serverId').isInt().withMessage('服务器ID必须是整数'),
    param('name').isString().notEmpty().withMessage('卷名称不能为空'),
    query('force').optional().isBoolean().withMessage('force参数必须是布尔值')
  ],
  async (req, res) => {
    try {
      const { serverId, name } = req.params;
      const { force } = req.query;
      
      // 记录删除卷操作开始
      moduleLogger.info('Removing volume', {
        serverId,
        volumeName: name,
        force: force === 'true',
        userId: req.user.id,
        ip: req.ip
      });
      
      // 检查是否为系统卷
      const systemVolumes = ['docker_volumes', 'docker_containers'];
      if (systemVolumes.some(sysVol => name.includes(sysVol))) {
        moduleLogger.warn('Attempted to delete system volume', {
          serverId,
          volumeName: name,
          userId: req.user.id
        });
        return res.status(400).json({
          success: false,
          message: '不能删除系统卷'
        });
      }
      
      const result = await dockerService.removeVolume(serverId, name, force === 'true');

      // 记录删除成功
      moduleLogger.info('Volume removed successfully', {
        serverId,
        volumeName: name,
        force: force === 'true',
        userId: req.user.id,
        result
      });

      res.json({ success: true, message: '卷删除成功', data: result });
    } catch (error) {
      logError('docker', error, req);
      res.status(500).json({ success: false, message: '卷删除失败', error: error.message });
    }
  }
);

/**
 * 清理未使用的卷
 * POST /api/volumes/:serverId/prune
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
      const result = await dockerService.pruneVolumes(serverId);
      res.json({ 
        success: true, 
        message: `清理完成，删除了 ${result.volumesDeleted.length} 个未使用的卷`,
        data: result 
      });
    } catch (error) {
      logError('docker', error, req);
      res.status(500).json({ success: false, message: '清理未使用卷失败', error: error.message });
    }
  }
);

export default router;
