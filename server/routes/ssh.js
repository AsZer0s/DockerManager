import express from 'express';
import jwt from 'jsonwebtoken';
import { Client } from 'ssh2';

import database from '../config/database.js';
import logger from '../utils/logger.js';
import encryption from '../utils/encryption.js';
import { validateParams, commonValidation } from '../utils/validation.js';
import { getOptimizedSSHConfig } from '../utils/sshConfig.js';

const router = express.Router();

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
    
    const result = await database.query(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: '令牌无效',
        message: '用户不存在或已禁用'
      });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    return res.status(401).json({
      error: '令牌无效',
      message: '认证失败'
    });
  }
};

// 中间件：检查服务器 SSH 权限
const checkSshPermission = async (req, res, next) => {
  try {
    const serverId = parseInt(req.params.serverId);
    
    if (req.user.role === 'admin') {
      req.serverPermission = { canSsh: true };
      return next();
    }

    const result = await database.db.get(
      'SELECT can_ssh FROM user_server_permissions WHERE user_id = ? AND server_id = ?',
      [req.user.id, serverId]
    );

    if (!result || !result.can_ssh) {
      return res.status(403).json({
        error: '权限不足',
        message: '您没有权限 SSH 访问此服务器'
      });
    }

    req.serverPermission = result;
    next();
  } catch (error) {
    return res.status(500).json({
      error: '权限检查失败',
      message: '服务器内部错误'
    });
  }
};

/**
 * @route POST /api/ssh/:serverId/connect
 * @desc 建立 SSH 连接
 * @access Private
 */
router.post('/:serverId/connect',
  authenticateToken,
  validateParams(commonValidation.serverId),
  checkSshPermission,
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);

      // 获取服务器信息
      const serverResult = await database.query(
        'SELECT * FROM servers WHERE id = $1 AND is_active = true',
        [serverId]
      );

      if (serverResult.rows.length === 0) {
        return res.status(404).json({
          error: '服务器不存在',
          message: '未找到指定的服务器'
        });
      }

      const server = serverResult.rows[0];
      
      // 解密服务器凭据
      let password = null;
      let privateKey = null;
      
      if (server.password_encrypted) {
        password = encryption.decrypt(server.password_encrypted);
      }
      
      if (server.private_key_encrypted) {
        privateKey = encryption.decrypt(server.private_key_encrypted);
      }

      if (!password && !privateKey) {
        return res.status(400).json({
          error: '连接失败',
          message: '服务器缺少认证凭据'
        });
      }

      // 准备服务器配置对象
      const serverConfig = {
        ...server,
        password: password,
        private_key: privateKey
      };

      // 使用优化的SSH配置（支持代理）
      const sshConfig = getOptimizedSSHConfig(serverConfig);

      // 测试 SSH 连接
      const conn = new Client();
      
      conn.on('ready', () => {
        logger.info(`SSH 连接成功: ${server.name} (${server.host})`);
        
        // 关闭测试连接
        conn.end();
        
        res.json({
          message: 'SSH 连接测试成功',
          server: {
            id: server.id,
            name: server.name,
            host: server.host,
            port: server.port
          }
        });
      });

      conn.on('error', (err) => {
        logger.error(`SSH 连接失败: ${server.name}`, err);
        
        if (!res.headersSent) {
          res.status(400).json({
            error: 'SSH 连接失败',
            message: err.message
          });
        }
      });

      conn.connect(sshConfig);
    } catch (error) {
      logger.error('SSH 连接测试失败:', error);
      res.status(500).json({
        error: 'SSH 连接测试失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route POST /api/ssh/:serverId/execute
 * @desc 执行 SSH 命令
 * @access Private
 */
router.post('/:serverId/execute',
  authenticateToken,
  validateParams(commonValidation.serverId),
  checkSshPermission,
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);
      const { command, timeout = 30000 } = req.body;

      if (!command || typeof command !== 'string') {
        return res.status(400).json({
          error: '参数错误',
          message: '命令不能为空'
        });
      }

      // 安全检查：禁止执行危险命令
      const dangerousCommands = [
        'rm -rf /',
        'mkfs',
        'fdisk',
        'dd if=',
        'shutdown',
        'reboot',
        'halt',
        'poweroff',
        'init 0',
        'init 6'
      ];

      const isDangerous = dangerousCommands.some(dangerous => 
        command.toLowerCase().includes(dangerous.toLowerCase())
      );

      if (isDangerous) {
        return res.status(400).json({
          error: '命令被拒绝',
          message: '不允许执行此命令'
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
          message: '未找到指定的服务器'
        });
      }

      const server = serverResult.rows[0];
      
      // 解密服务器凭据
      let password = null;
      let privateKey = null;
      
      if (server.password_encrypted) {
        password = encryption.decrypt(server.password_encrypted);
      }
      
      if (server.private_key_encrypted) {
        privateKey = encryption.decrypt(server.private_key_encrypted);
      }

      // 准备服务器配置对象
      const serverConfig = {
        ...server,
        password: password,
        private_key: privateKey
      };

      // 使用优化的SSH配置（支持代理）
      const sshConfig = getOptimizedSSHConfig(serverConfig);

      // 执行 SSH 命令
      const conn = new Client();
      let output = '';
      let errorOutput = '';
      let exitCode = 0;

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            logger.error(`SSH 命令执行失败: ${server.name}`, err);
            if (!res.headersSent) {
              return res.status(400).json({
                error: '命令执行失败',
                message: err.message
              });
            }
            return;
          }

          stream.on('close', (code, signal) => {
            exitCode = code;
            
            // 记录操作日志
            database.query(`
              INSERT INTO operation_logs (user_id, server_id, action, details, timestamp)
              VALUES ($1, $2, 'ssh_command', $3, CURRENT_TIMESTAMP)
            `, [req.user.id, serverId, `命令: ${command}, 退出码: ${code}`]).catch(err => {
              logger.error('记录 SSH 操作日志失败:', err);
            });

            conn.end();
            
            res.json({
              message: '命令执行完成',
              result: {
                command,
                exitCode,
                output: output.trim(),
                error: errorOutput.trim(),
                timestamp: new Date()
              }
            });
          });

          stream.on('data', (data) => {
            output += data.toString();
          });

          stream.stderr.on('data', (data) => {
            errorOutput += data.toString();
          });

          // 设置超时
          setTimeout(() => {
            if (stream && !stream.destroyed) {
              stream.destroy();
              conn.end();
              
              if (!res.headersSent) {
                res.status(408).json({
                  error: '命令执行超时',
                  message: '命令执行时间超过限制'
                });
              }
            }
          }, timeout);
        });
      });

      conn.on('error', (err) => {
        logger.error(`SSH 连接失败: ${server.name}`, err);
        
        if (!res.headersSent) {
          res.status(400).json({
            error: 'SSH 连接失败',
            message: err.message
          });
        }
      });

      conn.connect(sshConfig);
    } catch (error) {
      logger.error('SSH 命令执行失败:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'SSH 命令执行失败',
          message: '服务器内部错误'
        });
      }
    }
  }
);

/**
 * @route GET /api/ssh/:serverId/files
 * @desc 获取服务器文件列表
 * @access Private
 */
router.get('/:serverId/files',
  authenticateToken,
  validateParams(commonValidation.serverId),
  checkSshPermission,
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);
      const { path = '/' } = req.query;

      // 安全检查：防止路径遍历攻击
      if (path.includes('..') || path.includes('~')) {
        return res.status(400).json({
          error: '路径错误',
          message: '不允许访问此路径'
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
          message: '未找到指定的服务器'
        });
      }

      const server = serverResult.rows[0];
      
      // 解密服务器凭据
      let password = null;
      let privateKey = null;
      
      if (server.password_encrypted) {
        password = encryption.decrypt(server.password_encrypted);
      }
      
      if (server.private_key_encrypted) {
        privateKey = encryption.decrypt(server.private_key_encrypted);
      }

      // 准备服务器配置对象
      const serverConfig = {
        ...server,
        password: password,
        private_key: privateKey
      };

      // 使用优化的SSH配置（支持代理）
      const sshConfig = getOptimizedSSHConfig(serverConfig);

      // 执行 ls 命令获取文件列表
      const conn = new Client();
      let output = '';

      conn.on('ready', () => {
        conn.exec(`ls -la "${path}"`, (err, stream) => {
          if (err) {
            logger.error(`SSH 文件列表获取失败: ${server.name}`, err);
            return res.status(400).json({
              error: '获取文件列表失败',
              message: err.message
            });
          }

          stream.on('close', (code) => {
            conn.end();
            
            if (code !== 0) {
              return res.status(400).json({
                error: '获取文件列表失败',
                message: '命令执行失败'
              });
            }

            // 解析 ls 输出
            const files = output.split('\n')
              .filter(line => line.trim())
              .map(line => {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 9) {
                  return {
                    permissions: parts[0],
                    links: parts[1],
                    owner: parts[2],
                    group: parts[3],
                    size: parts[4],
                    date: parts[5] + ' ' + parts[6] + ' ' + parts[7],
                    name: parts.slice(8).join(' '),
                    isDirectory: parts[0].startsWith('d'),
                    isFile: parts[0].startsWith('-')
                  };
                }
                return null;
              })
              .filter(file => file !== null);

            res.json({
              path,
              files,
              total: files.length
            });
          });

          stream.on('data', (data) => {
            output += data.toString();
          });
        });
      });

      conn.on('error', (err) => {
        logger.error(`SSH 连接失败: ${server.name}`, err);
        
        if (!res.headersSent) {
          res.status(400).json({
            error: 'SSH 连接失败',
            message: err.message
          });
        }
      });

      conn.connect(sshConfig);
    } catch (error) {
      logger.error('获取文件列表失败:', error);
      res.status(500).json({
        error: '获取文件列表失败',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * @route GET /api/ssh/:serverId/system-info
 * @desc 获取服务器系统信息
 * @access Private
 */
router.get('/:serverId/system-info',
  authenticateToken,
  validateParams(commonValidation.serverId),
  checkSshPermission,
  async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);

      // 获取服务器信息
      const serverResult = await database.query(
        'SELECT * FROM servers WHERE id = $1 AND is_active = true',
        [serverId]
      );

      if (serverResult.rows.length === 0) {
        return res.status(404).json({
          error: '服务器不存在',
          message: '未找到指定的服务器'
        });
      }

      const server = serverResult.rows[0];
      
      // 解密服务器凭据
      let password = null;
      let privateKey = null;
      
      if (server.password_encrypted) {
        password = encryption.decrypt(server.password_encrypted);
      }
      
      if (server.private_key_encrypted) {
        privateKey = encryption.decrypt(server.private_key_encrypted);
      }

      // 准备服务器配置对象
      const serverConfig = {
        ...server,
        password: password,
        private_key: privateKey
      };

      // 使用优化的SSH配置（支持代理）
      const sshConfig = getOptimizedSSHConfig(serverConfig);

      // 执行系统信息收集命令
      const commands = {
        uname: 'uname -a',
        uptime: 'uptime',
        memory: 'free -h',
        disk: 'df -h',
        cpu: 'lscpu | grep "Model name"',
        load: 'cat /proc/loadavg'
      };

      const conn = new Client();
      const results = {};

      conn.on('ready', () => {
        let completedCommands = 0;
        const totalCommands = Object.keys(commands).length;

        const checkCompletion = () => {
          completedCommands++;
          if (completedCommands === totalCommands) {
            conn.end();
            res.json({
              serverId,
              systemInfo: results,
              timestamp: new Date()
            });
          }
        };

        Object.entries(commands).forEach(([key, command]) => {
          conn.exec(command, (err, stream) => {
            if (err) {
              results[key] = { error: err.message };
              checkCompletion();
              return;
            }

            let output = '';
            stream.on('data', (data) => {
              output += data.toString();
            });

            stream.on('close', (code) => {
              results[key] = code === 0 ? output.trim() : { error: '命令执行失败' };
              checkCompletion();
            });
          });
        });
      });

      conn.on('error', (err) => {
        logger.error(`SSH 连接失败: ${server.name}`, err);
        
        if (!res.headersSent) {
          res.status(400).json({
            error: 'SSH 连接失败',
            message: err.message
          });
        }
      });

      conn.connect(sshConfig);
    } catch (error) {
      logger.error('获取系统信息失败:', error);
      res.status(500).json({
        error: '获取系统信息失败',
        message: '服务器内部错误'
      });
    }
  }
);

export default router;
