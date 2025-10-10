import Docker from 'dockerode';
import { Client } from 'ssh2';
import net from 'net';
import fs from 'fs';
import logger from '../utils/logger.js';
import database from '../config/database.js';
import encryption from '../utils/encryption.js';
import sshConnectionPool from './sshConnectionPool.js';

class DockerodeManager {
  constructor() {
    this.connections = new Map(); // serverId -> { docker, tunnel, server, socketPath }
    this.isInitialized = false;
    this.healthCheckInterval = null;
  }

  /**
   * Initialize the Dockerode manager
   */
  initialize() {
    if (this.isInitialized) return;
    
    this.startHealthCheckTimer();
    this.isInitialized = true;
    logger.info('Dockerode manager initialized');
  }

  /**
   * Get or create Dockerode connection
   * @param {number} serverId - Server ID
   * @returns {Promise<Docker>} Dockerode instance
   */
  async getDockerConnection(serverId) {
    try {
      if (this.connections.has(serverId)) {
        return this.connections.get(serverId).docker;
      }
      
      const server = await this.getServerInfo(serverId);
      
      if (this.isLocalhost(server.host)) {
        return this.createLocalConnection(serverId);
      } else {
        return this.createRemoteConnection(server);
      }
    } catch (error) {
      logger.error(`获取Docker连接失败 (服务器 ${serverId}):`, error);
      throw error;
    }
  }

  /**
   * Create local Unix socket connection
   * @param {number} serverId - Server ID
   * @returns {Docker} Dockerode instance
   */
  createLocalConnection(serverId) {
    const docker = new Docker({ 
      socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock' 
    });
    
    this.connections.set(serverId, { 
      docker, 
      tunnel: null, 
      server: null, 
      tcpServer: null 
    });
    
    logger.info(`Local Docker connection established for server ${serverId}`);
    return docker;
  }

  /**
   * Create TCP tunnel connection for remote server
   * @param {Object} server - Server information
   * @returns {Promise<Docker>} Dockerode instance
   */
  async createRemoteConnection(server) {
    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`尝试创建远程Docker连接 (服务器 ${server.id}, 尝试 ${attempt}/${maxRetries})`);
        
        // 获取SSH连接
        const sshClient = await sshConnectionPool.getConnection(server.id);
        
        // 确保远程Docker可用（启动socat转发）
        const dockerAvailable = await this.ensureDockerAvailable(server, sshClient);
        if (!dockerAvailable) {
          throw new Error('Docker不可用');
        }
        
        // 创建TCP隧道
        const tunnelResult = await this.createTCPTunnel(server, sshClient);
        
        // 使用TCP隧道 - 获取TCP隧道实际监听的端口
        const tcpServer = tunnelResult.tcpServer;
        const localPort = tcpServer.address().port;
        const docker = new Docker({
          host: '127.0.0.1',
          port: localPort
        });
        
        this.connections.set(server.id, { 
          docker, 
          tunnel: tunnelResult.sshClient, 
          server, 
          tcpServer: tunnelResult.tcpServer,
          socketPath: null
        });
        
        logger.info(`Remote Docker TCP tunnel connection established for server ${server.id} via 127.0.0.1:${localPort}`);
        return docker;
        
      } catch (error) {
        lastError = error;
        logger.warn(`远程Docker连接尝试 ${attempt}/${maxRetries} 失败 (服务器 ${server.id}):`, error.message);
        
        // 清理失败的连接
        this.closeConnection(server.id);
        
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 指数退避，最大5秒
          logger.info(`等待 ${delay}ms 后重试 (服务器 ${server.id})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    logger.error(`远程Docker连接失败，已重试 ${maxRetries} 次 (服务器 ${server.id}):`, lastError);
    throw lastError;
  }

  /**
   * Ensure Docker is available via socat forwarding
   * @param {Object} server - Server information
   * @param {Client} client - SSH client
   * @returns {Promise<boolean>} - Whether Docker is available
   */
  async ensureDockerAvailable(server, client) {
    try {
      // 1. 首先测试Unix socket是否可用
      logger.info(`测试Unix socket可用性 (服务器 ${server.id}): /var/run/docker.sock`);
      const socketTest = await sshConnectionPool.executeSingleCommand(server.id, `curl --unix-socket /var/run/docker.sock http://localhost/version 2>/dev/null`);
      if (socketTest && socketTest.includes('Docker')) {
        logger.info(`Unix socket可用 (服务器 ${server.id}): /var/run/docker.sock`);
        // Unix socket可用，启动socat转发到随机大端口
        const remotePort = 23000 + Math.floor(Math.random() * 1000);
        logger.info(`启动socat转发 (服务器 ${server.id}): /var/run/docker.sock -> 127.0.0.1:${remotePort}`);
        await sshConnectionPool.executeSingleCommand(server.id, `sudo pkill -f "socat.*${remotePort}" 2>/dev/null || true`);
        await sshConnectionPool.executeSingleCommand(server.id, `sudo nohup socat TCP-LISTEN:${remotePort},bind=127.0.0.1,reuseaddr,fork,forever UNIX-CONNECT:/var/run/docker.sock >/dev/null 2>&1 &`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 验证socat转发是否成功
        const socatTest = await sshConnectionPool.executeSingleCommand(server.id, `curl -s http://127.0.0.1:${remotePort}/version 2>/dev/null`);
        if (socatTest && socatTest.includes('Docker')) {
          logger.info(`socat转发启动成功 (服务器 ${server.id}): /var/run/docker.sock -> 127.0.0.1:${remotePort}`);
          // 存储远程端口供TCP隧道使用
          this.connections.set(server.id, { ...this.connections.get(server.id), remotePort });
          return true;
        }
      }
    } catch (err) {
      logger.debug(`Unix socket测试失败 (服务器 ${server.id}):`, err.message);
    }

    try {
      // 2. 测试TCP端口是否可用（使用存储的远程端口）
      const conn = this.connections.get(server.id);
      if (conn && conn.remotePort) {
        logger.info(`测试Docker TCP端口 (服务器 ${server.id}): 127.0.0.1:${conn.remotePort}`);
        const tcpTest = await sshConnectionPool.executeSingleCommand(server.id, `curl -s http://127.0.0.1:${conn.remotePort}/version 2>/dev/null`);
        if (tcpTest && tcpTest.includes('Docker')) {
          logger.info(`Docker TCP端口可用 (服务器 ${server.id}): 127.0.0.1:${conn.remotePort}`);
          return true;
        }
      }
    } catch (err) {
      logger.debug(`Docker TCP端口测试失败 (服务器 ${server.id}):`, err.message);
    }

    try {
      // 3. 检查socat是否已安装（改进版本）
      logger.info(`检查socat是否已安装 (服务器 ${server.id})`);
      let socatInstalled = false;
      
      // 使用更简单的检查命令，避免超时
      try {
        const socatCheck = await sshConnectionPool.executeSingleCommand(server.id, `command -v socat`);
        if (socatCheck && socatCheck.trim()) {
          logger.info(`socat已安装 (服务器 ${server.id}): ${socatCheck.trim()}`);
          socatInstalled = true;
        }
      } catch (checkErr) {
        logger.debug(`socat检查失败 (服务器 ${server.id}):`, checkErr.message);
      }
      
      if (!socatInstalled) {
        logger.info(`开始安装socat (服务器 ${server.id})`);
        const installSuccess = await this.installSocat(server.id);
        if (!installSuccess) {
          logger.error(`socat安装失败 (服务器 ${server.id})`);
          return false;
        }
      }

      // 4. 启动socat转发（改进版本）
      const remotePort = 23000 + Math.floor(Math.random() * 1000);
      logger.info(`启动socat转发 (服务器 ${server.id}): /var/run/docker.sock -> 127.0.0.1:${remotePort}`);
      
      const socatStarted = await this.startSocatForward(server.id, remotePort);
      if (socatStarted) {
        // 存储远程端口供TCP隧道使用
        this.connections.set(server.id, { ...this.connections.get(server.id), remotePort });
        return true;
      } else {
        logger.error(`socat转发启动失败 (服务器 ${server.id})`);
        return false;
      }
    } catch (err) {
      logger.error(`socat转发启动失败 (服务器 ${server.id}):`, err);
    }

    return false;
  }

  /**
   * Create TCP tunnel for remote Docker connection
   * @param {Object} server - Server information
   * @param {Client} client - SSH client
   * @returns {Promise<{sshClient: Client, tcpServer: net.Server}>}
   */
  async createTCPTunnel(server, client) {
    return new Promise((resolve, reject) => {
      // 获取可用的本地端口
      const localPort = this.getNextAvailablePort(server.id);
      
      // 获取存储的远程端口
      const conn = this.connections.get(server.id);
      const remotePort = conn?.remotePort || 2375; // 默认端口作为备用
      
      logger.info(`创建TCP隧道 (服务器 ${server.id}): 127.0.0.1:${localPort} -> 127.0.0.1:${remotePort}`);
      
      // 创建TCP服务器，转发到远程端口
      const tcpServer = net.createServer((localSocket) => {
        // 检查SSH连接是否仍然活跃
        if (!client || (client._sock && client._sock.destroyed)) {
          logger.error(`SSH连接已断开 (服务器 ${server.id})`);
          localSocket.destroy();
          return;
        }

        try {
          client.forwardOut(
            '127.0.0.1',
            localPort,
            '127.0.0.1',
            remotePort, // 使用存储的远程端口
            (err, remoteSocket) => {
              if (err) {
                logger.error(`TCP转发失败 (服务器 ${server.id}):`, err);
                localSocket.destroy();
                return;
              }
              
              if (remoteSocket) {
                // 连接本地和远程socket
                localSocket.pipe(remoteSocket);
                remoteSocket.pipe(localSocket);
              } else {
                logger.error(`SSH forwardOut返回空socket (服务器 ${server.id})`);
                localSocket.destroy();
              }
            }
          );
        } catch (forwardErr) {
          logger.error(`SSH forwardOut调用失败 (服务器 ${server.id}):`, forwardErr);
          localSocket.destroy();
        }
      });
      
      tcpServer.listen(localPort, '127.0.0.1', (err) => {
        if (err) {
          logger.error(`TCP服务器启动失败 (服务器 ${server.id}):`, err);
          reject(err);
          return;
        }
        
        logger.info(`TCP隧道建立成功 (服务器 ${server.id}): 127.0.0.1:${localPort} -> 127.0.0.1:${remotePort}`);
        resolve({ sshClient: client, tcpServer });
      });
    });
  }

  /**
   * Start socat forwarding with improved error handling and retry mechanism
   * @param {number} serverId - Server ID
   * @param {number} remotePort - Remote port for socat to listen on
   * @returns {Promise<boolean>} - Whether socat started successfully
   */
  async startSocatForward(serverId, remotePort) {
    try {
      // 1. 清理旧进程
      logger.info(`清理旧的socat进程 (服务器 ${serverId})`);
      try {
        await sshConnectionPool.executeSingleCommand(serverId, `sudo pkill -f "socat.*${remotePort}" 2>/dev/null || true`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // 等待进程清理
      } catch (cleanErr) {
        logger.debug(`清理旧进程失败 (服务器 ${serverId}):`, cleanErr.message);
      }
      
      // 2. 启动socat（改进的命令）
      logger.info(`启动socat进程 (服务器 ${serverId}): 端口 ${remotePort}`);
      try {
        // 使用更简单的启动命令，避免复杂的shell操作
        const socatCmd = `sudo socat TCP-LISTEN:${remotePort},bind=127.0.0.1,reuseaddr,fork,forever UNIX-CONNECT:/var/run/docker.sock`;
        await sshConnectionPool.executeSingleCommand(serverId, `nohup ${socatCmd} >/dev/null 2>&1 &`);
      } catch (startErr) {
        // exitCode: null 是后台进程的正常现象
        if (startErr.message.includes('exitCode: null')) {
          logger.debug(`socat启动命令channel关闭（后台进程正常现象） (服务器 ${serverId}):`, startErr.message);
        } else {
          logger.warn(`socat启动命令异常 (服务器 ${serverId}):`, startErr.message);
        }
      }
      
      // 3. 等待socat启动
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 4. 验证socat是否成功启动（多次重试）
      logger.info(`验证socat启动状态 (服务器 ${serverId})`);
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          // 检查进程是否存在
          const processCheck = await sshConnectionPool.executeSingleCommand(serverId, `pgrep -f "socat.*${remotePort}" || echo "NOT_FOUND"`);
          if (processCheck && processCheck.includes('NOT_FOUND')) {
            logger.debug(`socat进程检查失败，尝试 ${attempt}/5 (服务器 ${serverId})`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          
          // 检查端口是否监听
          const portCheck = await sshConnectionPool.executeSingleCommand(serverId, `ss -lnpt | grep ":${remotePort}" || echo "NOT_LISTENING"`);
          if (portCheck && portCheck.includes('NOT_LISTENING')) {
            logger.debug(`端口监听检查失败，尝试 ${attempt}/5 (服务器 ${serverId})`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          
          // 测试Docker API
          const apiTest = await sshConnectionPool.executeSingleCommand(serverId, `curl -s --connect-timeout 5 http://127.0.0.1:${remotePort}/version 2>/dev/null`);
          if (apiTest && apiTest.includes('Docker')) {
            logger.info(`socat转发验证成功 (服务器 ${serverId}): /var/run/docker.sock -> 127.0.0.1:${remotePort} (尝试 ${attempt}/5)`);
            return true;
          }
          
          logger.debug(`Docker API测试失败，尝试 ${attempt}/5 (服务器 ${serverId})`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (verifyErr) {
          logger.debug(`socat验证尝试 ${attempt}/5 失败 (服务器 ${serverId}):`, verifyErr.message);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      logger.error(`socat转发启动失败，5次验证均未成功 (服务器 ${serverId})`);
      return false;
      
    } catch (err) {
      logger.error(`socat启动异常 (服务器 ${serverId}):`, err);
      return false;
    }
  }

  /**
   * Install socat on remote server with retry mechanism
   * @param {number} serverId - Server ID
   * @returns {Promise<boolean>} - Whether installation was successful
   */
  async installSocat(serverId) {
    // 根据系统信息自动检测包管理器
    const packageManagers = [
      { 
        name: 'apt', 
        commands: [
          'sudo apt update -y',
          'sudo apt install -y socat'
        ],
        checkCmd: 'which apt'
      },
      { 
        name: 'yum', 
        commands: [
          'sudo yum install -y socat'
        ],
        checkCmd: 'which yum'
      },
      { 
        name: 'dnf', 
        commands: [
          'sudo dnf install -y socat'
        ],
        checkCmd: 'which dnf'
      },
      { 
        name: 'zypper', 
        commands: [
          'sudo zypper install -y socat'
        ],
        checkCmd: 'which zypper'
      },
      { 
        name: 'pacman', 
        commands: [
          'sudo pacman -S --noconfirm socat'
        ],
        checkCmd: 'which pacman'
      }
    ];

    // 首先检测可用的包管理器
    let availablePM = null;
    for (const pm of packageManagers) {
      try {
        const checkResult = await sshConnectionPool.executeSingleCommand(serverId, pm.checkCmd);
        if (checkResult && checkResult.trim()) {
          logger.info(`检测到包管理器: ${pm.name} (服务器 ${serverId})`);
          availablePM = pm;
          break;
        }
      } catch (checkErr) {
        logger.debug(`包管理器 ${pm.name} 不可用 (服务器 ${serverId}):`, checkErr.message);
        continue;
      }
    }

    if (!availablePM) {
      logger.error(`未找到可用的包管理器 (服务器 ${serverId})`);
      return false;
    }

    // 使用检测到的包管理器安装socat
    try {
      logger.info(`使用 ${availablePM.name} 安装socat (服务器 ${serverId})`);
      
      // 执行安装命令（增加超时处理）
      for (const cmd of availablePM.commands) {
        try {
          await sshConnectionPool.executeSingleCommand(serverId, cmd);
        } catch (cmdErr) {
          // 对于update命令失败，继续尝试install
          if (cmd.includes('update') && (cmdErr.message.includes('exitCode: null') || cmdErr.message.includes('No response from server'))) {
            logger.debug(`${availablePM.name} update失败，继续尝试install (服务器 ${serverId}):`, cmdErr.message);
            continue;
          }
          throw cmdErr;
        }
      }
      
      // 验证安装是否成功
      await new Promise(resolve => setTimeout(resolve, 3000)); // 等待安装完成
      
      const verifyResult = await sshConnectionPool.executeSingleCommand(serverId, `command -v socat`);
      if (verifyResult && verifyResult.trim()) {
        logger.info(`socat安装成功 (服务器 ${serverId}): ${verifyResult.trim()}`);
        return true;
      }
      
    } catch (installErr) {
      logger.error(`${availablePM.name} 安装socat失败 (服务器 ${serverId}):`, installErr.message);
    }
    
    logger.error(`socat安装失败 (服务器 ${serverId})`);
    return false;
  }

  /**
   * Get next available port for TCP tunnel
   * @param {number} serverId - Server ID
   * @returns {number} Available port
   */
  getNextAvailablePort(serverId) {
    // 每次都生成新的随机端口，避免冲突
    const timestamp = Date.now() % 10000;
    const randomOffset = Math.floor(Math.random() * 100);
    const port = 23750 + (serverId * 100) + (timestamp % 100) + randomOffset;
    return port;
  }

  /**
   * Close connection and tunnel
   * @param {number} serverId - Server ID
   */
  async closeConnection(serverId) {
    const conn = this.connections.get(serverId);
    if (conn) {
      if (conn.tunnel) {
        conn.tunnel.end();
      }
      
      // 关闭TCP服务器
      if (conn.tcpServer) {
        conn.tcpServer.close();
        logger.info(`TCP服务器已关闭 (服务器 ${serverId})`);
      }
      
      // 清理Unix套接字文件（如果存在）
      if (conn.socketPath) {
        try {
          if (fs.existsSync(conn.socketPath)) {
            fs.unlinkSync(conn.socketPath);
            logger.info(`Unix socket文件已清理 (服务器 ${serverId}): ${conn.socketPath}`);
          }
        } catch (error) {
          logger.warn(`Failed to cleanup socket file ${conn.socketPath}:`, error);
        }
      }
      
      this.connections.delete(serverId);
      logger.info(`Docker connection closed for server ${serverId}`);
    }
  }


  /**
   * Check if host is localhost
   * @param {string} host - Host address
   * @returns {boolean} Is localhost
   */
  isLocalhost(host) {
    return host === 'localhost' || 
           host === '127.0.0.1' || 
           host === '::1' || 
           host === '0.0.0.0';
  }

  /**
   * Get server information from database
   * @param {number} serverId - Server ID
   * @returns {Promise<Object>} Server information
   */
  async getServerInfo(serverId) {
    try {
      if (!database.db) {
        throw new Error('数据库未连接');
      }
      
      const result = await database.db.get(
        'SELECT * FROM servers WHERE id = ? AND (is_active = 1 OR is_active = true)',
        [serverId]
      );
      
      if (!result) {
        throw new Error(`服务器 ${serverId} 不存在或未激活`);
      }
      
      return result;
    } catch (error) {
      logger.error(`获取服务器信息失败 (服务器 ${serverId}):`, error);
      throw error;
    }
  }

  /**
   * Health check for Docker connections
   * @param {number} serverId - Server ID
   * @returns {Promise<boolean>} Connection health
   */
  async healthCheck(serverId) {
    try {
      const docker = await this.getDockerConnection(serverId);
      await docker.ping();
      return true;
    } catch (error) {
      logger.error(`Docker connection health check failed for server ${serverId}:`, error);
      await this.closeConnection(serverId);
      return false;
    }
  }

  /**
   * Start periodic health checks
   */
  startHealthCheckTimer() {
    this.healthCheckInterval = setInterval(async () => {
      for (const [serverId] of this.connections) {
        await this.healthCheck(serverId);
      }
    }, 60000); // Every minute
  }

  /**
   * Stop health check timer
   */
  stopHealthCheckTimer() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Close all connections
   */
  async closeAllConnections() {
    const promises = [];
    for (const [serverId] of this.connections) {
      promises.push(this.closeConnection(serverId));
    }
    await Promise.all(promises);
    this.stopHealthCheckTimer();
    logger.info('All Docker connections closed');
  }

  /**
   * Get connection status for all servers
   * @returns {Object} Connection status map
   */
  getConnectionStatus() {
    const status = {};
    for (const [serverId, conn] of this.connections) {
      status[serverId] = {
        connected: !!conn.docker,
        hasTunnel: !!conn.tunnel,
        socketPath: conn.socketPath,
        server: conn.server ? {
          id: conn.server.id,
          host: conn.server.host,
          name: conn.server.name
        } : null
      };
    }
    return status;
  }
}

export default new DockerodeManager();
