/**
 * SSH 连接配置优化
 * 提供统一的SSH连接配置，提高连接稳定性
 * 支持SOCKS5代理连接
 */

import { SocksProxyAgent } from 'socks-proxy-agent';
import encryption from './encryption.js';

export const getOptimizedSSHConfig = (server) => {
  const baseConfig = {
    host: server.host,
    port: server.ssh_port || 22,
    username: server.username || 'root',
    readyTimeout: 15000, // 增加连接超时时间到15秒
    keepaliveInterval: 30000, // 心跳间隔30秒
    keepaliveCountMax: 3, // 最大心跳失败次数
    // 连接优化算法
    algorithms: {
      kex: [
        'ecdh-sha2-nistp256',
        'ecdh-sha2-nistp384', 
        'ecdh-sha2-nistp521',
        'diffie-hellman-group14-sha256',
        'diffie-hellman-group16-sha512'
      ],
      cipher: [
        'aes128-gcm',
        'aes256-gcm',
        'aes128-ctr',
        'aes256-ctr'
      ],
      hmac: [
        'hmac-sha2-256',
        'hmac-sha2-512'
      ]
    },
    // 连接重试配置
    retry: {
      maxAttempts: 3,
      delay: 1000,
      backoff: 2
    }
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
      
      baseConfig.agent = new SocksProxyAgent(proxyUrl);
    } catch (error) {
      console.error('创建SOCKS5代理配置失败:', error);
      // 如果代理配置失败，继续使用直连
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
          resolve(client);
        });

        client.on('error', (error) => {
          clearTimeout(timeout);
          client.destroy();
          
          if (attempt === maxAttempts) {
            reject(new Error(`SSH连接失败 (已尝试 ${maxAttempts} 次): ${error.message}`));
          } else {
            // 等待后重试
            setTimeout(() => {
              resolve(createSSHConnectionWithRetry(server, maxAttempts - attempt));
            }, config.retry.delay * Math.pow(config.retry.backoff, attempt - 1));
          }
        });

        client.connect(config);
      });
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      // 等待后重试
      await new Promise(resolve => 
        setTimeout(resolve, config.retry.delay * Math.pow(config.retry.backoff, attempt - 1))
      );
    }
  }
};

/**
 * 执行SSH命令的通用方法
 */
export const executeSSHCommand = async (server, command, options = {}) => {
  const {
    timeout = 30000,
    maxAttempts = 3,
    onOutput = null,
    onError = null
  } = options;

  const client = await createSSHConnectionWithRetry(server, maxAttempts);
  
  return new Promise((resolve, reject) => {
    const commandTimeout = setTimeout(() => {
      client.end();
      reject(new Error(`命令执行超时: ${command}`));
    }, timeout);

    client.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(commandTimeout);
        client.end();
        reject(err);
        return;
      }

      let output = '';
      let errorOutput = '';

      stream.on('close', (code) => {
        clearTimeout(commandTimeout);
        client.end();
        
        if (code === 0) {
          resolve({ success: true, output, errorOutput });
        } else {
          resolve({ success: false, output, errorOutput, exitCode: code });
        }
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
    });
  });
};

export default {
  getOptimizedSSHConfig,
  createSSHConnectionWithRetry,
  executeSSHCommand
};
