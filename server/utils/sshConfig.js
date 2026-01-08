/**
 * SSH 连接配置优化
 * 提供统一的SSH连接配置，提高连接稳定性和性能
 * 支持SOCKS5代理连接和多种网络环境
 */

import { SocksProxyAgent } from 'socks-proxy-agent';
import encryption from './encryption.js';
import logger from './logger.js';

export const getOptimizedSSHConfig = (server) => {
  const baseConfig = {
    host: server.host,
    port: server.ssh_port || 22,
    username: server.username || 'root',
    readyTimeout: 20000, // 20秒连接超时
    keepaliveInterval: 15000, // 15秒心跳间隔
    keepaliveCountMax: 5, // 最大心跳失败次数
    
    // 启用压缩以提高网络性能
    compress: true,
    
    // 优化缓冲区大小
    windowSize: 2 * 1024 * 1024, // 2MB窗口
    packetSize: 32768, // 32KB包大小
    
    // 连接优化算法 - 兼容性和性能平衡
    algorithms: {
      kex: [
        'ecdh-sha2-nistp256',
        'ecdh-sha2-nistp384', 
        'ecdh-sha2-nistp521',
        'diffie-hellman-group14-sha256',
        'diffie-hellman-group16-sha512',
        'diffie-hellman-group14-sha1' // 兼容老系统
      ],
      cipher: [
        'aes128-gcm',
        'aes256-gcm',
        'aes128-ctr',
        'aes192-ctr',
        'aes256-ctr',
        'aes128-cbc', // 兼容性支持
        'aes192-cbc',
        'aes256-cbc'
      ],
      hmac: [
        'hmac-sha2-256',
        'hmac-sha2-512',
        'hmac-sha1' // 兼容性支持
      ]
    },
    
    // 连接重试配置
    retry: {
      maxAttempts: 3,
      delay: 1000,
      backoff: 2
    },
    
    // 调试选项（开发环境）
    debug: process.env.NODE_ENV === 'development' ? 
      (msg) => logger.debug(`SSH Debug [${server.name || server.host}]: ${msg}`) : undefined
  };

  // 添加认证信息
  if (server.password) {
    baseConfig.password = server.password;
  } else if (server.private_key) {
    baseConfig.privateKey = server.private_key;
  }

  // 配置SOCKS5代理
  if (server.proxy_enabled && server.proxy_host) {
    try {
      let proxyUrl = `socks5://${server.proxy_host}:${server.proxy_port || 1080}`;
      
      // 如果代理需要认证
      if (server.proxy_username) {
        let proxyPassword = '';
        if (server.proxy_password_encrypted) {
          proxyPassword = encryption.decrypt(server.proxy_password_encrypted);
        }
        proxyUrl = `socks5://${server.proxy_username}:${proxyPassword}@${server.proxy_host}:${server.proxy_port || 1080}`;
      }
      
      baseConfig.sock = new SocksProxyAgent(proxyUrl);
      logger.debug(`SSH代理配置: ${server.proxy_host}:${server.proxy_port}`);
    } catch (error) {
      logger.error('创建SOCKS5代理配置失败:', error);
      // 如果代理配置失败，继续使用直连
    }
  }

  // 根据网络环境调整配置
  if (process.env.SSH_NETWORK_MODE) {
    switch (process.env.SSH_NETWORK_MODE.toLowerCase()) {
      case 'fast':
        // 快速网络环境
        baseConfig.readyTimeout = 10000;
        baseConfig.keepaliveInterval = 10000;
        baseConfig.windowSize = 4 * 1024 * 1024; // 4MB
        break;
        
      case 'slow':
        // 慢速网络环境
        baseConfig.readyTimeout = 30000;
        baseConfig.keepaliveInterval = 30000;
        baseConfig.windowSize = 512 * 1024; // 512KB
        baseConfig.packetSize = 16384; // 16KB
        break;
        
      case 'unstable':
        // 不稳定网络环境
        baseConfig.readyTimeout = 25000;
        baseConfig.keepaliveInterval = 20000;
        baseConfig.keepaliveCountMax = 8;
        baseConfig.retry.maxAttempts = 5;
        break;
    }
  }

  return baseConfig;
};

/**
 * 创建带重试机制的SSH连接
 */
export const createSSHConnectionWithRetry = async (server, maxAttempts = 3) => {
  const { Client } = await import('ssh2');
  const config = getOptimizedSSHConfig(server);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = new Client();
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.destroy();
          reject(new Error(`SSH连接超时 (尝试 ${attempt}/${maxAttempts})`));
        }, config.readyTimeout);

        client.on('ready', () => {
          clearTimeout(timeout);
          logger.debug(`SSH连接建立成功 (尝试 ${attempt}/${maxAttempts}): ${server.name || server.host}`);
          resolve(client);
        });

        client.on('error', (error) => {
          clearTimeout(timeout);
          client.destroy();
          
          logger.warn(`SSH连接失败 (尝试 ${attempt}/${maxAttempts}): ${server.name || server.host}`, {
            error: error.message,
            code: error.code
          });
          
          if (attempt === maxAttempts) {
            reject(new Error(`SSH连接失败 (已尝试 ${maxAttempts} 次): ${error.message}`));
          } else {
            // 等待后重试
            const retryDelay = config.retry.delay * Math.pow(config.retry.backoff, attempt - 1);
            setTimeout(() => {
              resolve(createSSHConnectionWithRetry(server, maxAttempts - attempt));
            }, retryDelay);
          }
        });

        // 添加连接事件监听
        client.on('greeting', (msg) => {
          logger.debug(`SSH服务器问候 [${server.name || server.host}]: ${msg}`);
        });

        client.on('banner', (msg) => {
          logger.debug(`SSH服务器横幅 [${server.name || server.host}]: ${msg}`);
        });

        try {
          client.connect(config);
        } catch (connectError) {
          clearTimeout(timeout);
          reject(connectError);
        }
      });
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      // 等待后重试
      const retryDelay = config.retry.delay * Math.pow(config.retry.backoff, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
};

/**
 * 执行SSH命令的通用方法（增强版）
 */
export const executeSSHCommand = async (server, command, options = {}) => {
  const {
    timeout = 30000,
    maxAttempts = 3,
    onOutput = null,
    onError = null,
    pty = false,
    env = {}
  } = options;

  const client = await createSSHConnectionWithRetry(server, maxAttempts);
  
  return new Promise((resolve, reject) => {
    const commandTimeout = setTimeout(() => {
      client.end();
      reject(new Error(`命令执行超时: ${command}`));
    }, timeout);

    const execOptions = {
      pty,
      env: {
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8',
        ...env
      }
    };

    client.exec(command, execOptions, (err, stream) => {
      if (err) {
        clearTimeout(commandTimeout);
        client.end();
        reject(err);
        return;
      }

      let output = '';
      let errorOutput = '';

      // 设置流编码
      stream.setEncoding('utf8');

      stream.on('close', (code, signal) => {
        clearTimeout(commandTimeout);
        client.end();
        
        // 清理输出
        const cleanOutput = cleanTerminalOutput(output);
        const cleanError = cleanTerminalOutput(errorOutput);
        
        const result = {
          success: code === 0 || code === null,
          output: cleanOutput,
          errorOutput: cleanError,
          exitCode: code,
          signal: signal,
          command: command
        };
        
        resolve(result);
      });

      stream.on('data', (data) => {
        const dataStr = data.toString();
        output += dataStr;
        onOutput?.(dataStr);
      });

      stream.stderr.on('data', (data) => {
        const dataStr = data.toString();
        errorOutput += dataStr;
        onError?.(dataStr);
      });

      stream.on('error', (streamError) => {
        clearTimeout(commandTimeout);
        client.end();
        reject(streamError);
      });
    });
  });
};

/**
 * 清理终端输出
 * @param {string} text - 原始文本
 * @returns {string} - 清理后的文本
 */
export const cleanTerminalOutput = (text) => {
  if (!text) return '';
  
  return text
    // 移除ANSI转义序列（保留基本颜色）
    .replace(/\x1b\[[0-9;]*[JKmsu]/g, '')
    // 移除光标控制序列
    .replace(/\x1b\[[0-9]*[ABCD]/g, '')
    // 移除清屏序列
    .replace(/\x1b\[2J/g, '')
    // 移除光标位置序列
    .replace(/\x1b\[[0-9;]*H/g, '')
    // 移除 bracketed paste mode
    .replace(/\x1b\[\?2004[hl]/g, '')
    // 统一换行符
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // 移除多余的空行
    .replace(/\n{3,}/g, '\n\n')
    // 移除首尾空白
    .trim();
};

/**
 * 检测SSH服务器能力
 */
export const detectSSHCapabilities = async (server) => {
  try {
    const client = await createSSHConnectionWithRetry(server, 1);
    
    const capabilities = {
      compression: false,
      pty: false,
      shell: false,
      exec: false,
      sftp: false,
      algorithms: {
        kex: [],
        cipher: [],
        hmac: []
      }
    };
    
    // 这里可以添加更多的能力检测逻辑
    
    client.end();
    return capabilities;
  } catch (error) {
    logger.warn(`SSH能力检测失败: ${server.name || server.host}`, error);
    return null;
  }
};

export default {
  getOptimizedSSHConfig,
  createSSHConnectionWithRetry,
  executeSSHCommand,
  cleanTerminalOutput,
  detectSSHCapabilities
};
