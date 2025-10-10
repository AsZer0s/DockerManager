import logger from '../utils/logger.js';
import database from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class OrchestrationService {
  constructor() {
    this.tempDir = path.join(__dirname, '../temp');
    this.ensureTempDir();
  }

  /**
   * 确保临时目录存在
   */
  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * 部署Docker Compose项目
   * @param {number} serverId - 服务器 ID
   * @param {string} composeFile - Compose文件内容
   * @param {string} projectName - 项目名称
   * @returns {Promise<Object>} 部署结果
   */
  async deployCompose(serverId, composeFile, projectName) {
    try {
      const server = await this.getServerInfo(serverId);
      if (!server) {
        throw new Error(`服务器 ${serverId} 不存在或未激活`);
      }

      // 生成临时文件名
      const tempFileName = `docker-compose-${Date.now()}.yml`;
      const tempFilePath = path.join(this.tempDir, tempFileName);

      try {
        // 写入Compose文件到临时目录
        fs.writeFileSync(tempFilePath, composeFile);

        // 通过SSH上传文件并执行
        const sshConnectionPool = (await import('./sshConnectionPool.js')).default;
        
        // 上传Compose文件到服务器
        await this.uploadFileToServer(server, tempFilePath, `/tmp/${tempFileName}`);

        // 执行docker-compose命令
        const command = `cd /tmp && docker-compose -f ${tempFileName} -p ${projectName} up -d`;
        const output = await sshConnectionPool.executeCommand(serverId, command, 300000); // 5分钟超时

        // 获取创建的容器列表
        const containers = await this.getComposeContainers(serverId, projectName);

        // 清理临时文件
        this.cleanupTempFile(tempFilePath);

        return {
          success: true,
          message: `Compose项目 ${projectName} 部署成功`,
          output,
          containers,
          projectName
        };
      } catch (error) {
        // 确保清理临时文件
        this.cleanupTempFile(tempFilePath);
        throw error;
      }
    } catch (error) {
      logger.error(`部署Compose项目失败 (服务器 ${serverId}, 项目 ${projectName}):`, error);
      throw error;
    }
  }

  /**
   * 停止Compose项目
   * @param {number} serverId - 服务器 ID
   * @param {string} projectName - 项目名称
   * @returns {Promise<Object>} 停止结果
   */
  async stopCompose(serverId, projectName) {
    try {
      const server = await this.getServerInfo(serverId);
      if (!server) {
        throw new Error(`服务器 ${serverId} 不存在或未激活`);
      }

      const sshConnectionPool = (await import('./sshConnectionPool.js')).default;
      const command = `docker-compose -p ${projectName} stop`;
      const output = await sshConnectionPool.executeCommand(serverId, command, 120000); // 2分钟超时

      return {
        success: true,
        message: `Compose项目 ${projectName} 已停止`,
        output
      };
    } catch (error) {
      logger.error(`停止Compose项目失败 (服务器 ${serverId}, 项目 ${projectName}):`, error);
      throw error;
    }
  }

  /**
   * 删除Compose项目
   * @param {number} serverId - 服务器 ID
   * @param {string} projectName - 项目名称
   * @returns {Promise<Object>} 删除结果
   */
  async removeCompose(serverId, projectName) {
    try {
      const server = await this.getServerInfo(serverId);
      if (!server) {
        throw new Error(`服务器 ${serverId} 不存在或未激活`);
      }

      const sshConnectionPool = (await import('./sshConnectionPool.js')).default;
      const command = `docker-compose -p ${projectName} down -v`;
      const output = await sshConnectionPool.executeCommand(serverId, command, 300000); // 5分钟超时

      return {
        success: true,
        message: `Compose项目 ${projectName} 已删除`,
        output
      };
    } catch (error) {
      logger.error(`删除Compose项目失败 (服务器 ${serverId}, 项目 ${projectName}):`, error);
      throw error;
    }
  }

  /**
   * 获取Compose项目状态
   * @param {number} serverId - 服务器 ID
   * @param {string} projectName - 项目名称
   * @returns {Promise<Object>} 项目状态
   */
  async getComposeStatus(serverId, projectName) {
    try {
      const server = await this.getServerInfo(serverId);
      if (!server) {
        throw new Error(`服务器 ${serverId} 不存在或未激活`);
      }

      const sshConnectionPool = (await import('./sshConnectionPool.js')).default;
      
      // 获取项目容器状态
      const command = `docker-compose -p ${projectName} ps --format json`;
      const output = await sshConnectionPool.executeCommand(serverId, command, 30000);

      const containers = this.parseComposeStatus(output);
      
      return {
        projectName,
        containers,
        status: this.determineProjectStatus(containers)
      };
    } catch (error) {
      logger.error(`获取Compose项目状态失败 (服务器 ${serverId}, 项目 ${projectName}):`, error);
      throw error;
    }
  }

  /**
   * 检查服务依赖
   * @param {Array} containers - 容器配置数组
   * @returns {Promise<Object>} 依赖检查结果
   */
  async checkDependencies(containers) {
    try {
      const dependencyGraph = this.buildDependencyGraph(containers);
      const sortedServices = this.topologicalSort(dependencyGraph);
      
      return {
        valid: true,
        dependencyOrder: sortedServices,
        circularDependencies: this.findCircularDependencies(dependencyGraph)
      };
    } catch (error) {
      logger.error('检查服务依赖失败:', error);
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * 按依赖顺序部署服务
   * @param {number} serverId - 服务器 ID
   * @param {Array} services - 服务配置数组
   * @returns {Promise<Object>} 部署结果
   */
  async deployWithDependencies(serverId, services) {
    try {
      // 检查依赖关系
      const dependencyCheck = await this.checkDependencies(services);
      
      if (!dependencyCheck.valid) {
        throw new Error(`依赖检查失败: ${dependencyCheck.error}`);
      }

      if (dependencyCheck.circularDependencies.length > 0) {
        throw new Error(`发现循环依赖: ${dependencyCheck.circularDependencies.join(', ')}`);
      }

      const deploymentResults = [];
      const deploymentOrder = dependencyCheck.dependencyOrder;

      // 按依赖顺序部署服务
      for (const serviceName of deploymentOrder) {
        const service = services.find(s => s.name === serviceName);
        if (!service) continue;

        try {
          const result = await this.deploySingleService(serverId, service);
          deploymentResults.push({
            service: serviceName,
            success: true,
            result
          });
        } catch (error) {
          deploymentResults.push({
            service: serviceName,
            success: false,
            error: error.message
          });
          // 如果关键服务部署失败，停止后续部署
          if (service.critical) {
            break;
          }
        }
      }

      return {
        success: deploymentResults.every(r => r.success),
        results: deploymentResults,
        deployedServices: deploymentResults.filter(r => r.success).map(r => r.service)
      };
    } catch (error) {
      logger.error(`按依赖顺序部署服务失败 (服务器 ${serverId}):`, error);
      throw error;
    }
  }

  /**
   * 获取服务器信息
   * @param {number} serverId - 服务器 ID
   * @returns {Promise<Object>} 服务器信息
   */
  async getServerInfo(serverId) {
    try {
      const result = await database.query(
        'SELECT * FROM servers WHERE id = ? AND is_active = 1',
        [serverId]
      );
      
      if (!result.rows.length) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error(`获取服务器信息失败 (服务器 ${serverId}):`, error);
      throw error;
    }
  }

  /**
   * 上传文件到服务器
   * @param {Object} server - 服务器信息
   * @param {string} localPath - 本地文件路径
   * @param {string} remotePath - 远程文件路径
   */
  async uploadFileToServer(server, localPath, remotePath) {
    try {
      // 这里需要实现文件上传逻辑
      // 可以使用scp或sftp
      // 暂时使用简单的文件复制命令
      const sshConnectionPool = (await import('./sshConnectionPool.js')).default;
      
      // 读取文件内容并上传
      const fileContent = fs.readFileSync(localPath, 'utf8');
      const command = `cat > ${remotePath} << 'EOF'\n${fileContent}\nEOF`;
      
      await sshConnectionPool.executeCommand(server.id, command, 60000);
    } catch (error) {
      logger.error('上传文件到服务器失败:', error);
      throw error;
    }
  }

  /**
   * 获取Compose项目容器列表
   * @param {number} serverId - 服务器 ID
   * @param {string} projectName - 项目名称
   * @returns {Promise<Array>} 容器列表
   */
  async getComposeContainers(serverId, projectName) {
    try {
      const sshConnectionPool = (await import('./sshConnectionPool.js')).default;
      const command = `docker-compose -p ${projectName} ps -q`;
      const output = await sshConnectionPool.executeCommand(serverId, command, 30000);
      
      const containerIds = output.trim().split('\n').filter(id => id.trim());
      return containerIds;
    } catch (error) {
      logger.error(`获取Compose容器列表失败 (服务器 ${serverId}, 项目 ${projectName}):`, error);
      return [];
    }
  }

  /**
   * 解析Compose状态输出
   * @param {string} output - 状态输出
   * @returns {Array} 容器状态数组
   */
  parseComposeStatus(output) {
    try {
      const lines = output.trim().split('\n').filter(line => line.trim());
      return lines.map(line => {
        try {
          return JSON.parse(line);
        } catch (error) {
          return null;
        }
      }).filter(container => container !== null);
    } catch (error) {
      logger.error('解析Compose状态失败:', error);
      return [];
    }
  }

  /**
   * 确定项目状态
   * @param {Array} containers - 容器状态数组
   * @returns {string} 项目状态
   */
  determineProjectStatus(containers) {
    if (containers.length === 0) {
      return 'not_running';
    }

    const runningContainers = containers.filter(c => c.State === 'running');
    if (runningContainers.length === containers.length) {
      return 'running';
    } else if (runningContainers.length > 0) {
      return 'partial';
    } else {
      return 'stopped';
    }
  }

  /**
   * 构建依赖图
   * @param {Array} containers - 容器配置数组
   * @returns {Object} 依赖图
   */
  buildDependencyGraph(containers) {
    const graph = {};
    
    containers.forEach(container => {
      graph[container.name] = container.depends_on || [];
    });
    
    return graph;
  }

  /**
   * 拓扑排序
   * @param {Object} graph - 依赖图
   * @returns {Array} 排序后的服务列表
   */
  topologicalSort(graph) {
    const visited = new Set();
    const temp = new Set();
    const result = [];

    const visit = (node) => {
      if (temp.has(node)) {
        throw new Error(`发现循环依赖: ${node}`);
      }
      if (visited.has(node)) {
        return;
      }
      
      temp.add(node);
      
      const dependencies = graph[node] || [];
      dependencies.forEach(dep => visit(dep));
      
      temp.delete(node);
      visited.add(node);
      result.push(node);
    };

    Object.keys(graph).forEach(node => {
      if (!visited.has(node)) {
        visit(node);
      }
    });

    return result;
  }

  /**
   * 查找循环依赖
   * @param {Object} graph - 依赖图
   * @returns {Array} 循环依赖列表
   */
  findCircularDependencies(graph) {
    const cycles = [];
    const visited = new Set();
    const recursionStack = new Set();

    const dfs = (node, path) => {
      if (recursionStack.has(node)) {
        const cycleStart = path.indexOf(node);
        cycles.push(path.slice(cycleStart));
        return;
      }
      
      if (visited.has(node)) {
        return;
      }

      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const dependencies = graph[node] || [];
      dependencies.forEach(dep => dfs(dep, [...path]));

      recursionStack.delete(node);
    };

    Object.keys(graph).forEach(node => {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    });

    return cycles;
  }

  /**
   * 部署单个服务
   * @param {number} serverId - 服务器 ID
   * @param {Object} service - 服务配置
   * @returns {Promise<Object>} 部署结果
   */
  async deploySingleService(serverId, service) {
    try {
      const sshConnectionPool = (await import('./sshConnectionPool.js')).default;
      
      // 构建docker run命令
      let command = `docker run -d --name ${service.name}`;
      
      if (service.ports) {
        service.ports.forEach(port => {
          command += ` -p ${port}`;
        });
      }
      
      if (service.volumes) {
        service.volumes.forEach(volume => {
          command += ` -v ${volume}`;
        });
      }
      
      if (service.environment) {
        Object.entries(service.environment).forEach(([key, value]) => {
          command += ` -e ${key}=${value}`;
        });
      }
      
      if (service.restart) {
        command += ` --restart ${service.restart}`;
      }
      
      command += ` ${service.image}`;
      
      const output = await sshConnectionPool.executeCommand(serverId, command, 300000);
      
      return {
        success: true,
        service: service.name,
        output
      };
    } catch (error) {
      logger.error(`部署服务失败 (服务器 ${serverId}, 服务 ${service.name}):`, error);
      throw error;
    }
  }

  /**
   * 清理临时文件
   * @param {string} filePath - 文件路径
   */
  cleanupTempFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      logger.warn('清理临时文件失败:', error);
    }
  }
}

export default new OrchestrationService();
