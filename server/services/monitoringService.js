import si from 'systeminformation';
import logger from '../utils/logger.js';
import database from '../config/database.js';
import dockerService from './dockerService.js';
import encryption from '../utils/encryption.js';

class MonitoringService {
  constructor() {
    this.isRunning = false;
    this.intervals = new Map(); // 存储每个服务器的监控间隔
    this.monitoringInterval = parseInt(process.env.MONITORING_INTERVAL) || 5000; // 5秒
  }

  /**
   * 启动监控服务
   */
  async start() {
    if (this.isRunning) {
      logger.warn('监控服务已在运行');
      return;
    }

    try {
      // 确保数据库连接
      await database.connect();
      
      // 确保加密工具已初始化
      if (!encryption.key) {
        encryption.initialize();
      }
      
      this.isRunning = true;
      logger.info('监控服务已启动');

      // 立即执行一次监控
      await this.collectAllServerData();

      // 设置定期监控
      this.mainInterval = setInterval(async () => {
        try {
          await this.collectAllServerData();
        } catch (error) {
          logger.error('定期监控数据收集失败:', error);
        }
      }, this.monitoringInterval);
    } catch (error) {
      logger.error('监控服务启动失败:', error);
      this.isRunning = false;
    }
  }

  /**
   * 停止监控服务
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // 清除主监控间隔
    if (this.mainInterval) {
      clearInterval(this.mainInterval);
      this.mainInterval = null;
    }

    // 清除所有服务器监控间隔
    for (const [serverId, interval] of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();

    logger.info('监控服务已停止');
  }

  /**
   * 收集所有服务器的监控数据
   */
  async collectAllServerData() {
    try {
      const servers = await this.getActiveServers();
      
      for (const server of servers) {
        // 并行收集每个服务器的数据
        this.collectServerData(server.id).catch(error => {
          logger.error(`收集服务器 ${server.id} 监控数据失败:`, error);
        });
      }
    } catch (error) {
      logger.error('收集所有服务器监控数据失败:', error);
    }
  }

  /**
   * 收集单个服务器的监控数据
   * @param {number} serverId - 服务器 ID
   */
  async collectServerData(serverId) {
    try {
      const server = await this.getServerInfo(serverId);
      if (!server) {
        logger.warn(`[HealthCheck] 服务器 ${serverId} 不存在或未激活`);
        return;
      }

      // 检查服务器连接状态
      const isOnline = await this.checkServerConnection(serverId);
      
      if (!isOnline) {
        logger.warn(`[HealthCheck] 服务器 ${server.name} 离线，跳过数据收集`);
        // 离线服务器不收集数据，直接返回
        return;
      }

      // 收集系统监控数据
      const systemData = await this.collectSystemData(serverId);
      if (systemData) {
        await this.saveSystemMonitoringData(serverId, systemData);
      }

      // 收集容器监控数据
      const containerData = await this.collectContainerData(serverId);
      for (const data of containerData) {
        await this.saveContainerMonitoringData(data.containerId, data.metrics);
      }

    } catch (error) {
      logger.error(`[HealthCheck] 收集服务器 ${serverId} 监控数据时出错:`, error);
    }
  }

  /**
   * 收集系统监控数据
   * @param {number} serverId - 服务器 ID
   * @returns {Promise<Object>} 系统监控数据
   */
  async collectSystemData(serverId) {
    try {
      // 这里需要根据服务器类型收集数据
      // 对于本地服务器，直接使用 systeminformation
      // 对于远程服务器，需要通过 SSH 或其他方式收集
      
      const server = await this.getServerInfo(serverId);
      if (!server) {
        return null;
      }
      
      // 再次检查服务器连接状态，确保不会对离线服务器执行SSH命令
      const isOnline = await this.checkServerConnection(serverId);
      if (!isOnline) {
        return null;
      }
      
      if (server.host === 'localhost' || server.host === '127.0.0.1') {
        return await this.collectLocalSystemData();
      } else {
        return await this.collectRemoteSystemData(server);
      }
    } catch (error) {
      logger.error(`收集系统数据失败 (服务器 ${serverId}):`, error);
      return null;
    }
  }

  /**
   * 收集本地系统数据
   * @returns {Promise<Object>} 系统数据
   */
  async collectLocalSystemData() {
    try {
      const [
        cpu,
        memory,
        disk,
        network,
        load
      ] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.networkStats(),
        si.currentLoad()
      ]);

      return {
        cpu_usage: Math.round(cpu.currentLoad),
        memory_usage: Math.round((memory.used / memory.total) * 100),
        memory_total: memory.total,
        memory_used: memory.used,
        disk_usage: Math.round((disk[0]?.used / disk[0]?.size) * 100),
        disk_total: disk[0]?.size || 0,
        disk_used: disk[0]?.used || 0,
        network_in: network[0]?.rx_sec || 0,
        network_out: network[0]?.tx_sec || 0,
        load_average: load.avgLoad,
        uptime: Math.floor(process.uptime())
      };
    } catch (error) {
      logger.error('收集本地系统数据失败:', error);
      return null;
    }
  }

  /**
   * 收集远程系统数据
   * @param {Object} server - 服务器信息
   * @returns {Promise<Object>} 系统数据
   */
  async collectRemoteSystemData(server) {
    try {
      // 通过 SSH 连接到远程服务器收集数据
      const { Client } = await import('ssh2');
      const client = new Client();
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.destroy();
          resolve(null); // 超时时返回null，而不是reject
        }, 10000);
        
        client.on('ready', () => {
          clearTimeout(timeout);
          
          // 执行多个系统命令获取监控数据
          const commands = [
            'uptime -p', // 获取运行时间
            'cat /proc/loadavg | cut -d" " -f1-3', // 获取负载平均值
            'free | grep Mem | awk \'{print $3/$2 * 100.0}\'', // 获取内存使用率
            'free | grep Mem | awk \'{print $2}\'', // 获取内存总量（KB）
            'free | grep Mem | awk \'{print $3}\'', // 获取内存使用量（KB）
            'df / | tail -1 | awk \'{print $5}\' | sed \'s/%//\'', // 获取磁盘使用率
            'df / | tail -1 | awk \'{print $2}\'', // 获取磁盘总量（KB）
            'df / | tail -1 | awk \'{print $3}\'', // 获取磁盘使用量（KB）
            'cat /proc/stat | head -1 | awk \'{print ($2+$4)*100/($2+$3+$4+$5)}\'', // 获取CPU使用率
            'IF=$(ip -o -4 route show to default | awk \'{print $5}\'); RX1=$(awk -v i=$IF \'$1 ~ i":" {gsub(":","",$1); print $2}\' /proc/net/dev); TX1=$(awk -v i=$IF \'$1 ~ i":" {gsub(":","",$1); print $10}\' /proc/net/dev); sleep 1; RX2=$(awk -v i=$IF \'$1 ~ i":" {gsub(":","",$1); print $2}\' /proc/net/dev); TX2=$(awk -v i=$IF \'$1 ~ i":" {gsub(":","",$1); print $10}\' /proc/net/dev); echo "$(((RX2-RX1)/1024)) $(((TX2-TX1)/1024))"', // 获取实时网络速度（KB/s）
            'cat /proc/uptime | cut -d" " -f1' // 获取系统运行时间（秒）
          ];
          
          let completedCommands = 0;
          const results = {};
          
          commands.forEach((command, index) => {
            client.exec(command, (err, stream) => {
              if (err) {
                results[index] = null;
                completedCommands++;
                if (completedCommands === commands.length) {
                  client.end();
                  resolve(this.processSystemData(results));
                }
                return;
              }
              
              let output = '';
              stream.on('data', (data) => {
                output += data.toString();
              });
              
              stream.on('close', () => {
                results[index] = output.trim();
                completedCommands++;
                if (completedCommands === commands.length) {
                  client.end();
                  resolve(this.processSystemData(results));
                }
              });
            });
          });
        });
        
        client.on('error', (err) => {
          clearTimeout(timeout);
          resolve(null); // 连接失败时返回null，而不是reject
        });
        
        // 连接配置
        const connectConfig = {
          host: server.host,
          port: server.ssh_port || 22,
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
    } catch (error) {
      logger.error(`收集远程系统数据失败 (服务器 ${server.name}):`, error);
      return null;
    }
  }

  /**
   * 处理系统命令输出数据
   * @param {Object} results - 命令执行结果
   * @returns {Object} 处理后的系统数据
   */
  processSystemData(results) {
    try {
      // 解析运行时间 (uptime -p 输出)
      const uptimeOutput = results[0] || '';
      const uptimeSeconds = this.parseUptimeToSeconds(uptimeOutput);
      
      // 解析负载平均值
      const loadAvgOutput = results[1] || '';
      const loadAvg = loadAvgOutput ? parseFloat(loadAvgOutput.split(' ')[0]) : 0;
      
      // 解析内存使用率
      const memoryUsage = results[2] ? parseFloat(results[2]) : 0;
      
      // 解析内存总量和使用量
      const memoryTotalKB = results[3] ? parseInt(results[3]) : 0;
      const memoryUsedKB = results[4] ? parseInt(results[4]) : 0;
      
      // 解析磁盘使用率
      const diskUsage = results[5] ? parseFloat(results[5]) : 0;
      
      // 解析磁盘总量和使用量
      const diskTotalKB = results[6] ? parseInt(results[6]) : 0;
      const diskUsedKB = results[7] ? parseInt(results[7]) : 0;
      
      // 解析CPU使用率
      const cpuUsage = results[8] ? parseFloat(results[8]) : 0;
      
      // 解析实时网络
      const networkOutput = results[9] || '';
      const networkParts = networkOutput.split(' ');
      const networkIn = networkParts[0] ? parseInt(networkParts[0]) : 0;
      const networkOut = networkParts[1] ? parseInt(networkParts[1]) : 0;
      
      return {
        cpu_usage: parseFloat(cpuUsage.toFixed(2)),
        memory_usage: parseFloat(memoryUsage.toFixed(2)),
        memory_total: memoryTotalKB * 1024,
        memory_used: memoryUsedKB * 1024,
        disk_usage: parseFloat(diskUsage.toFixed(2)),
        disk_total: diskTotalKB * 1024,
        disk_used: diskUsedKB * 1024,
        network_in: networkIn,
        network_out: networkOut,
        load_average: loadAvg,
        uptime: uptimeSeconds,
        uptime_formatted: uptimeOutput
      };
    } catch (error) {
      logger.error('处理系统数据失败:', error);
      return {
        cpu_usage: 0,
        memory_usage: 0,
        memory_total: 0,
        memory_used: 0,
        disk_usage: 0,
        disk_total: 0,
        disk_used: 0,
        network_in: 0,
        network_out: 0,
        load_average: 0,
        uptime: 0,
        uptime_formatted: 'N/A'
      };
    }
  }

  /**
   * 解析 uptime -p 输出并转换为秒数
   * @param {string} uptimeOutput - uptime -p 的输出
   * @returns {number} 运行时间（秒）
   */
  parseUptimeToSeconds(uptimeOutput) {
    try {
      if (!uptimeOutput || !uptimeOutput.includes('up')) {
        return 0;
      }

      let totalSeconds = 0;
      
      // 解析 "up 6 hours, 20 minutes" 格式
      const timeStr = uptimeOutput.replace('up ', '').trim();
      
      // 匹配各种时间单位
      const patterns = [
        { regex: /(\d+)\s+year/i, multiplier: 365 * 24 * 60 * 60 },
        { regex: /(\d+)\s+month/i, multiplier: 30 * 24 * 60 * 60 },
        { regex: /(\d+)\s+week/i, multiplier: 7 * 24 * 60 * 60 },
        { regex: /(\d+)\s+day/i, multiplier: 24 * 60 * 60 },
        { regex: /(\d+)\s+hour/i, multiplier: 60 * 60 },
        { regex: /(\d+)\s+minute/i, multiplier: 60 },
        { regex: /(\d+)\s+second/i, multiplier: 1 }
      ];
      
      patterns.forEach(pattern => {
        const match = timeStr.match(pattern.regex);
        if (match) {
          totalSeconds += parseInt(match[1]) * pattern.multiplier;
        }
      });
      
      return totalSeconds;
    } catch (error) {
      logger.error('解析运行时间失败:', error);
      return 0;
    }
  }

  /**
   * 收集容器监控数据
   * @param {number} serverId - 服务器 ID
   * @returns {Promise<Array>} 容器监控数据
   */
  async collectContainerData(serverId) {
    try {
      // 获取完整的服务器信息（包括解密后的密码和私钥）
      const server = await this.getFullServerInfo(serverId);
      if (!server) {
        logger.warn(`[HealthCheck] 无法获取服务器 ${serverId} 信息，跳过容器数据收集`);
        return [];
      }

      // 再次检查服务器连接状态，确保不会对离线服务器执行SSH命令
      const isOnline = await this.checkServerConnection(serverId);
      if (!isOnline) {
        return [];
      }

      // 通过 SSH 连接收集容器数据
      const containerData = await this.collectContainerDataViaSSH(server);
      return containerData;
    } catch (error) {
      logger.error(`收集容器监控数据失败 (服务器 ${serverId}):`, error);
      return [];
    }
  }

  /**
   * 通过 SSH 收集容器监控数据
   * @param {Object} server - 服务器信息
   * @returns {Promise<Array>} 容器监控数据
   */
  async collectContainerDataViaSSH(server) {
    return new Promise(async (resolve) => {
      try {
        const { Client } = await import('ssh2');
        const client = new Client();
        
        const timeout = setTimeout(() => {
          client.destroy();
          resolve([]);
        }, 10000); // 10秒超时
        
        client.on('ready', () => {
          clearTimeout(timeout);
          
          // 执行 docker stats 命令获取容器监控数据
          client.exec('docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"', (err, stream) => {
            if (err) {
              client.end();
              resolve([]);
              return;
            }
            
            let output = '';
            stream.on('close', (code) => {
              client.end();
              
              if (code === 0) {
                const containerData = this.parseDockerStatsOutput(output);
                resolve(containerData);
              } else {
                resolve([]);
              }
            });
            
            stream.on('data', (data) => {
              output += data.toString();
            });
            
            stream.stderr.on('data', (data) => {
              // 忽略错误输出
            });
          });
        });
        
        client.on('error', () => {
          clearTimeout(timeout);
          resolve([]);
        });
        
        // 连接配置
        const connectConfig = {
          host: server.host,
          port: server.ssh_port || 22,
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
      } catch (error) {
        resolve([]);
      }
    });
  }

  /**
   * 解析 docker stats 输出
   * @param {string} output - docker stats 命令输出
   * @returns {Array} 容器监控数据
   */
  parseDockerStatsOutput(output) {
    const lines = output.trim().split('\n');
    const containerData = [];
    
    // 跳过标题行
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = line.split('\t');
      if (parts.length >= 5) {
        const containerId = parts[0];
        const cpuPerc = parseFloat(parts[1].replace('%', '')) || 0;
        const memUsage = parts[2];
        const netIO = parts[3];
        const blockIO = parts[4];
        
        // 解析内存使用情况 (例如: "1.2GiB / 2GiB")
        const memParts = memUsage.split(' / ');
        const memUsed = this.parseMemorySize(memParts[0] || '0B');
        const memLimit = this.parseMemorySize(memParts[1] || '0B');
        
        // 解析网络IO (例如: "1.2MB / 2.3MB")
        const netParts = netIO.split(' / ');
        const netIn = this.parseSize(netParts[0] || '0B');
        const netOut = this.parseSize(netParts[1] || '0B');
        
        // 解析块IO (例如: "1.2MB / 2.3MB")
        const blockParts = blockIO.split(' / ');
        const blockIn = this.parseSize(blockParts[0] || '0B');
        const blockOut = this.parseSize(blockParts[1] || '0B');
        
        containerData.push({
          containerId: containerId,
          metrics: {
            cpu_usage: cpuPerc,
            memory_usage: memUsed,
            memory_limit: memLimit,
            network_in: netIn,
            network_out: netOut,
            block_in: blockIn,
            block_out: blockOut
          }
        });
      }
    }
    
    return containerData;
  }

  /**
   * 解析内存大小字符串
   * @param {string} sizeStr - 大小字符串 (例如: "1.2GiB", "500MiB")
   * @returns {number} 字节数
   */
  parseMemorySize(sizeStr) {
    return this.parseSize(sizeStr);
  }

  /**
   * 解析大小字符串
   * @param {string} sizeStr - 大小字符串 (例如: "1.2MB", "500KB")
   * @returns {number} 字节数
   */
  parseSize(sizeStr) {
    const sizeStrLower = sizeStr.toLowerCase().trim();
    const match = sizeStrLower.match(/^([\d.]+)\s*(b|kb|mb|gb|tb|kib|mib|gib|tib)$/);
    
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = match[2];
    
    const multipliers = {
      'b': 1,
      'kb': 1000,
      'mb': 1000 * 1000,
      'gb': 1000 * 1000 * 1000,
      'tb': 1000 * 1000 * 1000 * 1000,
      'kib': 1024,
      'mib': 1024 * 1024,
      'gib': 1024 * 1024 * 1024,
      'tib': 1024 * 1024 * 1024 * 1024
    };
    
    return Math.floor(value * (multipliers[unit] || 1));
  }

  /**
   * 检查服务器连接状态
   * @param {number} serverId - 服务器 ID
   * @returns {Promise<boolean>} 连接状态
   */
  async checkServerConnection(serverId) {
    try {
      // 获取完整的服务器信息（包括解密后的密码和私钥）
      const server = await this.getFullServerInfo(serverId);
      if (!server) {
        return false;
      }
      
      // 通过 SSH 连接检查服务器状态
      const isOnline = await this.checkServerViaSSH(server);
      return isOnline;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取完整的服务器信息（包括解密后的敏感信息）
   * @param {number} serverId - 服务器 ID
   * @returns {Promise<Object>} 服务器信息
   */
  async getFullServerInfo(serverId) {
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
      try {
        if (server.password_encrypted) {
          server.password = encryption.decrypt(server.password_encrypted);
        }
        if (server.private_key_encrypted) {
          server.private_key = encryption.decrypt(server.private_key_encrypted);
        }
      } catch (error) {
        logger.warn(`解密服务器 ${serverId} 认证信息失败: ${error.message}`);
        // 如果解密失败，返回 null 表示无法获取服务器信息
        return null;
      }
      
      return server;
    } catch (error) {
      logger.error(`获取服务器 ${serverId} 完整信息失败:`, error);
      return null;
    }
  }

  /**
   * 通过 SSH 检查服务器状态
   * @param {Object} server - 服务器信息
   * @returns {Promise<boolean>} 连接状态
   */
  async checkServerViaSSH(server) {
    try {
      // 使用SSH连接池检查服务器状态
      const sshConnectionPool = (await import('./sshConnectionPool.js')).default;
      return await sshConnectionPool.checkServerStatus(server.id);
    } catch (error) {
      logger.error(`SSH连接检查失败: ${server.host}`, error);
      return false;
    }
  }

  /**
   * 保存系统监控数据
   * @param {number} serverId - 服务器 ID
   * @param {Object} data - 监控数据
   */
  async saveSystemMonitoringData(serverId, data) {
    try {
      await database.db.run(`
        INSERT INTO server_monitoring (
          server_id, cpu_usage, memory_usage, memory_total, memory_used,
          disk_usage, disk_total, disk_used, network_in, network_out,
          load_average, uptime, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        serverId, data.cpu_usage, data.memory_usage, data.memory_total, data.memory_used,
        data.disk_usage, data.disk_total, data.disk_used, data.network_in, data.network_out,
        data.load_average, data.uptime
      ]);
    } catch (error) {
      logger.error('保存系统监控数据失败:', error);
    }
  }

  /**
   * 保存容器监控数据
   * @param {string} containerId - 容器 ID
   * @param {Object} data - 监控数据
   */
  async saveContainerMonitoringData(containerId, data) {
    try {
      // 首先获取容器在数据库中的 ID
      const containerResult = await database.db.get(
        'SELECT id FROM containers WHERE container_id = ?',
        [containerId]
      );

      if (!containerResult) {
        logger.warn(`容器 ${containerId} 在数据库中不存在`);
        return;
      }

      const dbContainerId = containerResult.id;

      await database.db.run(`
        INSERT INTO container_monitoring (
          container_id, cpu_usage, memory_usage, memory_limit,
          network_in, network_out, block_in, block_out, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        dbContainerId, data.cpu_usage, data.memory_usage, data.memory_limit,
        data.network_in, data.network_out, data.block_in, data.block_out
      ]);
    } catch (error) {
      logger.error('保存容器监控数据失败:', error);
    }
  }

  /**
   * 获取活跃的服务器列表
   * @returns {Promise<Array>} 服务器列表
   */
  async getActiveServers() {
    const result = await database.db.all(
      'SELECT id, name, host FROM servers WHERE is_active = 1'
    );
    return result;
  }

  /**
   * 获取服务器信息
   * @param {number} serverId - 服务器 ID
   * @returns {Promise<Object>} 服务器信息
   */
  async getServerInfo(serverId) {
    const result = await database.db.get(
      'SELECT * FROM servers WHERE id = ? AND is_active = 1',
      [serverId]
    );
    
    if (!result) {
      return null;
    }
    
    const server = result;
    
    // 解密密码和私钥
    try {
      if (server.password_encrypted) {
        server.password = encryption.decrypt(server.password_encrypted);
      }
      if (server.private_key_encrypted) {
        server.private_key = encryption.decrypt(server.private_key_encrypted);
      }
    } catch (error) {
      logger.error(`解密服务器认证信息失败 (服务器 ${serverId}):`, error);
    }
    
    return server;
  }

  /**
   * 获取历史监控数据
   * @param {number} serverId - 服务器 ID
   * @param {string} type - 数据类型 (server/container)
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 监控数据
   */
  async getHistoricalData(serverId, type, options = {}) {
    const {
      timeRange = '24h',
      interval = '5m',
      containerId = null
    } = options;

    try {
      let query;
      let params = [serverId];

      // 计算时间范围
      const timeRangeMs = this.parseTimeRange(timeRange);
      const startTime = new Date(Date.now() - timeRangeMs);

      if (type === 'server') {
        query = `
          SELECT * FROM server_monitoring 
          WHERE server_id = ? AND timestamp >= ?
          ORDER BY timestamp ASC
        `;
        params.push(startTime);
      } else if (type === 'container' && containerId) {
        query = `
          SELECT cm.* FROM container_monitoring cm
          JOIN containers c ON cm.container_id = c.id
          WHERE c.server_id = ? AND c.container_id = ? AND cm.timestamp >= ?
          ORDER BY cm.timestamp ASC
        `;
        params.push(containerId, startTime);
      } else {
        throw new Error('无效的查询类型或缺少容器 ID');
      }

      const result = await database.db.all(query, params);
      return result;
    } catch (error) {
      logger.error('获取历史监控数据失败:', error);
      throw error;
    }
  }

  /**
   * 解析时间范围
   * @param {string} timeRange - 时间范围字符串
   * @returns {number} 毫秒数
   */
  parseTimeRange(timeRange) {
    const ranges = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    
    return ranges[timeRange] || ranges['24h'];
  }

  /**
   * 清理旧的监控数据
   * @param {number} retentionDays - 保留天数
   */
  async cleanupOldData(retentionDays = 30) {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      
      // 清理服务器监控数据
      await database.db.run(
        'DELETE FROM server_monitoring WHERE timestamp < ?',
        [cutoffDate]
      );
      
      // 清理容器监控数据
      await database.db.run(
        'DELETE FROM container_monitoring WHERE timestamp < ?',
        [cutoffDate]
      );
      
      logger.info(`清理了 ${retentionDays} 天前的监控数据`);
    } catch (error) {
      logger.error('清理旧监控数据失败:', error);
    }
  }

  /**
   * 获取监控服务状态
   * @returns {Object} 服务状态
   */
  /**
   * 获取服务器最新性能数据
   * @param {number} serverId - 服务器ID
   * @returns {Promise<Object|null>} 最新性能数据
   */
  async getLatestServerStats(serverId) {
    try {
      const result = await database.db.get(`
        SELECT * FROM server_monitoring 
        WHERE server_id = ? 
        ORDER BY timestamp DESC 
        LIMIT 1
      `, [serverId]);
      
      if (!result) {
        return null;
      }
      
      return {
        cpu_usage: result.cpu_usage || 0,
        memory_usage: result.memory_usage || 0,
        memory_total: result.memory_total || 0,
        memory_used: result.memory_used || 0,
        disk_usage: result.disk_usage || 0,
        disk_total: result.disk_total || 0,
        disk_used: result.disk_used || 0,
        network_in: result.network_in || 0,
        network_out: result.network_out || 0,
        timestamp: result.timestamp
      };
    } catch (error) {
      logger.error(`获取服务器 ${serverId} 最新性能数据失败:`, error);
      return null;
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      monitoringInterval: this.monitoringInterval,
      activeServers: this.intervals.size
    };
  }
}

export default new MonitoringService();
