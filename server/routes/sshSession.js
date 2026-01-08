import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import database from '../config/database.js';
import sshSessionService from '../services/sshSessionService.js';
import sshFileTransferService from '../services/sshFileTransferService.js';
import encryption from '../utils/encryption.js';
import logger, { createModuleLogger, logError } from '../utils/logger.js';

// 创建SSH模块日志器
const moduleLogger = createModuleLogger('ssh');

const router = express.Router();

// 配置文件上传
const upload = multer({
  dest: 'temp/uploads/',
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB 限制
    files: 10 // 最多10个文件
  },
  fileFilter: (req, file, cb) => {
    // 允许所有文件类型，但记录日志
    moduleLogger.info('File upload attempt', {
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    cb(null, true);
  }
});

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

    if (!result || !result.can_ssh) {
      return res.status(403).json({
        error: '权限不足',
        message: '您没有SSH访问权限'
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
      'SELECT * FROM users WHERE id = ? AND is_active = 1',
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
 * 创建SSH会话
 * POST /api/ssh-session/create
 */
router.post('/create', authenticateToken, checkServerPermission, async (req, res) => {
  try {
    const { serverId } = req.body;
    
    // 记录SSH会话创建开始
    moduleLogger.info('Creating SSH session', {
      serverId,
      userId: req.user.id,
      ip: req.ip
    });
    
    if (!serverId) {
      moduleLogger.warn('SSH session creation denied - missing server ID', {
        userId: req.user.id
      });
      return res.status(400).json({ error: '缺少服务器ID' });
    }

    // 获取服务器信息
    const serverResult = await database.query(
      'SELECT * FROM servers WHERE id = ? AND is_active = 1',
      [serverId]
    );

    if (serverResult.rows.length === 0) {
      return res.status(404).json({ error: '服务器不存在或未激活' });
    }

    const server = serverResult.rows[0];

    // 解密服务器认证信息
    let password = null;
    let privateKey = null;

    if (server.password_encrypted) {
      try {
        password = encryption.decrypt(server.password_encrypted);
      } catch (error) {
        logger.error(`解密服务器 ${server.name} 密码失败:`, error);
        return res.status(400).json({ error: '服务器认证信息解密失败' });
      }
    }

    if (server.private_key_encrypted) {
      try {
        privateKey = encryption.decrypt(server.private_key_encrypted);
      } catch (error) {
        logger.error(`解密服务器 ${server.name} 私钥失败:`, error);
        return res.status(400).json({ error: '服务器认证信息解密失败' });
      }
    }

    if (!password && !privateKey) {
      return res.status(400).json({ error: '服务器缺少认证信息' });
    }

    // 创建会话ID
    const sessionId = `ssh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 准备服务器配置
    const serverConfig = {
      ...server,
      password: password,
      private_key: privateKey
    };

    // 创建SSH会话
    await sshSessionService.createSession(sessionId, serverConfig);

    // 记录SSH会话创建成功
    moduleLogger.info('SSH session created successfully', {
      sessionId,
      serverId,
      userId: req.user.id
    });

    res.json({
      success: true,
      sessionId,
      message: 'SSH会话创建成功'
    });

  } catch (error) {
    logError('ssh', error, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 执行SSH命令（增强版）
 * POST /api/ssh-session/execute-enhanced
 */
router.post('/execute-enhanced', async (req, res) => {
  try {
    const { sessionId, command, options = {} } = req.body;
    
    // 记录SSH会话命令执行开始
    moduleLogger.info('Executing enhanced SSH session command', {
      sessionId,
      command,
      options,
      userId: req.user.id,
      ip: req.ip
    });
    
    if (!sessionId || !command) {
      moduleLogger.warn('SSH session command execution denied - missing parameters', {
        sessionId,
        command,
        userId: req.user.id
      });
      return res.status(400).json({ error: '缺少会话ID或命令' });
    }

    // 执行命令
    const result = await sshSessionService.executeCommand(sessionId, command);

    // 记录SSH会话命令执行成功
    moduleLogger.info('Enhanced SSH session command executed successfully', {
      sessionId,
      command,
      userId: req.user.id,
      responseTime: result.responseTime,
      outputLength: result.output ? result.output.length : 0
    });

    res.json({
      success: true,
      result
    });

  } catch (error) {
    logError('ssh', error, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 批量执行SSH命令
 * POST /api/ssh-session/execute-batch
 */
router.post('/execute-batch', async (req, res) => {
  try {
    const { sessionId, commands } = req.body;
    
    if (!sessionId || !Array.isArray(commands) || commands.length === 0) {
      return res.status(400).json({ error: '缺少会话ID或命令列表' });
    }

    // 限制批量命令数量
    if (commands.length > 10) {
      return res.status(400).json({ error: '批量命令数量不能超过10个' });
    }

    const results = await sshSessionService.executeBatchCommands(sessionId, commands);

    res.json({
      success: true,
      results
    });

  } catch (error) {
    logError('ssh', error, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 发送原始数据到终端
 * POST /api/ssh-session/send-raw
 */
router.post('/send-raw', async (req, res) => {
  try {
    const { sessionId, data } = req.body;
    
    if (!sessionId || !data) {
      return res.status(400).json({ error: '缺少会话ID或数据' });
    }

    sshSessionService.sendRawData(sessionId, data);

    res.json({
      success: true,
      message: '数据已发送'
    });

  } catch (error) {
    logError('ssh', error, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 调整终端大小
 * POST /api/ssh-session/resize
 */
router.post('/resize', async (req, res) => {
  try {
    const { sessionId, cols, rows } = req.body;
    
    if (!sessionId || !cols || !rows) {
      return res.status(400).json({ error: '缺少会话ID或终端尺寸' });
    }

    sshSessionService.resizeTerminal(sessionId, cols, rows);

    res.json({
      success: true,
      message: '终端大小已调整'
    });

  } catch (error) {
    logError('ssh', error, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取命令历史
 * GET /api/ssh-session/history/:sessionId
 */
router.get('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 20 } = req.query;
    
    const history = sshSessionService.getCommandHistory(sessionId, parseInt(limit));
    
    res.json({
      success: true,
      history
    });

  } catch (error) {
    logError('ssh', error, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取会话性能指标
 * GET /api/ssh-session/metrics/:sessionId
 */
router.get('/metrics/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const metrics = sshSessionService.getSessionMetrics(sessionId);
    
    if (!metrics) {
      return res.status(404).json({ error: '会话不存在' });
    }

    res.json({
      success: true,
      metrics
    });

  } catch (error) {
    logError('ssh', error, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取会话信息
 * GET /api/ssh-session/info/:sessionId
 */
router.get('/info/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const sessionInfo = sshSessionService.getSessionInfo(sessionId);
    
    if (!sessionInfo) {
      return res.status(404).json({ error: '会话不存在' });
    }

    res.json({
      success: true,
      sessionInfo
    });

  } catch (error) {
    logError('ssh', error, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 关闭SSH会话
 * DELETE /api/ssh-session/close/:sessionId
 */
router.delete('/close/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    await sshSessionService.closeSession(sessionId);

    res.json({
      success: true,
      message: 'SSH会话已关闭'
    });

  } catch (error) {
    logError('ssh', error, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取服务统计（增强版）
 * GET /api/ssh-session/stats-enhanced
 */
router.get('/stats-enhanced', async (req, res) => {
  try {
    const sshPerformanceMonitor = (await import('../services/sshPerformanceMonitor.js')).default;
    
    const stats = sshSessionService.getStats();
    const performanceReport = sshPerformanceMonitor.getPerformanceReport();
    
    res.json({
      success: true,
      stats: {
        ...stats,
        performance: performanceReport
      }
    });
  } catch (error) {
    logger.error('获取增强统计失败:', error);
    res.status(500).json({ error: '获取统计失败' });
  }
});

/**
 * 获取连接池状态
 * GET /api/ssh-session/pool-status
 */
router.get('/pool-status', async (req, res) => {
  try {
    const sshConnectionPool = (await import('../services/sshConnectionPool.js')).default;
    const status = sshConnectionPool.getStats();
    
    res.json({
      success: true,
      poolStatus: status
    });
  } catch (error) {
    logger.error('获取连接池状态失败:', error);
    res.status(500).json({ error: '获取连接池状态失败' });
  }
});

/**
 * 上传文件到服务器
 * POST /api/ssh-session/upload
 */
router.post('/upload', upload.array('files'), async (req, res) => {
  try {
    const { serverId, remotePath } = req.body;
    
    if (!serverId || !remotePath) {
      return res.status(400).json({ error: '缺少服务器ID或远程路径' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const results = [];
    
    for (const file of req.files) {
      try {
        const remoteFilePath = path.posix.join(remotePath, file.originalname);
        
        const result = await sshFileTransferService.uploadFile(
          parseInt(serverId),
          file.path,
          remoteFilePath
        );
        
        results.push({
          originalName: file.originalname,
          remotePath: remoteFilePath,
          ...result
        });
        
        // 清理临时文件
        fs.unlinkSync(file.path);
      } catch (error) {
        results.push({
          originalName: file.originalname,
          error: error.message
        });
        
        // 清理临时文件
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    res.json({
      success: true,
      results
    });

  } catch (error) {
    logError('ssh', error, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 从服务器下载文件
 * POST /api/ssh-session/download
 */
router.post('/download', async (req, res) => {
  try {
    const { serverId, remotePath, fileName } = req.body;
    
    if (!serverId || !remotePath) {
      return res.status(400).json({ error: '缺少服务器ID或远程路径' });
    }

    // 创建临时下载目录
    const downloadDir = path.join(process.cwd(), 'temp/downloads');
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    const localFileName = fileName || path.basename(remotePath);
    const localPath = path.join(downloadDir, `${Date.now()}_${localFileName}`);

    const result = await sshFileTransferService.downloadFile(
      parseInt(serverId),
      remotePath,
      localPath
    );

    // 发送文件
    res.download(localPath, localFileName, (err) => {
      if (err) {
        logger.error('文件下载发送失败:', err);
      }
      
      // 清理临时文件
      setTimeout(() => {
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }
      }, 5000); // 5秒后清理
    });

  } catch (error) {
    logError('ssh', error, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 列出远程目录内容
 * GET /api/ssh-session/list-directory/:serverId
 */
router.get('/list-directory/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    const { path: remotePath = '.' } = req.query;
    
    const list = await sshFileTransferService.listDirectory(
      parseInt(serverId),
      remotePath
    );

    res.json({
      success: true,
      path: remotePath,
      items: list
    });

  } catch (error) {
    logError('ssh', error, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 创建远程目录
 * POST /api/ssh-session/create-directory
 */
router.post('/create-directory', async (req, res) => {
  try {
    const { serverId, remotePath, mode } = req.body;
    
    if (!serverId || !remotePath) {
      return res.status(400).json({ error: '缺少服务器ID或目录路径' });
    }

    const result = await sshFileTransferService.createDirectory(
      parseInt(serverId),
      remotePath,
      { mode: mode ? parseInt(mode, 8) : undefined }
    );

    res.json({
      success: true,
      result
    });

  } catch (error) {
    logError('ssh', error, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 删除远程文件或目录
 * DELETE /api/ssh-session/delete-remote
 */
router.delete('/delete-remote', async (req, res) => {
  try {
    const { serverId, remotePath, recursive } = req.body;
    
    if (!serverId || !remotePath) {
      return res.status(400).json({ error: '缺少服务器ID或路径' });
    }

    const result = await sshFileTransferService.deleteRemote(
      parseInt(serverId),
      remotePath,
      { recursive: recursive === true }
    );

    res.json({
      success: true,
      result
    });

  } catch (error) {
    logError('ssh', error, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取文件传输进度
 * GET /api/ssh-session/transfer-progress/:transferId
 */
router.get('/transfer-progress/:transferId', async (req, res) => {
  try {
    const { transferId } = req.params;
    
    const progress = sshFileTransferService.getTransferProgress(transferId);
    
    if (!progress) {
      return res.status(404).json({ error: '传输不存在' });
    }

    res.json({
      success: true,
      progress
    });

  } catch (error) {
    logError('ssh', error, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取活跃传输列表
 * GET /api/ssh-session/active-transfers
 */
router.get('/active-transfers', async (req, res) => {
  try {
    const transfers = sshFileTransferService.getActiveTransfers();
    
    res.json({
      success: true,
      transfers
    });

  } catch (error) {
    logError('ssh', error, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取传输历史
 * GET /api/ssh-session/transfer-history/:serverId
 */
router.get('/transfer-history/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    const { limit = 20 } = req.query;
    
    const history = sshFileTransferService.getTransferHistory(
      parseInt(serverId),
      parseInt(limit)
    );

    res.json({
      success: true,
      history
    });

  } catch (error) {
    logError('ssh', error, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 取消文件传输
 * POST /api/ssh-session/cancel-transfer
 */
router.post('/cancel-transfer', async (req, res) => {
  try {
    const { transferId } = req.body;
    
    if (!transferId) {
      return res.status(400).json({ error: '缺少传输ID' });
    }

    const cancelled = sshFileTransferService.cancelTransfer(transferId);
    
    if (!cancelled) {
      return res.status(404).json({ error: '传输不存在或已完成' });
    }

    res.json({
      success: true,
      message: '传输已取消'
    });

  } catch (error) {
    logError('ssh', error, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取文件传输统计
 * GET /api/ssh-session/transfer-stats
 */
router.get('/transfer-stats', async (req, res) => {
  try {
    const stats = sshFileTransferService.getStats();
    
    res.json({
      success: true,
      stats
    });

  } catch (error) {
    logError('ssh', error, req);
    res.status(500).json({ error: error.message });
  }
});

export default router;
