import express from 'express';
import { body, param, query } from 'express-validator';
import templateService from '../services/templateService.js';
import orchestrationService from '../services/orchestrationService.js';
import { authenticateToken } from '../utils/auth.js';
import logger from '../utils/logger.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import database from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// 配置multer用于文件上传
const upload = multer({
  dest: path.join(__dirname, '../temp/uploads'),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json' || 
        file.mimetype === 'text/yaml' || 
        file.mimetype === 'application/x-yaml') {
      cb(null, true);
    } else {
      cb(new Error('只支持JSON和YAML文件'), false);
    }
  }
});

/**
 * 获取模板列表
 * GET /api/templates
 */
router.get('/', 
  authenticateToken,
  async (req, res) => {
    try {
      const { isPublic = false } = req.query;
      const userId = req.user.id;

      const templates = await templateService.getTemplates(userId, isPublic === 'true');

      res.json({
        success: true,
        data: templates
      });
    } catch (error) {
      logger.error('获取模板列表失败:', error);
      res.status(500).json({
        success: false,
        message: '获取模板列表失败',
        error: error.message
      });
    }
  }
);

/**
 * 获取部署记录
 * GET /api/templates/deployments
 */
router.get('/deployments',
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.id;

      const deployments = await templateService.getDeployments(userId);

      res.json({
        success: true,
        data: deployments
      });
    } catch (error) {
      logger.error('获取部署记录失败:', error);
      res.status(500).json({
        success: false,
        message: '获取部署记录失败',
        error: error.message
      });
    }
  }
);

/**
 * 获取模板详情
 * GET /api/templates/:templateId
 */
router.get('/:templateId',
  authenticateToken,
  [
    param('templateId').isInt().withMessage('模板ID必须是整数')
  ],
  async (req, res) => {
    try {
      const { templateId } = req.params;

      const template = await templateService.getTemplate(templateId);

      res.json({
        success: true,
        data: template
      });
    } catch (error) {
      logger.error('获取模板详情失败:', error);
      res.status(500).json({
        success: false,
        message: '获取模板详情失败',
        error: error.message
      });
    }
  }
);

/**
 * 创建模板
 * POST /api/templates
 */
router.post('/',
  authenticateToken,
  [
    body('name').notEmpty().withMessage('模板名称不能为空'),
    body('description').optional().isString().withMessage('描述必须是字符串'),
    body('category').optional().isString().withMessage('分类必须是字符串'),
    body('icon').optional().isString().withMessage('图标必须是字符串'),
    body('config').isObject().withMessage('配置必须是对象'),
    body('compose_file').optional().isString().withMessage('Compose文件必须是字符串'),
    body('dependencies').optional().isArray().withMessage('依赖必须是数组'),
    body('is_public').optional().isBoolean().withMessage('公开状态必须是布尔值')
  ],
  async (req, res) => {
    try {
      const templateData = {
        ...req.body,
        created_by: req.user.id
      };

      const template = await templateService.createTemplate(templateData);

      res.status(201).json({
        success: true,
        message: '模板创建成功',
        data: template
      });
    } catch (error) {
      logger.error('创建模板失败:', error);
      res.status(500).json({
        success: false,
        message: '创建模板失败',
        error: error.message
      });
    }
  }
);

/**
 * 更新模板
 * PUT /api/templates/:templateId
 */
router.put('/:templateId',
  authenticateToken,
  [
    param('templateId').isInt().withMessage('模板ID必须是整数'),
    body('name').optional().notEmpty().withMessage('模板名称不能为空'),
    body('description').optional().isString().withMessage('描述必须是字符串'),
    body('category').optional().isString().withMessage('分类必须是字符串'),
    body('icon').optional().isString().withMessage('图标必须是字符串'),
    body('config').optional().isObject().withMessage('配置必须是对象'),
    body('compose_file').optional().isString().withMessage('Compose文件必须是字符串'),
    body('dependencies').optional().isArray().withMessage('依赖必须是数组'),
    body('is_public').optional().isBoolean().withMessage('公开状态必须是布尔值')
  ],
  async (req, res) => {
    try {
      const { templateId } = req.params;
      const templateData = req.body;

      const template = await templateService.updateTemplate(templateId, templateData);

      res.json({
        success: true,
        message: '模板更新成功',
        data: template
      });
    } catch (error) {
      logger.error('更新模板失败:', error);
      res.status(500).json({
        success: false,
        message: '更新模板失败',
        error: error.message
      });
    }
  }
);

/**
 * 删除模板
 * DELETE /api/templates/:templateId
 */
router.delete('/:templateId',
  authenticateToken,
  [
    param('templateId').isInt().withMessage('模板ID必须是整数')
  ],
  async (req, res) => {
    try {
      const { templateId } = req.params;

      await templateService.deleteTemplate(templateId);

      res.json({
        success: true,
        message: '模板删除成功'
      });
    } catch (error) {
      logger.error('删除模板失败:', error);
      res.status(500).json({
        success: false,
        message: '删除模板失败',
        error: error.message
      });
    }
  }
);

/**
 * 导出模板
 * GET /api/templates/:templateId/export
 */
router.get('/:templateId/export',
  authenticateToken,
  [
    param('templateId').isInt().withMessage('模板ID必须是整数')
  ],
  async (req, res) => {
    try {
      const { templateId } = req.params;

      const templateData = await templateService.exportTemplate(templateId);

      res.json({
        success: true,
        data: templateData
      });
    } catch (error) {
      logger.error('导出模板失败:', error);
      res.status(500).json({
        success: false,
        message: '导出模板失败',
        error: error.message
      });
    }
  }
);

/**
 * 导入模板
 * POST /api/templates/import
 */
router.post('/import',
  authenticateToken,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: '请选择要导入的文件'
        });
      }

      const fs = (await import('fs')).default;
      const fileContent = fs.readFileSync(req.file.path, 'utf8');
      
      let templateData;
      try {
        templateData = JSON.parse(fileContent);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: '文件格式错误，请确保是有效的JSON文件'
        });
      }

      const template = await templateService.importTemplate(templateData, req.user.id);

      // 清理上传的文件
      fs.unlinkSync(req.file.path);

      res.status(201).json({
        success: true,
        message: '模板导入成功',
        data: template
      });
    } catch (error) {
      logger.error('导入模板失败:', error);
      res.status(500).json({
        success: false,
        message: '导入模板失败',
        error: error.message
      });
    }
  }
);

/**
 * 部署模板
 * POST /api/templates/:templateId/deploy
 */
router.post('/:templateId/deploy',
  authenticateToken,
  checkServerPermission,
  [
    param('templateId').isInt().withMessage('模板ID必须是整数'),
    body('serverId').isInt().withMessage('服务器ID必须是整数'),
    body('params').optional().isObject().withMessage('参数必须是对象')
  ],
  async (req, res) => {
    try {
      const { templateId } = req.params;
      const { serverId, params = {} } = req.body;

      // 添加用户ID到参数中
      params.userId = req.user.id;

      const result = await templateService.deployTemplate(templateId, serverId, params);

      res.json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      logger.error('部署模板失败:', error);
      res.status(500).json({
        success: false,
        message: '部署模板失败',
        error: error.message
      });
    }
  }
);

/**
 * 验证Compose文件
 * POST /api/templates/validate-compose
 */
router.post('/validate-compose',
  authenticateToken,
  [
    body('composeContent').notEmpty().withMessage('Compose文件内容不能为空')
  ],
  async (req, res) => {
    try {
      const { composeContent } = req.body;

      const result = await templateService.validateComposeFile(composeContent);

      res.json({
        success: result.valid,
        message: result.message || result.error,
        data: result
      });
    } catch (error) {
      logger.error('验证Compose文件失败:', error);
      res.status(500).json({
        success: false,
        message: '验证Compose文件失败',
        error: error.message
      });
    }
  }
);


/**
 * 获取部署状态
 * GET /api/templates/deployments/:deploymentId
 */
router.get('/deployments/:deploymentId',
  authenticateToken,
  [
    param('deploymentId').isInt().withMessage('部署ID必须是整数')
  ],
  async (req, res) => {
    try {
      const { deploymentId } = req.params;

      const deployment = await templateService.getDeploymentStatus(deploymentId);

      res.json({
        success: true,
        data: deployment
      });
    } catch (error) {
      logger.error('获取部署状态失败:', error);
      res.status(500).json({
        success: false,
        message: '获取部署状态失败',
        error: error.message
      });
    }
  }
);

/**
 * 检查服务依赖
 * POST /api/templates/check-dependencies
 */
router.post('/check-dependencies',
  authenticateToken,
  [
    body('containers').isArray().withMessage('容器配置必须是数组')
  ],
  async (req, res) => {
    try {
      const { containers } = req.body;

      const result = await orchestrationService.checkDependencies(containers);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('检查服务依赖失败:', error);
      res.status(500).json({
        success: false,
        message: '检查服务依赖失败',
        error: error.message
      });
    }
  }
);

/**
 * 按依赖顺序部署服务
 * POST /api/templates/deploy-with-dependencies
 */
router.post('/deploy-with-dependencies',
  authenticateToken,
  checkServerPermission,
  [
    body('serverId').isInt().withMessage('服务器ID必须是整数'),
    body('services').isArray().withMessage('服务配置必须是数组')
  ],
  async (req, res) => {
    try {
      const { serverId, services } = req.body;

      const result = await orchestrationService.deployWithDependencies(serverId, services);

      res.json({
        success: true,
        message: '按依赖顺序部署完成',
        data: result
      });
    } catch (error) {
      logger.error('按依赖顺序部署失败:', error);
      res.status(500).json({
        success: false,
        message: '按依赖顺序部署失败',
        error: error.message
      });
    }
  }
);

export default router;
