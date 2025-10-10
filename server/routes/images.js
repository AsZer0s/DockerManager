import express from 'express';
import { body, param, query } from 'express-validator';
import dockerService from '../services/dockerService.js';
import { authenticateToken } from '../utils/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * 检查服务器权限
 */
const checkServerPermission = async (req, res, next) => {
  try {
    const { serverId } = req.params;
    const userId = req.user.id;
    
    if (req.user.role === 'admin') {
      req.serverPermission = { can_view: true, can_control: true, can_ssh: true, hide_sensitive_info: false };
      return next();
    }

    // 先检查服务器是否存在
    const database = (await import('../config/database.js')).default;
    const serverExists = await database.queryOne(
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
    const result = await database.queryOne(
      'SELECT can_view, can_control, can_ssh, hide_sensitive_info FROM user_server_permissions WHERE user_id = ? AND server_id = ?',
      [userId, serverId]
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
 * 获取镜像列表
 * GET /api/images/:serverId
 */
router.get('/:serverId', 
  authenticateToken,
  checkServerPermission,
  async (req, res) => {
    try {
      const { serverId } = req.params;
      const { search } = req.query;

      let images;
      if (search) {
        images = await dockerService.searchImages(serverId, search);
      } else {
        images = await dockerService.getImages(serverId);
      }

      res.json({
        success: true,
        data: images
      });
    } catch (error) {
      logger.error('获取镜像列表失败:', error);
      res.status(500).json({
        success: false,
        message: '获取镜像列表失败',
        error: error.message
      });
    }
  }
);

/**
 * 拉取镜像
 * POST /api/images/:serverId/pull
 */
router.post('/:serverId/pull',
  authenticateToken,
  checkServerPermission,
  [
    body('imageName').notEmpty().withMessage('镜像名称不能为空'),
    body('tag').optional().isString().withMessage('标签必须是字符串')
  ],
  async (req, res) => {
    try {
      const { serverId } = req.params;
      const { imageName, tag = 'latest' } = req.body;

      const result = await dockerService.pullImage(serverId, imageName, tag);

      res.json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      logger.error('拉取镜像失败:', error);
      res.status(500).json({
        success: false,
        message: '拉取镜像失败',
        error: error.message
      });
    }
  }
);

/**
 * 删除镜像
 * DELETE /api/images/:serverId/:imageId
 */
router.delete('/:serverId/:imageId',
  authenticateToken,
  checkServerPermission,
  [
    param('imageId').notEmpty().withMessage('镜像ID不能为空'),
    query('force').optional().isBoolean().withMessage('force参数必须是布尔值')
  ],
  async (req, res) => {
    try {
      const { serverId, imageId } = req.params;
      const { force = false } = req.query;

      const result = await dockerService.removeImage(serverId, imageId, force === 'true');

      res.json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      logger.error('删除镜像失败:', error);
      res.status(500).json({
        success: false,
        message: '删除镜像失败',
        error: error.message
      });
    }
  }
);

/**
 * 修改镜像标签
 * POST /api/images/:serverId/:imageId/tag
 */
router.post('/:serverId/:imageId/tag',
  authenticateToken,
  checkServerPermission,
  [
    param('imageId').notEmpty().withMessage('镜像ID不能为空'),
    body('newTag').notEmpty().withMessage('新标签不能为空')
  ],
  async (req, res) => {
    try {
      const { serverId, imageId } = req.params;
      const { newTag } = req.body;

      const result = await dockerService.tagImage(serverId, imageId, newTag);

      res.json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      logger.error('修改镜像标签失败:', error);
      res.status(500).json({
        success: false,
        message: '修改镜像标签失败',
        error: error.message
      });
    }
  }
);

/**
 * 获取镜像详细信息
 * GET /api/images/:serverId/:imageId/info
 */
router.get('/:serverId/:imageId/info',
  authenticateToken,
  checkServerPermission,
  [
    param('imageId').notEmpty().withMessage('镜像ID不能为空')
  ],
  async (req, res) => {
    try {
      const { serverId, imageId } = req.params;

      const imageInfo = await dockerService.getImageInfo(serverId, imageId);

      res.json({
        success: true,
        data: imageInfo
      });
    } catch (error) {
      logger.error('获取镜像信息失败:', error);
      res.status(500).json({
        success: false,
        message: '获取镜像信息失败',
        error: error.message
      });
    }
  }
);

/**
 * 搜索镜像
 * GET /api/images/:serverId/search
 */
router.get('/:serverId/search',
  authenticateToken,
  checkServerPermission,
  [
    query('term').notEmpty().withMessage('搜索词不能为空')
  ],
  async (req, res) => {
    try {
      const { serverId } = req.params;
      const { term } = req.query;

      const images = await dockerService.searchImages(serverId, term);

      res.json({
        success: true,
        data: images
      });
    } catch (error) {
      logger.error('搜索镜像失败:', error);
      res.status(500).json({
        success: false,
        message: '搜索镜像失败',
        error: error.message
      });
    }
  }
);

export default router;
