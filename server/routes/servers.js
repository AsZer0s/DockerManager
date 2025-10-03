import express from 'express';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';

import database from '../config/database.js';
import logger from '../utils/logger.js';
import encryption from '../utils/encryption.js';
import dockerService from '../services/dockerService.js';
import cacheService from '../services/cacheService.js';
import { serverValidation, validate, validateParams, commonValidation } from '../utils/validation.js';

const router = express.Router();

// 状态检查缓存
const statusCache = new Map();
const CACHE_DURATION = 30000; // 30秒缓存

// 辅助函数：检查服务器连接状态（优先使用缓存）
async function checkServerStatus(server, forceRealTime = false) {
  // 开始检查服务器状态
  
  // 如果强制实时检查，跳过缓存
  if (!forceRealTime) {
    // 首先尝试从缓存服务获取状态
    const cachedStatus = cacheService.getServerStatus(server.id);
    if (cachedStatus) {
      // 使用缓存状态
      return cachedStatus.status;
    }
  }
  
  // 如果缓存中没有，使用原有的检查逻辑
  const cacheKey = `server_${server.id}`;
  const now = Date.now();
  
  // 检查本地缓存
  if (statusCache.has(cacheKey)) {
    const cached = statusCache.get(cacheKey);
    if (now - cached.timestamp < CACHE_DURATION) {
      return cached.status;
    }
  }
  
  try {
    // 获取完整的服务器信息（包括解密后的密码和私钥）
    // 获取服务器完整信息
    const fullServerInfo = await getFullServerInfo(server.id);
    if (!fullServerInfo) {
      // 服务器完整信息获取失败
      const status = '离线';
      statusCache.set(cacheKey, { status, timestamp: now });
      return status;
    }
    
    logger.debug(`开始SSH连接检查: ${server.name} (${fullServerInfo.host}:${fullServerInfo.ssh_port || fullServerInfo.port || 22})`);
    // 通过 SSH 连接检查服务器状态
    const isOnline = await checkServerViaSSH(fullServerInfo);
    
    const status = isOnline ? '在线' : '离线';
    logger.debug(`SSH连接检查结果: ${server.name} - ${status}`);
    statusCache.set(cacheKey, { status, timestamp: now });
    
    // 同时更新缓存服务
    cacheService.setServerStatus(server.id, status);
    
    return status;
  } catch (error) {
    // 记录错误但不抛出，避免未处理的 Promise 拒绝
    logger.error(`服务器 ${server.name} 状态检查失败:`, error);
    const status = '离线';
    statusCache.set(cacheKey, { status, timestamp: now });
    return status;
  }
}

// 获取完整的服务器信息（包括解密后的敏感信息）
async function getFullServerInfo(serverId) {
  try {
    const result = await database.db.get(
      'SELECT * FROM servers WHERE id = ? AND is_active = 1',
      [serverId]
    );
    
    if (!result) {
      return null;
    }
    
    const server = result;
    
    // 解密敏感信息
    if (server.password_encrypted) {
      server.password = encryption.decrypt(server.password_encrypted);
    }
    if (server.private_key_encrypted) {
      server.private_key = encryption.decrypt(server.private_key_encrypted);
    }
    
    return server;
  } catch (error) {
    logger.error(`获取服务器 ${serverId} 完整信息失败:`, error);
    return null;
  }
}

// 通过 SSH 检查服务器状态
async function checkServerViaSSH(server) {
  return new Promise(async (resolve) => {
    logger.debug(`SSH连接配置: ${server.host}:${server.ssh_port || server.port || 22}, 用户: ${server.username}`);
    
    const { Client } = await import('ssh2');
    const client = new Client();
    
    const timeout = setTimeout(() => {
      logger.debug(`SSH连接超时: ${server.host}`);
      client.destroy();
      resolve(false);
    }, 5000); // 5秒超时
    
    client.on('ready', () => {
      clearTimeout(timeout);
      logger.debug(`SSH连接成功: ${server.host}`);
      
      // 执行 docker ps 命令检查 Docker 是否运行
      client.exec('docker ps --format "table {{.Names}}\t{{.Status}}"', (err, stream) => {
        if (err) {
          logger.debug(`Docker命令执行失败: ${server.host} - ${err.message}`);
          client.end();
          resolve(false);
          return;
        }
        
        let output = '';
        stream.on('close', (code) => {
          logger.debug(`Docker命令执行完成: ${server.host}, 退出码: ${code}`);
          client.end();
          // 如果命令执行成功（退出码为0），说明服务器在线且Docker可用
          resolve(code === 0);
        });
        
        stream.on('data', (data) => {
          output += data.toString();
        });
        
        stream.stderr.on('data', (data) => {
          logger.debug(`Docker命令错误输出: ${server.host} - ${data.toString()}`);
        });
      });
    });
    
    client.on('error', (err) => {
      clearTimeout(timeout);
      logger.debug(`SSH连接错误: ${server.host} - ${err.message}`);
      resolve(false);
    });
    
    // 连接配置
    const connectConfig = {
      host: server.host,
      port: server.ssh_port || server.port || 22,
      username: server.username || 'root',
      readyTimeout: 5000,
      keepaliveInterval: 1000
    };
    
    // 如果有密码，使用密码认证
    if (server.password) {
      connectConfig.password = server.password;
    }
    
    // 如果有私钥，使用密钥认证
    if (server.private_key) {
      connectConfig.privateKey = server.private_key;
    }
    
    client.connect(connectConfig);
  });
}

// 中间件：验证 JWT 令牌
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: '未授权',
        message: '缺少认证令牌'
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 获取用户信息
    const result = await database.db.get(
      'SELECT * FROM users WHERE id = ? AND is_active = 1',
      [decoded.userId]
    );

    if (!result) {
      return res.status(401).json({
        error: '令牌无效',
        message: '用户不存在或已禁用'
      });
    }

    req.user = result;
    next();
  } catch (error) {
    return res.status(401).json({
      error: '令牌无效',
      message: '认证失败'
    });
  }
};

// 中间件：检查管理员权限
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: '权限不足',
      message: '需要管理员权限'
    });
  }
  next();
};

/**
 * @route GET /api/servers
 * @desc 获取服务器列表
 * @access Private
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    let query;
    let params = [];

    let servers;

    if (req.user.role === 'admin') {
      // 管理员可以看到所有服务器
      servers = await database.db.all(`
        SELECT s.*, u.username as created_by_name,
               COUNT(p.user_id) as user_count
        FROM servers s
        LEFT JOIN users u ON s.created_by = u.id
        LEFT JOIN user_server_permissions p ON s.id = p.server_id
        WHERE s.is_active = 1
        GROUP BY s.id, u.username
        ORDER BY s.created_at DESC
      `);
    } else {
      // 普通用户只能看到有权限的服务器
      servers = await database.db.all(`
        SELECT s.*, u.username as created_by_name,
               p.can_view, p.can_control, p.can_ssh, p.hide_sensitive_info
        FROM servers s
        JOIN user_server_permissions p ON s.id = p.server_id
        LEFT JOIN users u ON s.created_by = u.id
        WHERE p.user_id = ? AND s.is_active = 1 AND p.can_view = 1
        ORDER BY s.name
      `, [req.user.id]);
    }
    
    // 根据权限隐藏敏感信息并检查状态（强制实时检查）
    const serversWithStatus = await Promise.all(servers.map(async (server) => {
      const serverData = { ...server };
      // 使用monitoringService统一状态检查逻辑
      const monitoringService = (await import('../services/monitoringService.js')).default;
      const isOnline = await monitoringService.checkServerConnection(server.id, true);
      serverData.status = isOnline ? '在线' : '离线';
      return serverData;
    }));

    res.json({
      servers: serversWithStatus,
      total: serversWithStatus.length
    });
  } catch (error) {
    logger.error('获取服务器列表失败:', error);
    res.status(500).json({
      error: '获取服务器列表失败',
      message: '服务器内部错误'
    });
  }
});

/**
 * @route GET /api/servers/statistics
 * @desc 获取服务器统计信息
 * @access Private (Admin only)
 */
router.get('/statistics',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      // 获取服务器总数
      const serverCountResult = await database.db.get(
        'SELECT COUNT(*) as total FROM servers WHERE is_active = 1'
      );

      // 获取所有活跃服务器并检查状态
      const allServersResult = await database.db.all(
        'SELECT id, name, host, port FROM servers WHERE is_active = 1'
      );

      // 并行检查每个服务器的状态
      const statusChecks = allServersResult.map(server => checkServerStatus(server));
      const statuses = await Promise.all(statusChecks);
      
      let onlineCount = 0;
      let offlineCount = 0;
      
      statuses.forEach(status => {
        if (status === '在线') {
          onlineCount++;
        } else {
          offlineCount++;
        }
      });

      // 获取用户权限统计
      const permissionStatsResult = await database.db.get(`
        SELECT 
          COUNT(DISTINCT user_id) as total_users_with_permissions,
          COUNT(*) as total_permissions,
          SUM(CASE WHEN can_view = 1 THEN 1 ELSE 0 END) as view_permissions,
          SUM(CASE WHEN can_control = 1 THEN 1 ELSE 0 END) as control_permissions,
          SUM(CASE WHEN can_ssh = 1 THEN 1 ELSE 0 END) as ssh_permissions
        FROM user_server_permissions
      `);

      // 获取最近创建的服务器
      const recentServersResult = await database.db.all(`
        SELECT s.name, s.host, s.port, s.created_at, u.username as created_by
        FROM servers s
        LEFT JOIN users u ON s.created_by = u.id
        WHERE s.is_active = 1
        ORDER BY s.created_at DESC
        LIMIT 5
      `);

      // 获取服务器使用情况统计
      const serverUsageResult = await database.db.all(`
        SELECT 
          s.id,
          s.name,
          s.host,
          COUNT(p.user_id) as user_count
        FROM servers s
        LEFT JOIN user_server_permissions p ON s.id = p.server_id
        WHERE s.is_active = 1
        GROUP BY s.id, s.name, s.host
        ORDER BY user_count DESC
        LIMIT 10
      `);

      res.json({
        overview: {
          totalServers: parseInt(serverCountResult.total),
          onlineServers: onlineCount,
          offlineServers: offlineCount,
          totalUsersWithPermissions: parseInt(permissionStatsResult.total_users_with_permissions),
          totalPermissions: parseInt(permissionStatsResult.total_permissions),
          viewPermissions: parseInt(permissionStatsResult.view_permissions),
          controlPermissions: parseInt(permissionStatsResult.control_permissions),
          sshPermissions: parseInt(permissionStatsResult.ssh_permissions)
        },
        recentServers: recentServersResult,
        serverUsage: serverUsageResult,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      logger.error('获取服务器统计信息失败:', error);
      res.status(500).json({
        error: '获取统计信息失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route GET /api/servers/:id
 * @desc 获取服务器详细信息
 * @access Private
 */
router.get('/:id', 
  authenticateToken,
  validateParams(commonValidation.id),
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.id);
      
      let query;
      let params = [serverId];

      if (req.user.role === 'admin') {
        query = `
          SELECT s.*, u.username as created_by_name
          FROM servers s
          LEFT JOIN users u ON s.created_by = u.id
          WHERE s.id = $1 AND s.is_active = true
        `;
      } else {
        query = `
          SELECT s.*, u.username as created_by_name,
                 p.can_view, p.can_control, p.can_ssh, p.hide_sensitive_info
          FROM servers s
          JOIN user_server_permissions p ON s.id = p.server_id
          LEFT JOIN users u ON s.created_by = u.id
          WHERE s.id = $1 AND p.user_id = $2 AND s.is_active = true AND p.can_view = true
        `;
        params.push(req.user.id);
      }

      const result = await database.query(query, params);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          error: '服务器不存在',
          message: '未找到指定的服务器或您没有访问权限'
        });
      }

      const server = result.rows[0];
      
      // 根据权限隐藏敏感信息
      if (req.user.role !== 'admin' && server.hide_sensitive_info) {
        server.host = '***.***.***.***';
        server.port = '***';
        server.username = '***';
        server.password_encrypted = null;
        server.private_key_encrypted = null;
      }

      res.json({ server });
    } catch (error) {
      logger.error('获取服务器详情失败:', error);
      res.status(500).json({
        error: '获取服务器详情失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route POST /api/servers
 * @desc 创建新服务器
 * @access Private (Admin only)
 */
router.post('/',
  authenticateToken,
  requireAdmin,
  validate(serverValidation.create),
  async (req, res) => {
    try {
      const { 
        name, host, port, ssh_port, username, password, private_key, description,
        proxy_enabled, proxy_host, proxy_port, proxy_username, proxy_password
      } = req.body;

      // 检查服务器是否已存在
      const existingServer = await database.db.get(
        'SELECT id FROM servers WHERE host = ? AND port = ? AND is_active = 1',
        [host, port]
      );

      if (existingServer) {
        return res.status(400).json({
          error: '服务器已存在',
          message: '该主机和端口的服务器已存在'
        });
      }

      // 加密敏感信息
      let passwordEncrypted = null;
      let privateKeyEncrypted = null;
      let proxyPasswordEncrypted = null;
      
      if (password) {
        passwordEncrypted = encryption.encrypt(password);
      }
      
      if (private_key) {
        privateKeyEncrypted = encryption.encrypt(private_key);
      }
      
      if (proxy_password) {
        proxyPasswordEncrypted = encryption.encrypt(proxy_password);
      }

      // 创建服务器
      const result = await database.db.run(`
        INSERT INTO servers (
          name, host, port, ssh_port, username, password_encrypted, private_key_encrypted, 
          description, proxy_enabled, proxy_host, proxy_port, proxy_username, proxy_password_encrypted, created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        name, host, port, ssh_port, username, passwordEncrypted, privateKeyEncrypted, 
        description, proxy_enabled || false, proxy_host, proxy_port, proxy_username, 
        proxyPasswordEncrypted, req.user.id
      ]);

      // 获取创建的服务器信息
      const server = await database.db.get(`
        SELECT id, name, host, port, username, description, created_at
        FROM servers WHERE id = ?
      `, [result.lastID]);

      logger.info(`管理员 ${req.user.username} 创建服务器: ${name} (${host}:${port})`);

      // 强制刷新缓存
      try {
        await cacheService.updateAllCaches();
        logger.debug('服务器创建后缓存已刷新');
      } catch (cacheError) {
        logger.warn('刷新缓存失败:', cacheError);
      }

      res.status(201).json({
        message: '服务器创建成功',
        server
      });
    } catch (error) {
      logger.error('创建服务器失败:', error);
      res.status(500).json({
        error: '创建服务器失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route PUT /api/servers/:id
 * @desc 更新服务器信息
 * @access Private (Admin only)
 */
router.put('/:id',
  authenticateToken,
  requireAdmin,
  validateParams(commonValidation.id),
  validate(serverValidation.update),
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.id);
      const { 
        name, host, port, ssh_port, username, password, private_key, description, isActive,
        proxy_enabled, proxy_host, proxy_port, proxy_username, proxy_password
      } = req.body;

      // 检查服务器是否存在
      const existingServer = await database.query(
        'SELECT * FROM servers WHERE id = $1',
        [serverId]
      );

      if (existingServer.rows.length === 0) {
        return res.status(404).json({
          error: '服务器不存在',
          message: '未找到指定的服务器'
        });
      }

      // 如果更新主机和端口，检查是否与其他服务器冲突
      if (host && port) {
        const conflictServer = await database.query(
          'SELECT id FROM servers WHERE host = $1 AND port = $2 AND id != $3 AND is_active = true',
          [host, port, serverId]
        );

        if (conflictServer.rows.length > 0) {
          return res.status(400).json({
            error: '服务器冲突',
            message: '该主机和端口的服务器已存在'
          });
        }
      }

      // 准备更新数据
      const updateFields = [];
      const updateValues = [];
      let paramCount = 1;

      if (name !== undefined) {
        updateFields.push(`name = $${paramCount++}`);
        updateValues.push(name);
      }
      
      if (host !== undefined) {
        updateFields.push(`host = $${paramCount++}`);
        updateValues.push(host);
      }
      
      if (port !== undefined) {
        updateFields.push(`port = $${paramCount++}`);
        updateValues.push(port);
      }
      
      if (ssh_port !== undefined) {
        updateFields.push(`ssh_port = $${paramCount++}`);
        updateValues.push(ssh_port);
      }
      
      if (username !== undefined) {
        updateFields.push(`username = $${paramCount++}`);
        updateValues.push(username);
      }
      
      if (password !== undefined) {
        if (password) {
          updateFields.push(`password_encrypted = $${paramCount++}`);
          updateValues.push(encryption.encrypt(password));
        } else {
          updateFields.push(`password_encrypted = NULL`);
        }
      }
      
      if (private_key !== undefined) {
        if (private_key) {
          updateFields.push(`private_key_encrypted = $${paramCount++}`);
          updateValues.push(encryption.encrypt(private_key));
        } else {
          updateFields.push(`private_key_encrypted = NULL`);
        }
      }
      
      if (description !== undefined) {
        updateFields.push(`description = $${paramCount++}`);
        updateValues.push(description);
      }
      
      if (isActive !== undefined) {
        updateFields.push(`is_active = $${paramCount++}`);
        updateValues.push(isActive);
      }
      
      // 代理配置字段
      if (proxy_enabled !== undefined) {
        updateFields.push(`proxy_enabled = $${paramCount++}`);
        updateValues.push(proxy_enabled);
      }
      
      if (proxy_host !== undefined) {
        updateFields.push(`proxy_host = $${paramCount++}`);
        updateValues.push(proxy_host);
      }
      
      if (proxy_port !== undefined) {
        updateFields.push(`proxy_port = $${paramCount++}`);
        updateValues.push(proxy_port);
      }
      
      if (proxy_username !== undefined) {
        updateFields.push(`proxy_username = $${paramCount++}`);
        updateValues.push(proxy_username);
      }
      
      if (proxy_password !== undefined) {
        if (proxy_password) {
          updateFields.push(`proxy_password_encrypted = $${paramCount++}`);
          updateValues.push(encryption.encrypt(proxy_password));
        } else {
          updateFields.push(`proxy_password_encrypted = NULL`);
        }
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(serverId);

      const query = `
        UPDATE servers 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING id, name, host, port, username, description, is_active, updated_at
      `;

      const result = await database.query(query, updateValues);
      const server = result.rows[0];

      logger.info(`管理员 ${req.user.username} 更新服务器: ${server.name}`);

      // 强制刷新缓存
      try {
        await cacheService.updateAllCaches();
        logger.debug('服务器更新后缓存已刷新');
      } catch (cacheError) {
        logger.warn('刷新缓存失败:', cacheError);
      }

      res.json({
        message: '服务器更新成功',
        server
      });
    } catch (error) {
      logger.error('更新服务器失败:', error);
      res.status(500).json({
        error: '更新服务器失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route DELETE /api/servers/:id
 * @desc 删除服务器
 * @access Private (Admin only)
 */
router.delete('/:id',
  authenticateToken,
  requireAdmin,
  validateParams(commonValidation.id),
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.id);

      // 检查服务器是否存在
      const existingServer = await database.query(
        'SELECT name FROM servers WHERE id = $1',
        [serverId]
      );

      if (existingServer.rows.length === 0) {
        return res.status(404).json({
          error: '服务器不存在',
          message: '未找到指定的服务器'
        });
      }

      const serverName = existingServer.rows[0].name;

      // 软删除服务器（设置为非活跃状态）
      await database.query(
        'UPDATE servers SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [serverId]
      );

      // 删除相关的用户权限
      await database.query(
        'DELETE FROM user_server_permissions WHERE server_id = $1',
        [serverId]
      );

      logger.info(`管理员 ${req.user.username} 删除服务器: ${serverName}`);

      // 强制刷新缓存
      try {
        await cacheService.updateAllCaches();
        logger.debug('服务器删除后缓存已刷新');
      } catch (cacheError) {
        logger.warn('刷新缓存失败:', cacheError);
      }

      res.json({
        message: '服务器删除成功'
      });
    } catch (error) {
      logger.error('删除服务器失败:', error);
      res.status(500).json({
        error: '删除服务器失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route POST /api/servers/:id/test-connection
 * @desc 测试服务器连接
 * @access Private
 */
router.post('/:id/test-connection',
  authenticateToken,
  validateParams(commonValidation.id),
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.id);

      // 检查用户是否有权限访问此服务器
      let hasPermission = false;
      if (req.user.role === 'admin') {
        hasPermission = true;
      } else {
        const permissionResult = await database.db.get(
          'SELECT id FROM user_server_permissions WHERE user_id = ? AND server_id = ? AND can_view = 1',
          [req.user.id, serverId]
        );
        hasPermission = !!permissionResult;
      }

      if (!hasPermission) {
        return res.status(403).json({
          error: '权限不足',
          message: '您没有权限访问此服务器'
        });
      }

      // 获取服务器信息
      const serverResult = await database.query(
        'SELECT * FROM servers WHERE id = $1 AND is_active = true',
        [serverId]
      );

      if (serverResult.rows.length === 0) {
        return res.status(404).json({
          error: '服务器不存在',
          message: '指定的服务器不存在或已被禁用'
        });
      }

      const server = serverResult.rows[0];

      // 解密敏感信息
      if (server.password_encrypted) {
        server.password = encryption.decrypt(server.password_encrypted);
      }
      if (server.private_key_encrypted) {
        server.private_key = encryption.decrypt(server.private_key_encrypted);
      }

      // 测试 SSH 连接
      try {
        const isOnline = await checkServerViaSSH(server);
        
        if (isOnline) {
          res.json({
            success: true,
            message: '服务器连接成功'
          });
        } else {
          res.json({
            success: false,
            message: '服务器连接失败',
            error: 'SSH 连接失败或 Docker 服务不可用'
          });
        }
      } catch (sshError) {
        res.json({
          success: false,
          message: '服务器连接失败',
          error: sshError.message
        });
      }
    } catch (error) {
      logger.error('测试服务器连接失败:', error);
      res.status(500).json({
        error: '测试连接失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route GET /api/servers/:id/containers
 * @desc 获取服务器的容器列表
 * @access Private
 */
router.get('/:id/containers',
  authenticateToken,
  validateParams(commonValidation.id),
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.id);

      // 检查用户是否有权限访问此服务器
      let hasPermission = false;
      if (req.user.role === 'admin') {
        hasPermission = true;
      } else {
        const permissionResult = await database.db.get(
          'SELECT can_view FROM user_server_permissions WHERE user_id = ? AND server_id = ?',
          [req.user.id, serverId]
        );
        hasPermission = permissionResult && permissionResult.can_view;
      }

      if (!hasPermission) {
        return res.status(403).json({
          error: '权限不足',
          message: '您没有权限访问此服务器'
        });
      }

      const dockerService = (await import('../services/dockerService.js')).default;
      const containers = await dockerService.getContainers(serverId);

      res.json({
        serverId,
        containers,
        total: containers.length
      });
    } catch (error) {
      logger.error('获取容器列表失败:', error);
      res.status(500).json({
        error: '获取容器列表失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route GET /api/servers/:id/permissions
 * @desc 获取服务器的用户权限列表
 * @access Private (Admin only)
 */
router.get('/:id/permissions',
  authenticateToken,
  requireAdmin,
  validateParams(commonValidation.id),
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.id);

      // 检查服务器是否存在
      const serverResult = await database.db.get(
        'SELECT name FROM servers WHERE id = ? AND is_active = 1',
        [serverId]
      );

      if (!serverResult) {
        return res.status(404).json({
          error: '服务器不存在',
          message: '未找到指定的服务器'
        });
      }

      // 获取用户权限列表
      const permissionsResult = await database.db.all(`
        SELECT 
          p.id,
          p.user_id,
          u.username,
          u.email,
          u.role,
          p.can_view,
          p.can_control,
          p.can_ssh,
          p.hide_sensitive_info,
          p.created_at,
          p.updated_at
        FROM user_server_permissions p
        JOIN users u ON p.user_id = u.id
        WHERE p.server_id = ? AND u.is_active = 1
        ORDER BY u.username
      `, [serverId]);

      res.json({
        serverId,
        serverName: serverResult.name,
        permissions: permissionsResult,
        total: permissionsResult.length
      });
    } catch (error) {
      logger.error('获取服务器权限列表失败:', error);
      res.status(500).json({
        error: '获取权限列表失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route POST /api/servers/:id/permissions
 * @desc 为用户分配服务器权限
 * @access Private (Admin only)
 */
router.post('/:id/permissions',
  authenticateToken,
  requireAdmin,
  validateParams(commonValidation.id),
  validate([
    body('userId').isInt({ min: 1 }).withMessage('用户ID必须是正整数'),
    body('canView').isBoolean().withMessage('查看权限必须是布尔值'),
    body('canControl').isBoolean().withMessage('控制权限必须是布尔值'),
    body('canSsh').isBoolean().withMessage('SSH权限必须是布尔值'),
    body('hideSensitiveInfo').optional().isBoolean().withMessage('隐藏敏感信息必须是布尔值')
  ]),
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.id);
      const { userId, canView, canControl, canSsh, hideSensitiveInfo = false } = req.body;

      // 检查服务器是否存在
      const serverResult = await database.db.get(
        'SELECT name FROM servers WHERE id = ? AND is_active = 1',
        [serverId]
      );

      if (!serverResult) {
        return res.status(404).json({
          error: '服务器不存在',
          message: '未找到指定的服务器'
        });
      }

      // 检查用户是否存在
      const userResult = await database.query(
        'SELECT username FROM users WHERE id = $1 AND is_active = true',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          error: '用户不存在',
          message: '未找到指定的用户'
        });
      }

      // 检查权限是否已存在
      const existingPermission = await database.db.get(
        'SELECT id FROM user_server_permissions WHERE user_id = ? AND server_id = ?',
        [userId, serverId]
      );

      if (existingPermission) {
        return res.status(400).json({
          error: '权限已存在',
          message: '该用户已拥有此服务器的权限'
        });
      }

      // 创建权限
      const result = await database.db.run(`
        INSERT INTO user_server_permissions 
        (user_id, server_id, can_view, can_control, can_ssh, hide_sensitive_info)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [userId, serverId, canView, canControl, canSsh, hideSensitiveInfo]);

      logger.info(`管理员 ${req.user.username} 为用户分配服务器权限`);

      // 强制刷新缓存
      try {
        await cacheService.updateAllCaches();
        logger.debug('权限分配后缓存已刷新');
      } catch (cacheError) {
        logger.warn('刷新缓存失败:', cacheError);
      }

      res.status(201).json({
        message: '权限分配成功'
      });
    } catch (error) {
      logger.error('分配服务器权限失败:', error);
      res.status(500).json({
        error: '分配权限失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route PUT /api/servers/:id/permissions/:permissionId
 * @desc 更新用户服务器权限
 * @access Private (Admin only)
 */
router.put('/:id/permissions/:permissionId',
  authenticateToken,
  requireAdmin,
  validateParams(commonValidation.id),
  validate([
    body('canView').optional().isBoolean().withMessage('查看权限必须是布尔值'),
    body('canControl').optional().isBoolean().withMessage('控制权限必须是布尔值'),
    body('canSsh').optional().isBoolean().withMessage('SSH权限必须是布尔值'),
    body('hideSensitiveInfo').optional().isBoolean().withMessage('隐藏敏感信息必须是布尔值')
  ]),
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.id);
      const permissionId = parseInt(req.params.permissionId);
      const { canView, canControl, canSsh, hideSensitiveInfo } = req.body;

      // 检查权限是否存在
      const permissionResult = await database.query(`
        SELECT p.*, u.username, s.name as server_name
        FROM user_server_permissions p
        JOIN users u ON p.user_id = u.id
        JOIN servers s ON p.server_id = s.id
        WHERE p.id = $1 AND p.server_id = $2
      `, [permissionId, serverId]);

      if (permissionResult.rows.length === 0) {
        return res.status(404).json({
          error: '权限不存在',
          message: '未找到指定的权限记录'
        });
      }

      // 准备更新数据
      const updateFields = [];
      const updateValues = [];
      let paramCount = 1;

      if (canView !== undefined) {
        updateFields.push(`can_view = $${paramCount++}`);
        updateValues.push(canView);
      }

      if (canControl !== undefined) {
        updateFields.push(`can_control = $${paramCount++}`);
        updateValues.push(canControl);
      }

      if (canSsh !== undefined) {
        updateFields.push(`can_ssh = $${paramCount++}`);
        updateValues.push(canSsh);
      }

      if (hideSensitiveInfo !== undefined) {
        updateFields.push(`hide_sensitive_info = $${paramCount++}`);
        updateValues.push(hideSensitiveInfo);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          error: '无效请求',
          message: '没有提供要更新的字段'
        });
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(permissionId);

      const query = `
        UPDATE user_server_permissions 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await database.query(query, updateValues);
      const permission = result.rows[0];

      logger.info(`管理员 ${req.user.username} 更新用户 ${permissionResult.rows[0].username} 的服务器 ${permissionResult.rows[0].server_name} 权限`);

      // 强制刷新缓存
      try {
        await cacheService.updateAllCaches();
        logger.debug('权限更新后缓存已刷新');
      } catch (cacheError) {
        logger.warn('刷新缓存失败:', cacheError);
      }

      res.json({
        message: '权限更新成功',
        permission
      });
    } catch (error) {
      logger.error('更新服务器权限失败:', error);
      res.status(500).json({
        error: '更新权限失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route DELETE /api/servers/:id/permissions/:permissionId
 * @desc 删除用户服务器权限
 * @access Private (Admin only)
 */
router.delete('/:id/permissions/:permissionId',
  authenticateToken,
  requireAdmin,
  validateParams(commonValidation.id),
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.id);
      const permissionId = parseInt(req.params.permissionId);

      // 检查权限是否存在
      const permissionResult = await database.query(`
        SELECT p.*, u.username, s.name as server_name
        FROM user_server_permissions p
        JOIN users u ON p.user_id = u.id
        JOIN servers s ON p.server_id = s.id
        WHERE p.id = $1 AND p.server_id = $2
      `, [permissionId, serverId]);

      if (permissionResult.rows.length === 0) {
        return res.status(404).json({
          error: '权限不存在',
          message: '未找到指定的权限记录'
        });
      }

      // 删除权限
      await database.query(
        'DELETE FROM user_server_permissions WHERE id = $1',
        [permissionId]
      );

      logger.info(`管理员 ${req.user.username} 删除用户 ${permissionResult.rows[0].username} 的服务器 ${permissionResult.rows[0].server_name} 权限`);

      // 强制刷新缓存
      try {
        await cacheService.updateAllCaches();
        logger.debug('权限删除后缓存已刷新');
      } catch (cacheError) {
        logger.warn('刷新缓存失败:', cacheError);
      }

      res.json({
        message: '权限删除成功'
      });
    } catch (error) {
      logger.error('删除服务器权限失败:', error);
      res.status(500).json({
        error: '删除权限失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route GET /api/servers/:id/status
 * @desc 获取服务器状态信息
 * @access Private
 */
router.get('/:id/status',
  authenticateToken,
  validateParams(commonValidation.id),
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.id);

      // 检查用户是否有权限访问此服务器
      let hasPermission = false;
      if (req.user.role === 'admin') {
        hasPermission = true;
      } else {
        const permissionResult = await database.db.get(
          'SELECT can_view FROM user_server_permissions WHERE user_id = ? AND server_id = ?',
          [req.user.id, serverId]
        );
        hasPermission = permissionResult && permissionResult.can_view;
      }

      if (!hasPermission) {
        return res.status(403).json({
          error: '权限不足',
          message: '您没有权限访问此服务器'
        });
      }

      const dockerService = (await import('../services/dockerService.js')).default;
      
      try {
        // 通过 SSH 获取 Docker 系统信息
        const info = await getDockerInfoViaSSH(server);
        
        // 获取容器统计
        const containers = await dockerService.getContainers(serverId);
        const runningContainers = containers.filter(c => c.status === 'running').length;
        const stoppedContainers = containers.filter(c => c.status === 'exited').length;
        
        // 通过 SSH 获取镜像统计
        const images = await getImagesViaSSH(server);
        
        res.json({
          serverId,
          status: 'online',
          docker: {
            version: info.ServerVersion,
            containers: info.Containers,
            images: info.Images,
            driver: info.Driver,
            kernelVersion: info.KernelVersion,
            operatingSystem: info.OperatingSystem,
            architecture: info.Architecture,
            totalMemory: info.MemTotal,
            cpuCount: info.NCPU
          },
          statistics: {
            totalContainers: containers.length,
            runningContainers,
            stoppedContainers,
            totalImages: images.length
          },
          lastChecked: new Date().toISOString()
        });
      } catch (dockerError) {
        res.json({
          serverId,
          status: 'offline',
          error: dockerError.message,
          lastChecked: new Date().toISOString()
        });
      }
    } catch (error) {
      logger.error('获取服务器状态失败:', error);
      res.status(500).json({
        error: '获取服务器状态失败',
        message: '服务器内部错误'
      });
    }
  }
);


/**
 * @route POST /api/servers/batch-test
 * @desc 批量测试服务器连接
 * @access Private (Admin only)
 */
router.post('/batch-test',
  authenticateToken,
  requireAdmin,
  validate([
    body('serverIds').isArray({ min: 1 }).withMessage('服务器ID列表不能为空'),
    body('serverIds.*').isInt({ min: 1 }).withMessage('每个服务器ID必须是正整数')
  ]),
  async (req, res) => {
    try {
      const { serverIds } = req.body;
      const results = [];

      for (const serverId of serverIds) {
        try {
          // 检查服务器是否存在
          const serverResult = await database.query(
            'SELECT name, host, port FROM servers WHERE id = $1 AND is_active = true',
            [serverId]
          );

          if (serverResult.rows.length === 0) {
            results.push({
              serverId,
              name: 'Unknown',
              status: 'error',
              message: '服务器不存在'
            });
            continue;
          }

          const server = serverResult.rows[0];

          // 测试SSH连接
          const isOnline = await checkServerViaSSH(server);

          results.push({
            serverId,
            name: server.name,
            host: server.host,
            port: server.port,
            status: 'success',
            message: '连接成功'
          });
        } catch (error) {
          results.push({
            serverId,
            name: serverResult?.rows[0]?.name || 'Unknown',
            status: 'error',
            message: error.message
          });
        }
      }

      const successCount = results.filter(r => r.status === 'success').length;
      const errorCount = results.filter(r => r.status === 'error').length;

      logger.info(`管理员 ${req.user.username} 批量测试 ${serverIds.length} 个服务器连接，成功: ${successCount}, 失败: ${errorCount}`);

      res.json({
        message: '批量测试完成',
        summary: {
          total: serverIds.length,
          success: successCount,
          error: errorCount
        },
        results
      });
    } catch (error) {
      logger.error('批量测试服务器连接失败:', error);
      res.status(500).json({
        error: '批量测试失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * 通过 SSH 获取 Docker 系统信息
 * @param {Object} server - 服务器信息
 * @returns {Promise<Object>} Docker 系统信息
 */
async function getDockerInfoViaSSH(server) {
  return new Promise(async (resolve, reject) => {
    try {
      const { Client } = await import('ssh2');
      const client = new Client();
      
      const timeout = setTimeout(() => {
        client.destroy();
        reject(new Error('SSH 连接超时'));
      }, 10000);
      
      client.on('ready', () => {
        clearTimeout(timeout);
        
        // 执行 docker info 命令
        client.exec('docker info --format "{{json .}}"', (err, stream) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }
          
          let output = '';
          stream.on('close', (code) => {
            client.end();
            
            if (code === 0) {
              try {
                const info = JSON.parse(output);
                resolve({
                  ServerVersion: info.ServerVersion || 'unknown',
                  Containers: info.Containers || 0,
                  Images: info.Images || 0,
                  Driver: info.Driver || 'unknown',
                  KernelVersion: info.KernelVersion || 'unknown',
                  OperatingSystem: info.OperatingSystem || 'unknown',
                  Architecture: info.Architecture || 'unknown',
                  MemTotal: info.MemTotal || 0,
                  NCPU: info.NCPU || 0
                });
              } catch (parseError) {
                reject(new Error('解析 Docker 信息失败'));
              }
            } else {
              reject(new Error(`Docker info 命令执行失败，退出码: ${code}`));
            }
          });
          
          stream.on('data', (data) => {
            output += data.toString();
          });
          
          stream.stderr.on('data', (data) => {
            logger.debug('Docker info 错误输出:', data.toString());
          });
        });
      });
      
      client.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      
      // 连接配置
      const connectConfig = {
        host: server.host,
        port: server.ssh_port || server.port || 22,
        username: server.username || 'root',
        readyTimeout: 5000,
        keepaliveInterval: 1000
      };
      
      if (server.password) {
        connectConfig.password = server.password;
      }
      
      if (server.private_key) {
        connectConfig.privateKey = server.private_key;
      }
      
      client.connect(connectConfig);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 通过 SSH 获取镜像列表
 * @param {Object} server - 服务器信息
 * @returns {Promise<Array>} 镜像列表
 */
async function getImagesViaSSH(server) {
  return new Promise(async (resolve, reject) => {
    try {
      const { Client } = await import('ssh2');
      const client = new Client();
      
      const timeout = setTimeout(() => {
        client.destroy();
        reject(new Error('SSH 连接超时'));
      }, 10000);
      
      client.on('ready', () => {
        clearTimeout(timeout);
        
        // 执行 docker images 命令
        client.exec('docker images --format "{{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}\t{{.Size}}"', (err, stream) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }
          
          let output = '';
          stream.on('close', (code) => {
            client.end();
            
            if (code === 0) {
              const images = [];
              const lines = output.trim().split('\n');
              
              for (const line of lines) {
                if (line.trim()) {
                  const parts = line.split('\t');
                  if (parts.length >= 5) {
                    images.push({
                      Repository: parts[0],
                      Tag: parts[1],
                      Id: parts[2],
                      Created: parts[3],
                      Size: parts[4]
                    });
                  }
                }
              }
              
              resolve(images);
            } else {
              reject(new Error(`Docker images 命令执行失败，退出码: ${code}`));
            }
          });
          
          stream.on('data', (data) => {
            output += data.toString();
          });
          
          stream.stderr.on('data', (data) => {
            logger.debug('Docker images 错误输出:', data.toString());
          });
        });
      });
      
      client.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      
      // 连接配置
      const connectConfig = {
        host: server.host,
        port: server.ssh_port || server.port || 22,
        username: server.username || 'root',
        readyTimeout: 5000,
        keepaliveInterval: 1000
      };
      
      if (server.password) {
        connectConfig.password = server.password;
      }
      
      if (server.private_key) {
        connectConfig.privateKey = server.private_key;
      }
      
      client.connect(connectConfig);
    } catch (error) {
      reject(error);
    }
  });
}

export default router;
