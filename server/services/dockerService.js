import logger from '../utils/logger.js';
import database from '../config/database.js';
import encryption from '../utils/encryption.js';

class DockerService {
  constructor() {
    this.isMonitoringContext = false; // 是否为监控上下文
  }


  /**
   * 设置监控上下文
   * @param {boolean} isMonitoring - 是否为监控上下文
   */
  setMonitoringContext(isMonitoring) {
    this.isMonitoringContext = isMonitoring;
  }


  /**
   * 获取容器列表
   * @param {number} serverId - 服务器 ID
   * @param {boolean} all - 是否包含所有容器（包括停止的）
   * @returns {Promise<Array>} 容器列表
   */
  async getContainers(serverId, all = true) {
    try {
      // 获取完整的服务器信息（包括解密后的密码和私钥）
      const server = await this.getFullServerInfo(serverId);
      if (!server) {
        throw new Error(`服务器 ${serverId} 不存在或未激活`);
      }

      // 检查SSH认证信息
      if (!server.password && !server.private_key) {
        throw new Error(`服务器 ${serverId} 缺少SSH认证信息（密码或私钥）`);
      }

      // 通过 SSH 连接获取容器列表
      const containers = await this.getContainersViaSSH(server, all);
      
      // 更新数据库中的容器信息
      for (const container of containers) {
        await this.updateContainerInDatabase(serverId, container);
      }

      return containers;
    } catch (error) {
      logger.error(`获取容器列表失败 (服务器 ${serverId}):`, error);
      throw error;
    }
  }

  /**
   * 通过 SSH 获取容器列表
   * @param {Object} server - 服务器信息
   * @param {boolean} all - 是否包含所有容器
   * @returns {Promise<Array>} 容器列表
   */
  async getContainersViaSSH(server, all = true) {
    return new Promise(async (resolve, reject) => {
      try {
        const { Client } = await import('ssh2');
        const client = new Client();
        
        const timeout = setTimeout(() => {
          client.destroy();
          reject(new Error('SSH 连接超时'));
        }, 30000); // 30秒超时
        
        client.on('ready', () => {
          clearTimeout(timeout);
          
          // 使用JSON格式获取容器列表，更准确可靠
          const command = all ? "docker ps -a --format '{{json .}}'" 
                              : "docker ps --format '{{json .}}'";
          
          client.exec(command, (err, stream) => {
            if (err) {
              client.end();
              reject(err);
              return;
            }
            
            let output = '';
            stream.on('close', (code) => {
              client.end();
              
              if (code === 0) {
                const containers = this.parseDockerPsJsonOutput(output);
                resolve(containers);
              } else {
                reject(new Error(`Docker 命令执行失败，退出码: ${code}`));
              }
            });
            
            stream.on('data', (data) => {
              output += data.toString();
            });
            
            stream.stderr.on('data', (data) => {
              // 记录错误输出但不中断
              logger.debug('Docker ps 错误输出:', data.toString());
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
          port: server.ssh_port || 22,
          username: server.username || 'root',
          readyTimeout: 15000,
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
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 解析 docker ps JSON 输出
   * @param {string} output - docker ps --format '{{json .}}' 命令输出
   * @returns {Array} 容器列表
   */
  parseDockerPsJsonOutput(output) {
    const lines = output.trim().split('\n');
    const containers = [];
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const containerData = JSON.parse(line);
        
        const container = {
          id: containerData.ID || '',
          name: containerData.Names || 'unnamed',
          image: containerData.Image || '',
          status: containerData.Status || 'unknown',
          created: this.parseCreatedTime(containerData.CreatedAt || ''),
          ports: this.parsePortsString(containerData.Ports || ''),
          labels: this.parseLabelsString(containerData.Labels || ''),
          command: containerData.Command || '',
          sizeRw: this.parseSize(containerData.Size || '0B'),
          sizeRootFs: 0,
          // 额外信息
          state: containerData.State || '',
          runningFor: containerData.RunningFor || '',
          networks: containerData.Networks || '',
          mounts: containerData.Mounts || '',
          localVolumes: containerData.LocalVolumes || '0'
        };
        
        containers.push(container);
      } catch (parseError) {
        logger.warn('解析容器JSON数据失败:', parseError, '原始数据:', line);
        // 如果JSON解析失败，跳过这一行
        continue;
      }
    }
    
    return containers;
  }

  /**
   * 解析大小字符串
   * @param {string} sizeStr - 大小字符串 (例如: "0B (virtual 137MB)")
   * @returns {number} 大小（字节）
   */
  parseSize(sizeStr) {
    if (!sizeStr) return 0;
    
    // 提取第一个数字部分，例如 "0B (virtual 137MB)" -> "0B"
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)([KMGT]?B)/i);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2].toUpperCase();
      
      switch (unit) {
        case 'B':
          return value;
        case 'KB':
          return value * 1024;
        case 'MB':
          return value * 1024 * 1024;
        case 'GB':
          return value * 1024 * 1024 * 1024;
        case 'TB':
          return value * 1024 * 1024 * 1024 * 1024;
        default:
          return value;
      }
    }
    
    return 0;
  }

  /**
   * 解析创建时间字符串
   * @param {string} timeStr - 时间字符串
   * @returns {Date} 解析后的日期
   */
  parseCreatedTime(timeStr) {
    if (!timeStr) return new Date();
    
    // 尝试解析绝对时间格式 (YYYY-MM-DD HH:MM:SS +0000 UTC)
    const absoluteMatch = timeStr.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(\+\d{4})\s+UTC$/);
    if (absoluteMatch) {
      return new Date(`${absoluteMatch[1]}T${absoluteMatch[2]}${absoluteMatch[3]}`);
    }
    
    // 尝试解析相对时间格式 (例如: "12 minutes ago", "5 days ago")
    const relativeMatch = timeStr.match(/^(\d+)\s+(minutes?|hours?|days?|seconds?)\s+ago$/i);
    if (relativeMatch) {
      const value = parseInt(relativeMatch[1]);
      const unit = relativeMatch[2].toLowerCase();
      const now = new Date();
      
      switch (unit) {
        case 'second':
        case 'seconds':
          return new Date(now.getTime() - value * 1000);
        case 'minute':
        case 'minutes':
          return new Date(now.getTime() - value * 60 * 1000);
        case 'hour':
        case 'hours':
          return new Date(now.getTime() - value * 60 * 60 * 1000);
        case 'day':
        case 'days':
          return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
        default:
          return new Date();
      }
    }
    
    // 如果都不匹配，尝试直接解析
    return new Date(timeStr);
  }

  /**
   * 解析端口字符串
   * @param {string} portsStr - 端口字符串
   * @returns {Array} 端口数组
   */
  parsePortsString(portsStr) {
    if (!portsStr || portsStr.trim() === '') return [];
    
    const ports = [];
    const portPairs = portsStr.split(',');
    
    for (const pair of portPairs) {
      const trimmedPair = pair.trim();
      if (!trimmedPair) continue;
      
      // 处理多种端口格式：
      // 1. 0.0.0.0:8080->80/tcp
      // 2. 8080:80/tcp
      // 3. 80/tcp (仅内部端口)
      // 4. 0.0.0.0:8080->80/tcp, :::8080->80/tcp (IPv6)
      
      let match = trimmedPair.match(/^(\d+\.\d+\.\d+\.\d+):(\d+)->(\d+)\/(\w+)$/);
      if (match) {
        // 格式: 0.0.0.0:8080->80/tcp
        ports.push({
          IP: match[1],
          PrivatePort: parseInt(match[3]),
          PublicPort: parseInt(match[2]),
          Type: match[4]
        });
        continue;
      }
      
      match = trimmedPair.match(/^:::(\d+)->(\d+)\/(\w+)$/);
      if (match) {
        // 格式: :::8080->80/tcp (IPv6)
        ports.push({
          IP: '::',
          PrivatePort: parseInt(match[2]),
          PublicPort: parseInt(match[1]),
          Type: match[3]
        });
        continue;
      }
      
      match = trimmedPair.match(/^(\d+):(\d+)\/(\w+)$/);
      if (match) {
        // 格式: 8080:80/tcp
        ports.push({
          IP: '0.0.0.0',
          PrivatePort: parseInt(match[2]),
          PublicPort: parseInt(match[1]),
          Type: match[3]
        });
        continue;
      }
      
      match = trimmedPair.match(/^(\d+)\/(\w+)$/);
      if (match) {
        // 格式: 80/tcp (仅内部端口)
        ports.push({
          IP: '',
          PrivatePort: parseInt(match[1]),
          PublicPort: null,
          Type: match[2]
        });
        continue;
      }
      
      // 如果都不匹配，尝试简单的端口对格式
      match = trimmedPair.match(/^(\d+):(\d+)$/);
      if (match) {
        ports.push({
          IP: '0.0.0.0',
          PrivatePort: parseInt(match[2]),
          PublicPort: parseInt(match[1]),
          Type: 'tcp'
        });
      }
    }
    
    return ports;
  }

  /**
   * 解析标签字符串
   * @param {string} labelsStr - 标签字符串
   * @returns {Object} 标签对象
   */
  parseLabelsString(labelsStr) {
    if (!labelsStr) return {};
    
    const labels = {};
    const labelPairs = labelsStr.split(',');
    
    for (const pair of labelPairs) {
      const [key, value] = pair.split('=');
      if (key && value) {
        labels[key.trim()] = value.trim();
      }
    }
    
    return labels;
  }

  /**
   * 获取完整的服务器信息（包括解密后的密码和私钥）
   * @param {number} serverId - 服务器 ID
   * @returns {Promise<Object|null>} 服务器信息
   */
  async getFullServerInfo(serverId) {
    try {
      const result = await database.db.get(
        'SELECT * FROM servers WHERE id = ? AND is_active = 1',
        [serverId]
      );
      
      if (!result) {
        logger.warn(`服务器 ${serverId} 不存在或未激活`);
        return null;
      }
      
      const server = result;
      
      // 解密敏感信息
      try {
        if (server.password_encrypted) {
          server.password = encryption.decrypt(server.password_encrypted);
        }
        if (server.private_key_encrypted) {
          server.private_key = encryption.decrypt(server.private_key_encrypted);
        }
      } catch (decryptError) {
        logger.error(`解密服务器 ${serverId} 敏感信息失败:`, decryptError);
        throw new Error('解密服务器认证信息失败');
      }
      
      return server;
    } catch (error) {
      logger.error(`获取服务器 ${serverId} 完整信息失败:`, error);
      throw error;
    }
  }

  /**
   * 获取容器详细信息
   * @param {number} serverId - 服务器 ID
   * @param {string} containerId - 容器 ID
   * @returns {Promise<Object>} 容器详细信息
   */
  async getContainerInfo(serverId, containerId) {
    try {
      // 获取完整的服务器信息（包括解密后的密码和私钥）
      const server = await this.getFullServerInfo(serverId);
      if (!server) {
        throw new Error('服务器不存在');
      }

      // 通过 SSH 连接获取容器详细信息
      const info = await this.getContainerInfoViaSSH(server, containerId);
      return info;
    } catch (error) {
      logger.error(`获取容器信息失败 (服务器 ${serverId}, 容器 ${containerId}):`, error);
      throw error;
    }
  }

  /**
   * 通过 SSH 获取容器详细信息
   * @param {Object} server - 服务器信息
   * @param {string} containerId - 容器 ID
   * @returns {Promise<Object>} 容器详细信息
   */
  async getContainerInfoViaSSH(server, containerId) {
    return new Promise(async (resolve, reject) => {
      try {
        const { Client } = await import('ssh2');
        const client = new Client();
        
        const timeout = setTimeout(() => {
          client.destroy();
          reject(new Error('SSH 连接超时'));
        }, 30000); // 30秒超时
        
        client.on('ready', () => {
          clearTimeout(timeout);
          
          // 执行 docker inspect 命令获取容器详细信息
          client.exec(`docker inspect ${containerId}`, (err, stream) => {
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
                  const info = JSON.parse(output)[0];
                  const containerInfo = {
                    id: info.Id,
                    name: info.Name.replace('/', ''),
                    image: info.Config.Image,
                    status: info.State.Status,
                    created: new Date(info.Created),
                    startedAt: info.State.StartedAt ? new Date(info.State.StartedAt) : null,
                    finishedAt: info.State.FinishedAt ? new Date(info.State.FinishedAt) : null,
                    restartCount: info.RestartCount,
                    ports: this.formatPortsFromInspect(info.NetworkSettings.Ports),
                    volumes: this.formatVolumes(info.Mounts),
                    environment: info.Config.Env,
                    command: info.Config.Cmd,
                    workingDir: info.Config.WorkingDir,
                    labels: info.Config.Labels,
                    networkMode: info.HostConfig.NetworkMode,
                    memoryLimit: info.HostConfig.Memory,
                    cpuShares: info.HostConfig.CpuShares,
                    restartPolicy: info.HostConfig.RestartPolicy?.Name || 'no'
                  };
                  resolve(containerInfo);
                } catch (parseError) {
                  reject(new Error('解析容器信息失败'));
                }
              } else {
                reject(new Error(`Docker inspect 命令执行失败，退出码: ${code}`));
              }
            });
            
            stream.on('data', (data) => {
              output += data.toString();
            });
            
            stream.stderr.on('data', (data) => {
              // 记录错误输出但不中断
              logger.debug('Docker inspect 错误输出:', data.toString());
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
          port: server.ssh_port || 22,
          username: server.username || 'root',
          readyTimeout: 15000,
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
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 启动容器
   * @param {number} serverId - 服务器 ID
   * @param {string} containerId - 容器 ID
   * @returns {Promise<Object>} 操作结果
   */
  async startContainer(serverId, containerId) {
    try {
      // 获取完整的服务器信息（包括解密后的密码和私钥）
      const server = await this.getFullServerInfo(serverId);
      if (!server) {
        throw new Error(`服务器 ${serverId} 不存在或未激活`);
      }

      // 检查SSH认证信息
      if (!server.password && !server.private_key) {
        throw new Error(`服务器 ${serverId} 缺少SSH认证信息（密码或私钥）`);
      }

      // 通过 SSH 启动容器
      const result = await this.startContainerViaSSH(server, containerId);
      
      // 记录操作日志
      await this.logOperation(serverId, containerId, 'start', result.success ? '容器启动成功' : `启动失败: ${result.error}`);
      
      return result;
    } catch (error) {
      logger.error(`启动容器失败 (服务器 ${serverId}, 容器 ${containerId}):`, error);
      await this.logOperation(serverId, containerId, 'start', `启动失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 通过SSH启动容器
   * @param {Object} server - 服务器信息
   * @param {string} containerId - 容器ID
   * @returns {Promise<Object>} 操作结果
   */
  async startContainerViaSSH(server, containerId) {
    return new Promise(async (resolve, reject) => {
      try {
        const { Client } = await import('ssh2');
        const client = new Client();
      
      const timeout = setTimeout(() => {
        client.end();
        reject(new Error('SSH连接超时'));
      }, 10000);
      
      client.on('ready', () => {
        client.exec(`docker start ${containerId}`, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            client.end();
            reject(err);
            return;
          }
          
          let output = '';
          let errorOutput = '';
          
          stream.on('close', (code) => {
            clearTimeout(timeout);
            client.end();
            
            if (code === 0) {
              resolve({ success: true, message: '容器启动成功' });
            } else {
              resolve({ success: false, error: errorOutput || '容器启动失败' });
            }
          });
          
          stream.on('data', (data) => {
            output += data.toString();
          });
          
          stream.stderr.on('data', (data) => {
            errorOutput += data.toString();
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
        port: server.ssh_port || 22,
        username: server.ssh_user || 'root',
        readyTimeout: 15000,
      };
      
      if (server.password) {
        connectConfig.password = server.password;
      } else if (server.private_key) {
        connectConfig.privateKey = server.private_key;
      }
      
      client.connect(connectConfig);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 停止容器
   * @param {number} serverId - 服务器 ID
   * @param {string} containerId - 容器 ID
   * @param {number} timeout - 超时时间（秒）
   * @returns {Promise<Object>} 操作结果
   */
  async stopContainer(serverId, containerId, timeout = 10) {
    try {
      // 获取完整的服务器信息（包括解密后的密码和私钥）
      const server = await this.getFullServerInfo(serverId);
      if (!server) {
        throw new Error(`服务器 ${serverId} 不存在或未激活`);
      }

      // 检查SSH认证信息
      if (!server.password && !server.private_key) {
        throw new Error(`服务器 ${serverId} 缺少SSH认证信息（密码或私钥）`);
      }

      // 通过 SSH 停止容器
      const result = await this.stopContainerViaSSH(server, containerId, timeout);
      
      // 记录操作日志
      await this.logOperation(serverId, containerId, 'stop', result.success ? '容器停止成功' : `停止失败: ${result.error}`);
      
      return result;
    } catch (error) {
      logger.error(`停止容器失败 (服务器 ${serverId}, 容器 ${containerId}):`, error);
      await this.logOperation(serverId, containerId, 'stop', `停止失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 通过SSH停止容器
   * @param {Object} server - 服务器信息
   * @param {string} containerId - 容器ID
   * @param {number} timeout - 超时时间（秒）
   * @returns {Promise<Object>} 操作结果
   */
  async stopContainerViaSSH(server, containerId, timeout = 10) {
    return new Promise(async (resolve, reject) => {
      try {
        const { Client } = await import('ssh2');
        const client = new Client();
      
      const timeoutMs = setTimeout(() => {
        client.end();
        reject(new Error('SSH连接超时'));
      }, 10000);
      
      client.on('ready', () => {
        client.exec(`docker stop -t ${timeout} ${containerId}`, (err, stream) => {
          if (err) {
            clearTimeout(timeoutMs);
            client.end();
            reject(err);
            return;
          }
          
          let output = '';
          let errorOutput = '';
          
          stream.on('close', (code) => {
            clearTimeout(timeoutMs);
            client.end();
            
            if (code === 0) {
              resolve({ success: true, message: '容器停止成功' });
            } else {
              resolve({ success: false, error: errorOutput || '容器停止失败' });
            }
          });
          
          stream.on('data', (data) => {
            output += data.toString();
          });
          
          stream.stderr.on('data', (data) => {
            errorOutput += data.toString();
          });
        });
      });
      
      client.on('error', (err) => {
        clearTimeout(timeoutMs);
        reject(err);
      });
      
      // 连接配置
      const connectConfig = {
        host: server.host,
        port: server.ssh_port || 22,
        username: server.ssh_user || 'root',
        readyTimeout: 15000,
      };
      
      if (server.password) {
        connectConfig.password = server.password;
      } else if (server.private_key) {
        connectConfig.privateKey = server.private_key;
      }
      
      client.connect(connectConfig);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 重启容器
   * @param {number} serverId - 服务器 ID
   * @param {string} containerId - 容器 ID
   * @param {number} timeout - 超时时间（秒）
   * @returns {Promise<Object>} 操作结果
   */
  async restartContainer(serverId, containerId, timeout = 10) {
    try {
      // 获取完整的服务器信息（包括解密后的密码和私钥）
      const server = await this.getFullServerInfo(serverId);
      if (!server) {
        throw new Error(`服务器 ${serverId} 不存在或未激活`);
      }

      // 检查SSH认证信息
      if (!server.password && !server.private_key) {
        throw new Error(`服务器 ${serverId} 缺少SSH认证信息（密码或私钥）`);
      }

      // 通过 SSH 重启容器
      const result = await this.restartContainerViaSSH(server, containerId, timeout);
      
      // 记录操作日志
      await this.logOperation(serverId, containerId, 'restart', result.success ? '容器重启成功' : `重启失败: ${result.error}`);
      
      return result;
    } catch (error) {
      logger.error(`重启容器失败 (服务器 ${serverId}, 容器 ${containerId}):`, error);
      await this.logOperation(serverId, containerId, 'restart', `重启失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 通过SSH重启容器
   * @param {Object} server - 服务器信息
   * @param {string} containerId - 容器ID
   * @param {number} timeout - 超时时间（秒）
   * @returns {Promise<Object>} 操作结果
   */
  async restartContainerViaSSH(server, containerId, timeout = 10) {
    return new Promise(async (resolve, reject) => {
      try {
        const { Client } = await import('ssh2');
        const client = new Client();
      
      const timeoutMs = setTimeout(() => {
        client.end();
        reject(new Error('SSH连接超时'));
      }, 30000); // 增加到30秒
      
      client.on('ready', () => {
        client.exec(`docker restart -t ${timeout} ${containerId}`, (err, stream) => {
          if (err) {
            clearTimeout(timeoutMs);
            client.end();
            reject(err);
            return;
          }
          
          let output = '';
          let errorOutput = '';
          
          stream.on('close', (code) => {
            clearTimeout(timeoutMs);
            client.end();
            
            if (code === 0) {
              resolve({ success: true, message: '容器重启成功' });
            } else {
              resolve({ success: false, error: errorOutput || '容器重启失败' });
            }
          });
          
          stream.on('data', (data) => {
            output += data.toString();
          });
          
          stream.stderr.on('data', (data) => {
            errorOutput += data.toString();
          });
        });
      });
      
      client.on('error', (err) => {
        clearTimeout(timeoutMs);
        reject(err);
      });
      
      // 连接配置
      const connectConfig = {
        host: server.host,
        port: server.ssh_port || 22,
        username: server.ssh_user || 'root',
        readyTimeout: 15000,
      };
      
      if (server.password) {
        connectConfig.password = server.password;
      } else if (server.private_key) {
        connectConfig.privateKey = server.private_key;
      }
      
      client.connect(connectConfig);
      } catch (error) {
        reject(error);
      }
    });
  }


  /**
   * 删除容器
   * @param {number} serverId - 服务器 ID
   * @param {string} containerId - 容器 ID
   * @param {boolean} force - 是否强制删除
   * @returns {Promise<Object>} 操作结果
   */
  async removeContainer(serverId, containerId, force = false) {
    try {
      // 获取完整的服务器信息（包括解密后的密码和私钥）
      const server = await this.getFullServerInfo(serverId);
      if (!server) {
        throw new Error(`服务器 ${serverId} 不存在或未激活`);
      }

      // 检查SSH认证信息
      if (!server.password && !server.private_key) {
        throw new Error(`服务器 ${serverId} 缺少SSH认证信息（密码或私钥）`);
      }

      // 通过 SSH 删除容器
      const result = await this.removeContainerViaSSH(server, containerId, force);
      
      if (result.success) {
        // 从数据库中删除容器记录
        await database.db.run(
          'DELETE FROM containers WHERE server_id = ? AND container_id = ?',
          [serverId, containerId]
        );
      }
      
      // 记录操作日志
      await this.logOperation(serverId, containerId, 'remove', result.success ? '容器删除成功' : `删除失败: ${result.error}`);
      
      return result;
    } catch (error) {
      logger.error(`删除容器失败 (服务器 ${serverId}, 容器 ${containerId}):`, error);
      await this.logOperation(serverId, containerId, 'remove', `删除失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 通过SSH删除容器
   * @param {Object} server - 服务器信息
   * @param {string} containerId - 容器ID
   * @param {boolean} force - 是否强制删除
   * @returns {Promise<Object>} 操作结果
   */
  async removeContainerViaSSH(server, containerId, force = false) {
    return new Promise(async (resolve, reject) => {
      try {
        const { Client } = await import('ssh2');
        const client = new Client();
      
      const timeout = setTimeout(() => {
        client.end();
        reject(new Error('SSH连接超时'));
      }, 10000);
      
      client.on('ready', () => {
        const command = force ? `docker rm -f ${containerId}` : `docker rm ${containerId}`;
        client.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            client.end();
            reject(err);
            return;
          }
          
          let output = '';
          let errorOutput = '';
          
          stream.on('close', (code) => {
            clearTimeout(timeout);
            client.end();
            
            if (code === 0) {
              resolve({ success: true, message: '容器删除成功' });
            } else {
              resolve({ success: false, error: errorOutput || '容器删除失败' });
            }
          });
          
          stream.on('data', (data) => {
            output += data.toString();
          });
          
          stream.stderr.on('data', (data) => {
            errorOutput += data.toString();
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
        port: server.ssh_port || 22,
        username: server.ssh_user || 'root',
        readyTimeout: 15000,
      };
      
      if (server.password) {
        connectConfig.password = server.password;
      } else if (server.private_key) {
        connectConfig.privateKey = server.private_key;
      }
      
      client.connect(connectConfig);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 获取容器日志
   * @param {number} serverId - 服务器 ID
   * @param {string} containerId - 容器 ID
   * @param {Object} options - 日志选项
   * @returns {Promise<string>} 容器日志
   */
  async getContainerLogs(serverId, containerId, options = {}) {
    try {
      // 获取完整的服务器信息（包括解密后的密码和私钥）
      const server = await this.getFullServerInfo(serverId);
      if (!server) {
        throw new Error(`服务器 ${serverId} 不存在或未激活`);
      }

      // 检查SSH认证信息
      if (!server.password && !server.private_key) {
        throw new Error(`服务器 ${serverId} 缺少SSH认证信息（密码或私钥）`);
      }

      // 通过 SSH 获取容器日志
      const logs = await this.getContainerLogsViaSSH(server, containerId, options);
      return logs;
    } catch (error) {
      logger.error(`获取容器日志失败 (服务器 ${serverId}, 容器 ${containerId}):`, error);
      throw error;
    }
  }

  /**
   * 通过SSH获取容器日志
   * @param {Object} server - 服务器信息
   * @param {string} containerId - 容器ID
   * @param {Object} options - 日志选项
   * @returns {Promise<string>} 容器日志
   */
  async getContainerLogsViaSSH(server, containerId, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const { Client } = await import('ssh2');
        const client = new Client();
      
      const timeout = setTimeout(() => {
        client.end();
        reject(new Error('SSH连接超时'));
      }, 15000); // 日志获取可能需要更长时间
      
      client.on('ready', () => {
        // 构建docker logs命令
        let command = `docker logs ${containerId}`;
        
        if (options.tail) {
          command += ` --tail ${options.tail}`;
        }
        
        if (options.timestamps) {
          command += ' --timestamps';
        }
        
        if (options.since) {
          command += ` --since ${options.since}`;
        }
        
        if (options.until) {
          command += ` --until ${options.until}`;
        }
        
        client.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            client.end();
            reject(err);
            return;
          }
          
          let output = '';
          let errorOutput = '';
          
          stream.on('close', (code) => {
            clearTimeout(timeout);
            client.end();
            
            if (code === 0) {
              resolve(output);
            } else {
              reject(new Error(errorOutput || '获取容器日志失败'));
            }
          });
          
          stream.on('data', (data) => {
            output += data.toString();
          });
          
          stream.stderr.on('data', (data) => {
            errorOutput += data.toString();
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
        port: server.ssh_port || 22,
        username: server.ssh_user || 'root',
        readyTimeout: 15000,
      };
      
      if (server.password) {
        connectConfig.password = server.password;
      } else if (server.private_key) {
        connectConfig.privateKey = server.private_key;
      }
      
      client.connect(connectConfig);
      } catch (error) {
        reject(error);
      }
    });
  }


  // 辅助方法
  formatPorts(ports) {
    if (!ports || ports.length === 0) return [];
    
    return ports.map(port => ({
      privatePort: port.PrivatePort,
      publicPort: port.PublicPort,
      type: port.Type,
      ip: port.IP
    }));
  }

  formatPortBindings(portBindings) {
    if (!portBindings) return {};
    
    const bindings = {};
    for (const [containerPort, hostBindings] of Object.entries(portBindings)) {
      if (hostBindings && hostBindings.length > 0) {
        bindings[containerPort] = hostBindings.map(binding => ({
          hostIp: binding.HostIp,
          hostPort: binding.HostPort
        }));
      }
    }
    return bindings;
  }

  formatPortsFromInspect(portBindings) {
    if (!portBindings) return [];
    
    const ports = [];
    for (const [containerPort, hostBindings] of Object.entries(portBindings)) {
      if (hostBindings && hostBindings.length > 0) {
        hostBindings.forEach(binding => {
          const [privatePort, type] = containerPort.split('/');
          ports.push({
            privatePort: parseInt(privatePort),
            publicPort: binding.HostPort ? parseInt(binding.HostPort) : null,
            type: type || 'tcp',
            ip: binding.HostIp || '0.0.0.0'
          });
        });
      } else {
        const [privatePort, type] = containerPort.split('/');
        ports.push({
          privatePort: parseInt(privatePort),
          publicPort: null,
          type: type || 'tcp',
          ip: '0.0.0.0'
        });
      }
    }
    return ports;
  }

  formatVolumes(mounts) {
    if (!mounts) return [];
    
    return mounts.map(mount => ({
      type: mount.Type,
      source: mount.Source,
      destination: mount.Destination,
      mode: mount.Mode,
      rw: mount.RW
    }));
  }

  async updateContainerInDatabase(serverId, container) {
    try {
      const existing = await database.db.get(
        'SELECT id FROM containers WHERE server_id = ? AND container_id = ?',
        [serverId, container.id]
      );

      if (existing) {
        // 更新现有记录
        await database.db.run(`
          UPDATE containers 
          SET name = ?, image = ?, status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE server_id = ? AND container_id = ?
        `, [
          container.name,
          container.image,
          container.status,
          serverId,
          container.id
        ]);
      } else {
        // 插入新记录
        await database.db.run(`
          INSERT INTO containers (server_id, container_id, name, image, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          serverId,
          container.id,
          container.name,
          container.image,
          container.status,
          container.created
        ]);
      }
    } catch (error) {
      logger.error('更新容器数据库记录失败:', error);
    }
  }

  /**
   * 获取容器统计信息
   * @param {number} serverId - 服务器 ID
   * @param {string} containerId - 容器 ID
   * @returns {Promise<Object>} 容器统计信息
   */
  async getContainerStats(serverId, containerId) {
    try {
      // 获取完整的服务器信息（包括解密后的密码和私钥）
      const server = await this.getFullServerInfo(serverId);
      if (!server) {
        throw new Error(`服务器 ${serverId} 不存在或未激活`);
      }

      // 检查SSH认证信息
      if (!server.password && !server.private_key) {
        throw new Error(`服务器 ${serverId} 缺少SSH认证信息（密码或私钥）`);
      }

      // 通过 SSH 连接获取容器统计信息
      const stats = await this.getContainerStatsViaSSH(server, containerId);
      return stats;
    } catch (error) {
      logger.error(`获取容器统计信息失败 (服务器 ${serverId}, 容器 ${containerId}):`, error);
      throw error;
    }
  }

  /**
   * 通过 SSH 获取容器统计信息
   * @param {Object} server - 服务器信息
   * @param {string} containerId - 容器 ID
   * @returns {Promise<Object>} 容器统计信息
   */
  async getContainerStatsViaSSH(server, containerId) {
    return new Promise(async (resolve, reject) => {
      try {
        const { Client } = await import('ssh2');
        const client = new Client();
        
        const timeout = setTimeout(() => {
          client.destroy();
          reject(new Error('SSH 连接超时'));
        }, 30000); // 30秒超时
        
        client.on('ready', () => {
          clearTimeout(timeout);
          
          // 获取容器统计信息
          const command = `docker stats --no-stream --format "table {{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}\t{{.PIDs}}" ${containerId}`;
          
          client.exec(command, (err, stream) => {
            if (err) {
              client.end();
              reject(err);
              return;
            }
            
            let output = '';
            stream.on('close', (code) => {
              client.end();
              
              if (code === 0) {
                const stats = this.parseContainerStatsOutput(output);
                resolve(stats);
              } else {
                reject(new Error(`Docker stats 命令执行失败，退出码: ${code}`));
              }
            });
            
            stream.on('data', (data) => {
              output += data.toString();
            });
            
            stream.stderr.on('data', (data) => {
              // 记录错误输出但不中断
              logger.debug('Docker stats 错误输出:', data.toString());
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
          port: server.ssh_port || 22,
          username: server.username || 'root',
          readyTimeout: 15000,
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
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 解析容器统计信息输出
   * @param {string} output - Docker stats 命令输出
   * @returns {Object} 解析后的统计信息
   */
  parseContainerStatsOutput(output) {
    const lines = output.trim().split('\n');
    
    if (lines.length < 2) {
      return null;
    }
    
    // 跳过标题行，获取数据行
    const dataLine = lines[1];
    const parts = dataLine.split('\t');
    
    if (parts.length < 6) {
      return null;
    }
    
    // 解析各个字段
    const cpuPercent = parseFloat(parts[0].replace('%', '')) || 0;
    const memUsage = parts[1] || '0B / 0B';
    const memPercent = parseFloat(parts[2].replace('%', '')) || 0;
    const netIO = parts[3] || '0B / 0B';
    const blockIO = parts[4] || '0B / 0B';
    const pids = parseInt(parts[5]) || 0;
    
    // 解析内存使用量
    const memParts = memUsage.split(' / ');
    const memUsed = memParts[0] || '0B';
    const memLimit = memParts[1] || '0B';
    
    // 解析网络IO
    const netParts = netIO.split(' / ');
    const netIn = netParts[0] || '0B';
    const netOut = netParts[1] || '0B';
    
    // 解析块IO
    const blockParts = blockIO.split(' / ');
    const blockIn = blockParts[0] || '0B';
    const blockOut = blockParts[1] || '0B';
    
    return {
      cpu_percent: cpuPercent,
      memory_usage: memUsed,
      memory_limit: memLimit,
      memory_percent: memPercent,
      network_in: netIn,
      network_out: netOut,
      block_in: blockIn,
      block_out: blockOut,
      pids: pids
    };
  }

  async logOperation(serverId, containerId, action, details) {
    try {
      await database.db.run(`
        INSERT INTO operation_logs (server_id, container_id, action, details, timestamp)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [serverId, containerId, action, details]);
    } catch (error) {
      logger.error('记录操作日志失败:', error);
    }
  }

}

export default new DockerService();
