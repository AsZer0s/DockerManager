import express from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';

import database from '../config/database.js';
import logger from '../utils/logger.js';
import { authenticateToken, requireAdmin } from '../utils/auth.js';

const router = express.Router();

/**
 * @route GET /api/user-management/users
 * @desc 获取用户列表
 * @access Private (Admin only)
 */
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 获取服务器和容器的总数
    const serverCountResult = await database.query('SELECT COUNT(*) as total FROM servers WHERE is_active = true');
    const containerCountResult = await database.query('SELECT COUNT(*) as total FROM containers');
    
    const totalServers = parseInt(serverCountResult.rows[0].total);
    const totalContainers = parseInt(containerCountResult.rows[0].total);

    const result = await database.query(`
      SELECT 
        u.id, u.username, u.email, u.role, u.is_active, u.created_at,
        GROUP_CONCAT(DISTINCT p.server_id) as visible_servers,
        GROUP_CONCAT(DISTINCT uc.container_id) as visible_containers
      FROM users u
      LEFT JOIN user_server_permissions p ON u.id = p.user_id
      LEFT JOIN user_containers uc ON u.id = uc.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    const users = result.rows.map(user => {
      let visibleServers = [];
      let visibleContainers = [];
      
      if (user.role === 'admin') {
        // 管理员显示全部服务器和容器
        visibleServers = Array.from({length: totalServers}, (_, i) => i + 1);
        visibleContainers = Array.from({length: totalContainers}, (_, i) => `admin_all_${i + 1}`);
      } else {
        // 普通用户显示实际权限
        visibleServers = user.visible_servers ? user.visible_servers.split(',').map(Number) : [];
        visibleContainers = user.visible_containers ? user.visible_containers.split(',') : [];
      }
      
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at,
        visibleServers,
        visibleContainers
      };
    });

    res.json({ users });
  } catch (error) {
    logger.error('获取用户列表失败:', error);
    res.status(500).json({
      error: '获取用户列表失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route POST /api/user-management/users
 * @desc 创建用户
 * @access Private (Admin only)
 */
router.post('/users',
  authenticateToken,
  requireAdmin,
  [
    body('username').isLength({ min: 3, max: 50 }).withMessage('用户名长度必须在3-50个字符之间'),
    body('email').isEmail().withMessage('邮箱格式不正确'),
    body('password').isLength({ min: 6 }).withMessage('密码至少6个字符'),
    body('role').isIn(['user', 'admin']).withMessage('角色必须是user或admin')
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

      const { username, email, password, role } = req.body;

      // 检查用户名是否已存在
      const existingUser = await database.query(
        'SELECT id FROM users WHERE username = $1 OR email = $2',
        [username, email]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({
          error: '用户已存在',
          message: '用户名或邮箱已被使用'
        });
      }

      // 加密密码
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // 创建用户
      const result = await database.query(
        'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, created_at',
        [username, email, passwordHash, role]
      );

      const newUser = result.rows[0];
      logger.info(`管理员 ${req.user.username} 创建了新用户: ${username}`);

      res.status(201).json({
        message: '用户创建成功',
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role,
          createdAt: newUser.created_at
        }
      });
    } catch (error) {
      logger.error('创建用户失败:', error);
      res.status(500).json({
        error: '创建用户失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route PUT /api/user-management/users/:id
 * @desc 更新用户信息
 * @access Private (Admin only)
 */
router.put('/users/:id',
  authenticateToken,
  requireAdmin,
  [
    body('username').optional().isLength({ min: 3, max: 50 }).withMessage('用户名长度必须在3-50个字符之间'),
    body('email').optional().isEmail().withMessage('邮箱格式不正确'),
    body('role').optional().isIn(['user', 'admin']).withMessage('角色必须是user或admin'),
    body('isActive').optional().isBoolean().withMessage('状态必须是布尔值')
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

      const userId = parseInt(req.params.id);
      const { username, email, role, isActive } = req.body;

      // 检查用户是否存在
      const existingUser = await database.query(
        'SELECT id, username FROM users WHERE id = $1',
        [userId]
      );

      if (existingUser.rows.length === 0) {
        return res.status(404).json({
          error: '用户不存在',
          message: '找不到指定的用户'
        });
      }

      // 构建更新字段
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (username !== undefined) {
        updateFields.push(`username = $${paramIndex++}`);
        updateValues.push(username);
      }
      if (email !== undefined) {
        updateFields.push(`email = $${paramIndex++}`);
        updateValues.push(email);
      }
      if (role !== undefined) {
        updateFields.push(`role = $${paramIndex++}`);
        updateValues.push(role);
      }
      if (isActive !== undefined) {
        updateFields.push(`is_active = $${paramIndex++}`);
        updateValues.push(isActive);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          error: '没有要更新的字段',
          message: '请提供要更新的字段'
        });
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(userId);

      const query = `
        UPDATE users 
        SET ${updateFields.join(', ')} 
        WHERE id = $${paramIndex}
      `;

      await database.query(query, updateValues);

      logger.info(`管理员 ${req.user.username} 更新了用户 ${existingUser.rows[0].username} 的信息`);

      res.json({
        message: '用户信息更新成功'
      });
    } catch (error) {
      logger.error('更新用户信息失败:', error);
      res.status(500).json({
        error: '更新用户信息失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route DELETE /api/user-management/users/:id
 * @desc 删除用户
 * @access Private (Admin only)
 */
router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // 检查用户是否存在
    const existingUser = await database.query(
      'SELECT id, username, role FROM users WHERE id = $1',
      [userId]
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({
        error: '用户不存在',
        message: '找不到指定的用户'
      });
    }

    const user = existingUser.rows[0];

    // 不能删除管理员
    if (user.role === 'admin') {
      return res.status(400).json({
        error: '不能删除管理员',
        message: '管理员账户不能被删除'
      });
    }

    // 删除用户相关的权限记录
    await database.db.run('DELETE FROM user_server_permissions WHERE user_id = ?', [userId]);
    await database.query('DELETE FROM user_containers WHERE user_id = $1', [userId]);

    // 删除用户
    await database.query('DELETE FROM users WHERE id = $1', [userId]);

    logger.info(`管理员 ${req.user.username} 删除了用户 ${user.username}`);

    res.json({
      message: '用户删除成功'
    });
  } catch (error) {
    logger.error('删除用户失败:', error);
    res.status(500).json({
      error: '删除用户失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route GET /api/user-management/servers
 * @desc 获取服务器列表
 * @access Private (Admin only)
 */
router.get('/servers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await database.query(`
      SELECT id, name, host, port, status, created_at
      FROM servers
      ORDER BY name
    `);

    const servers = result.rows.map(server => ({
      id: server.id,
      name: server.name,
      host: server.host,
      port: server.port,
      status: server.status,
      createdAt: server.created_at
    }));

    res.json({ servers });
  } catch (error) {
    logger.error('获取服务器列表失败:', error);
    res.status(500).json({
      error: '获取服务器列表失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route GET /api/user-management/containers
 * @desc 获取容器列表
 * @access Private (Admin only)
 */
router.get('/containers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await database.query(`
      SELECT 
        c.id, c.name, c.status, c.server_id,
        s.name as server_name
      FROM containers c
      JOIN servers s ON c.server_id = s.id
      ORDER BY s.name, c.name
    `);

    const containers = result.rows.map(container => ({
      id: container.id,
      name: container.name,
      status: container.status,
      serverId: container.server_id,
      serverName: container.server_name
    }));

    res.json({ containers });
  } catch (error) {
    logger.error('获取容器列表失败:', error);
    res.status(500).json({
      error: '获取容器列表失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route PUT /api/user-management/users/:id/servers
 * @desc 更新用户可见服务器
 * @access Private (Admin only)
 */
router.put('/users/:id/servers',
  authenticateToken,
  requireAdmin,
  [
    body('serverIds').isArray().withMessage('服务器ID必须是数组')
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

      const userId = parseInt(req.params.id);
      const { serverIds } = req.body;

      // 检查用户是否存在
      const existingUser = await database.query(
        'SELECT id, username FROM users WHERE id = $1',
        [userId]
      );

      if (existingUser.rows.length === 0) {
        return res.status(404).json({
          error: '用户不存在',
          message: '找不到指定的用户'
        });
      }

      // 删除现有权限
      await database.db.run('DELETE FROM user_server_permissions WHERE user_id = ?', [userId]);

      // 添加新权限
      if (serverIds && serverIds.length > 0) {
        for (const serverId of serverIds) {
          await database.db.run(`
            INSERT INTO user_server_permissions 
            (user_id, server_id, can_view, can_control, can_ssh, hide_sensitive_info)
            VALUES (?, ?, 1, 0, 0, 0)
          `, [userId, serverId]);
        }
      }

      logger.info(`管理员 ${req.user.username} 更新了用户 ${existingUser.rows[0].username} 的服务器权限`);

      res.json({
        message: '用户服务器权限更新成功'
      });
    } catch (error) {
      logger.error('更新用户服务器权限失败:', error);
      res.status(500).json({
        error: '更新用户服务器权限失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route PUT /api/user-management/users/:id/containers
 * @desc 更新用户可见容器
 * @access Private (Admin only)
 */
router.put('/users/:id/containers',
  authenticateToken,
  requireAdmin,
  [
    body('containerIds').isArray().withMessage('容器ID必须是数组')
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

      const userId = parseInt(req.params.id);
      const { containerIds } = req.body;

      // 检查用户是否存在
      const existingUser = await database.query(
        'SELECT id, username FROM users WHERE id = $1',
        [userId]
      );

      if (existingUser.rows.length === 0) {
        return res.status(404).json({
          error: '用户不存在',
          message: '找不到指定的用户'
        });
      }

      // 删除现有权限
      await database.query('DELETE FROM user_containers WHERE user_id = $1', [userId]);

      // 添加新权限
      if (containerIds && containerIds.length > 0) {
        const values = containerIds.map((containerId, index) => 
          `($1, $${index + 2})`
        ).join(', ');
        
        const query = `
          INSERT INTO user_containers (user_id, container_id) 
          VALUES ${values}
        `;
        
        await database.query(query, [userId, ...containerIds]);
      }

      logger.info(`管理员 ${req.user.username} 更新了用户 ${existingUser.rows[0].username} 的容器权限`);

      res.json({
        message: '用户容器权限更新成功'
      });
    } catch (error) {
      logger.error('更新用户容器权限失败:', error);
      res.status(500).json({
        error: '更新用户容器权限失败',
        message: '服务器内部错误'
      });
    }
  }
);

export default router;
