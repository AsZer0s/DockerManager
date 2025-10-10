import logger from '../utils/logger.js';
import database from '../config/database.js';
import encryption from '../utils/encryption.js';
import dockerodeManager from './dockerodeManager.js';

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
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const containers = await docker.listContainers({ all });
      
      // 直接返回实时数据，不存储到数据库
      return containers.map(container => this.parseContainerInfo(container));
    } catch (error) {
      logger.error(`获取容器列表失败 (服务器 ${serverId}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 解析容器信息
   * @param {Object} container - Dockerode 容器对象
   * @returns {Object} 解析后的容器信息
   */
  parseContainerInfo(container) {
    return {
      id: container.Id,
      name: container.Names ? container.Names[0].replace('/', '') : 'unnamed',
      image: container.Image,
      status: container.Status,
      state: container.State,
      created: new Date(container.Created * 1000),
      ports: this.parsePorts(container.Ports),
      labels: container.Labels || {},
      command: container.Command,
      sizeRw: container.SizeRw || 0,
      sizeRootFs: container.SizeRootFs || 0,
      networks: container.NetworkSettings ? Object.keys(container.NetworkSettings.Networks || {}) : [],
      mounts: container.Mounts ? container.Mounts.map(mount => ({
        source: mount.Source,
        destination: mount.Destination,
        mode: mount.Mode,
        type: mount.Type
      })) : []
    };
  }

  /**
   * 解析端口信息
   * @param {Array} ports - Dockerode 端口数组
   * @returns {Array} 端口数组
   */
  parsePorts(ports) {
    if (!ports || !Array.isArray(ports)) return [];
    
    return ports.map(port => ({
      privatePort: port.PrivatePort,
      publicPort: port.PublicPort,
      type: port.Type,
      ip: port.IP || '0.0.0.0'
    }));
  }

  /**
   * 启动容器
   * @param {number} serverId - 服务器 ID
   * @param {string} containerId - 容器 ID
   * @returns {Promise<Object>} 操作结果
   */
  async startContainer(serverId, containerId) {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const container = docker.getContainer(containerId);
      await container.start();
      
      logger.info(`容器 ${containerId} 启动成功 (服务器 ${serverId})`);
      return { success: true, message: '容器启动成功' };
    } catch (error) {
      logger.error(`启动容器失败 (服务器 ${serverId}, 容器 ${containerId}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 停止容器
   * @param {number} serverId - 服务器 ID
   * @param {string} containerId - 容器 ID
   * @returns {Promise<Object>} 操作结果
   */
  async stopContainer(serverId, containerId) {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const container = docker.getContainer(containerId);
      await container.stop();
      
      logger.info(`容器 ${containerId} 停止成功 (服务器 ${serverId})`);
      return { success: true, message: '容器停止成功' };
    } catch (error) {
      logger.error(`停止容器失败 (服务器 ${serverId}, 容器 ${containerId}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 重启容器
   * @param {number} serverId - 服务器 ID
   * @param {string} containerId - 容器 ID
   * @returns {Promise<Object>} 操作结果
   */
  async restartContainer(serverId, containerId) {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const container = docker.getContainer(containerId);
      await container.restart();
      
      logger.info(`容器 ${containerId} 重启成功 (服务器 ${serverId})`);
      return { success: true, message: '容器重启成功' };
    } catch (error) {
      logger.error(`重启容器失败 (服务器 ${serverId}, 容器 ${containerId}):`, error);
      throw this.handleDockerError(error);
    }
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
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const container = docker.getContainer(containerId);
      await container.remove({ force, v: true });
      
      logger.info(`容器 ${containerId} 删除成功 (服务器 ${serverId})`);
      return { success: true, message: '容器删除成功' };
    } catch (error) {
      logger.error(`删除容器失败 (服务器 ${serverId}, 容器 ${containerId}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 获取容器日志
   * @param {number} serverId - 服务器 ID
   * @param {string} containerId - 容器 ID
   * @param {number} tail - 日志行数
   * @returns {Promise<string>} 容器日志
   */
  async getContainerLogs(serverId, containerId, tail = 100) {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const container = docker.getContainer(containerId);
      
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail,
        timestamps: true
      });
      
      return logs.toString();
    } catch (error) {
      logger.error(`获取容器日志失败 (服务器 ${serverId}, 容器 ${containerId}):`, error);
      throw this.handleDockerError(error);
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
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const container = docker.getContainer(containerId);
      const stats = await container.stats({ stream: false });
      
      return {
        cpu: this.calculateCPUPercent(stats),
        memory: {
          usage: stats.memory_stats.usage,
          limit: stats.memory_stats.limit,
          percent: stats.memory_stats.limit ? 
            (stats.memory_stats.usage / stats.memory_stats.limit) * 100 : 0
        },
        network: stats.networks,
        blockIO: stats.blkio_stats,
        pids: stats.pids_stats
      };
    } catch (error) {
      logger.error(`获取容器统计信息失败 (服务器 ${serverId}, 容器 ${containerId}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 计算CPU使用率
   * @param {Object} stats - Docker 统计信息
   * @returns {number} CPU使用率百分比
   */
  calculateCPUPercent(stats) {
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - 
                    (stats.precpu_stats.cpu_usage.total_usage || 0);
    const systemDelta = stats.cpu_stats.system_cpu_usage - 
                       (stats.precpu_stats.system_cpu_usage || 0);
    
    if (systemDelta > 0 && cpuDelta > 0) {
      return (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100.0;
    }
    return 0;
  }

  /**
   * 获取镜像列表
   * @param {number} serverId - 服务器 ID
   * @param {string} search - 搜索关键词
   * @returns {Promise<Array>} 镜像列表
   */
  async getImages(serverId, search = '') {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const images = await docker.listImages();
      
      let filteredImages = images.map(img => ({
        id: img.Id,
        imageId: img.Id,
        repository: img.RepoTags && img.RepoTags[0] ? 
          img.RepoTags[0].split(':')[0] : '<none>',
        tag: img.RepoTags && img.RepoTags[0] ? 
          img.RepoTags[0].split(':')[1] : '<none>',
        size: img.Size,
        created: new Date(img.Created * 1000),
        labels: img.Labels || {},
        virtualSize: img.VirtualSize
      }));

      // 应用搜索过滤
      if (search) {
        filteredImages = filteredImages.filter(img => 
          img.repository.toLowerCase().includes(search.toLowerCase()) ||
          img.tag.toLowerCase().includes(search.toLowerCase())
        );
      }

      return filteredImages;
    } catch (error) {
      logger.error(`获取镜像列表失败 (服务器 ${serverId}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 拉取镜像
   * @param {number} serverId - 服务器 ID
   * @param {string} imageName - 镜像名称
   * @param {string} tag - 镜像标签
   * @returns {Promise<Object>} 拉取结果
   */
  async pullImage(serverId, imageName, tag = 'latest') {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const fullName = `${imageName}:${tag}`;
      
      return new Promise((resolve, reject) => {
        docker.pull(fullName, (err, stream) => {
          if (err) {
            logger.error(`拉取镜像失败 (服务器 ${serverId}, 镜像 ${fullName}):`, err);
            return reject(err);
          }
          
          docker.modem.followProgress(stream, (err, output) => {
            if (err) {
              logger.error(`拉取镜像进度跟踪失败 (服务器 ${serverId}, 镜像 ${fullName}):`, err);
              return reject(err);
            }
            
            logger.info(`镜像拉取成功 (服务器 ${serverId}, 镜像 ${fullName})`);
            resolve({ success: true, message: '镜像拉取成功', data: output });
          });
        });
      });
    } catch (error) {
      logger.error(`拉取镜像失败 (服务器 ${serverId}, 镜像 ${imageName}:${tag}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 删除镜像
   * @param {number} serverId - 服务器 ID
   * @param {string} imageId - 镜像 ID
   * @param {boolean} force - 是否强制删除
   * @returns {Promise<Object>} 删除结果
   */
  async removeImage(serverId, imageId, force = false) {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const image = docker.getImage(imageId);
      await image.remove({ force });
      
      logger.info(`镜像 ${imageId} 删除成功 (服务器 ${serverId})`);
      return { success: true, message: '镜像删除成功' };
    } catch (error) {
      logger.error(`删除镜像失败 (服务器 ${serverId}, 镜像 ${imageId}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 修改镜像标签
   * @param {number} serverId - 服务器 ID
   * @param {string} imageId - 镜像 ID
   * @param {string} newTag - 新标签
   * @returns {Promise<Object>} 操作结果
   */
  async tagImage(serverId, imageId, newTag) {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const image = docker.getImage(imageId);
      
      // 解析新标签
      const [repo, tag] = newTag.includes(':') ? 
        newTag.split(':') : [newTag, 'latest'];
      
      await image.tag({ repo, tag });
      
      logger.info(`镜像 ${imageId} 标签修改成功 (服务器 ${serverId}, 新标签: ${newTag})`);
      return { success: true, message: '镜像标签修改成功' };
    } catch (error) {
      logger.error(`修改镜像标签失败 (服务器 ${serverId}, 镜像 ${imageId}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 获取镜像详细信息
   * @param {number} serverId - 服务器 ID
   * @param {string} imageId - 镜像 ID
   * @returns {Promise<Object>} 镜像详细信息
   */
  async getImageInfo(serverId, imageId) {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const image = docker.getImage(imageId);
      const info = await image.inspect();
      
      return {
        id: info.Id,
        architecture: info.Architecture,
        os: info.Os,
        created: new Date(info.Created),
        size: info.Size,
        virtualSize: info.VirtualSize,
        labels: info.Config.Labels || {},
        env: info.Config.Env || [],
        cmd: info.Config.Cmd,
        exposedPorts: info.Config.ExposedPorts || {},
        volumes: info.Config.Volumes || {},
        workingDir: info.Config.WorkingDir,
        user: info.Config.User
      };
    } catch (error) {
      logger.error(`获取镜像详细信息失败 (服务器 ${serverId}, 镜像 ${imageId}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 搜索镜像
   * @param {number} serverId - 服务器 ID
   * @param {string} term - 搜索关键词
   * @returns {Promise<Array>} 搜索结果
   */
  async searchImages(serverId, term) {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const images = await docker.listImages();
      
      return images.filter(img => {
        const repoTags = img.RepoTags || [];
        return repoTags.some(tag => 
          tag.toLowerCase().includes(term.toLowerCase())
        );
      }).map(img => ({
        id: img.Id,
        repository: img.RepoTags && img.RepoTags[0] ? 
          img.RepoTags[0].split(':')[0] : '<none>',
        tag: img.RepoTags && img.RepoTags[0] ? 
          img.RepoTags[0].split(':')[1] : '<none>',
        size: img.Size,
        created: new Date(img.Created * 1000)
      }));
    } catch (error) {
      logger.error(`搜索镜像失败 (服务器 ${serverId}, 关键词 ${term}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 处理Docker错误
   * @param {Error} error - 原始错误
   * @returns {Error} 处理后的错误
   */
  handleDockerError(error) {
    if (error.statusCode === 404) {
      return new Error('容器或镜像不存在');
    } else if (error.statusCode === 409) {
      return new Error('操作冲突 - 容器可能已经启动或停止');
    } else if (error.statusCode === 500) {
      return new Error('Docker守护进程错误');
    } else if (error.code === 'ECONNREFUSED') {
      return new Error('无法连接到Docker守护进程');
    } else if (error.code === 'ENOENT') {
      return new Error('Docker套接字文件不存在');
    }
    return error;
  }


  /**
   * 获取完整的服务器信息（包括解密后的密码和私钥）
   * @param {number} serverId - 服务器 ID
   * @returns {Promise<Object>} 服务器信息
   */
  async getFullServerInfo(serverId) {
    try {
      const result = await database.query(
        'SELECT * FROM servers WHERE id = ? AND is_active = 1',
        [serverId]
      );
      
      if (!result.rows || result.rows.length === 0) {
        return null;
      }
      
      const server = result.rows[0];
      
      // 解密密码和私钥
      if (server.password) {
        server.password = encryption.decrypt(server.password);
      }
      if (server.private_key) {
        server.private_key = encryption.decrypt(server.private_key);
      }
      
      return server;
    } catch (error) {
      logger.error(`获取服务器信息失败: ${serverId}`, error);
      throw error;
    }
  }

  // ==================== 网络管理方法 ====================

  /**
   * 获取网络列表
   * @param {number} serverId - 服务器 ID
   * @returns {Promise<Array>} 网络列表
   */
  async getNetworks(serverId) {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const networks = await docker.listNetworks();
      return networks.map(network => this.parseNetworkInfo(network));
    } catch (error) {
      logger.error(`获取网络列表失败 (服务器 ${serverId}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 获取网络详情
   * @param {number} serverId - 服务器 ID
   * @param {string} networkId - 网络 ID
   * @returns {Promise<Object>} 网络详情
   */
  async getNetworkInfo(serverId, networkId) {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const network = docker.getNetwork(networkId);
      const info = await network.inspect();
      return this.parseNetworkInfo(info);
    } catch (error) {
      logger.error(`获取网络详情失败 (服务器 ${serverId}, 网络 ${networkId}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 创建网络
   * @param {number} serverId - 服务器 ID
   * @param {Object} options - 网络选项
   * @returns {Promise<Object>} 创建结果
   */
  async createNetwork(serverId, options) {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const network = await docker.createNetwork(options);
      return {
        success: true,
        network: this.parseNetworkInfo(network)
      };
    } catch (error) {
      logger.error(`创建网络失败 (服务器 ${serverId}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 删除网络
   * @param {number} serverId - 服务器 ID
   * @param {string} networkId - 网络 ID
   * @returns {Promise<Object>} 删除结果
   */
  async removeNetwork(serverId, networkId) {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const network = docker.getNetwork(networkId);
      await network.remove();
      return { success: true };
    } catch (error) {
      logger.error(`删除网络失败 (服务器 ${serverId}, 网络 ${networkId}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 连接容器到网络
   * @param {number} serverId - 服务器 ID
   * @param {string} networkId - 网络 ID
   * @param {string} containerId - 容器 ID
   * @param {Object} options - 连接选项
   * @returns {Promise<Object>} 连接结果
   */
  async connectContainerToNetwork(serverId, networkId, containerId, options = {}) {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const network = docker.getNetwork(networkId);
      await network.connect({ Container: containerId, ...options });
      return { success: true };
    } catch (error) {
      logger.error(`连接容器到网络失败 (服务器 ${serverId}, 网络 ${networkId}, 容器 ${containerId}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 断开容器与网络的连接
   * @param {number} serverId - 服务器 ID
   * @param {string} networkId - 网络 ID
   * @param {string} containerId - 容器 ID
   * @returns {Promise<Object>} 断开结果
   */
  async disconnectContainerFromNetwork(serverId, networkId, containerId) {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const network = docker.getNetwork(networkId);
      await network.disconnect({ Container: containerId });
      return { success: true };
    } catch (error) {
      logger.error(`断开容器与网络连接失败 (服务器 ${serverId}, 网络 ${networkId}, 容器 ${containerId}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 清理未使用的网络
   * @param {number} serverId - 服务器 ID
   * @returns {Promise<Object>} 清理结果
   */
  async pruneNetworks(serverId) {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const result = await docker.pruneNetworks();
      return {
        success: true,
        networksDeleted: result.NetworksDeleted || []
      };
    } catch (error) {
      logger.error(`清理未使用网络失败 (服务器 ${serverId}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 解析网络信息
   * @param {Object} network - Dockerode 网络对象
   * @returns {Object} 解析后的网络信息
   */
  parseNetworkInfo(network) {
    // 确保Containers字段正确处理
    let containers = {};
    if (network.Containers && typeof network.Containers === 'object') {
      containers = network.Containers;
    }
    
    return {
      Id: network.Id,
      Name: network.Name,
      Driver: network.Driver,
      Scope: network.Scope,
      IPAM: network.IPAM,
      Containers: containers,
      Created: network.Created,
      Internal: network.Internal || false,
      Attachable: network.Attachable || false,
      Ingress: network.Ingress || false,
      Labels: network.Labels || {}
    };
  }

  // ==================== 卷管理方法 ====================

  /**
   * 获取卷列表
   * @param {number} serverId - 服务器 ID
   * @returns {Promise<Array>} 卷列表
   */
  async getVolumes(serverId) {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const volumes = await docker.listVolumes();
      return volumes.Volumes.map(volume => this.parseVolumeInfo(volume));
    } catch (error) {
      logger.error(`获取卷列表失败 (服务器 ${serverId}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 获取卷详情
   * @param {number} serverId - 服务器 ID
   * @param {string} volumeName - 卷名称
   * @returns {Promise<Object>} 卷详情
   */
  async getVolumeInfo(serverId, volumeName) {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const volume = docker.getVolume(volumeName);
      const info = await volume.inspect();
      return this.parseVolumeInfo(info);
    } catch (error) {
      logger.error(`获取卷详情失败 (服务器 ${serverId}, 卷 ${volumeName}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 创建卷
   * @param {number} serverId - 服务器 ID
   * @param {Object} options - 卷选项
   * @returns {Promise<Object>} 创建结果
   */
  async createVolume(serverId, options) {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const volume = await docker.createVolume(options);
      return {
        success: true,
        volume: this.parseVolumeInfo(volume)
      };
    } catch (error) {
      logger.error(`创建卷失败 (服务器 ${serverId}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 删除卷
   * @param {number} serverId - 服务器 ID
   * @param {string} volumeName - 卷名称
   * @param {boolean} force - 是否强制删除
   * @returns {Promise<Object>} 删除结果
   */
  async removeVolume(serverId, volumeName, force = false) {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const volume = docker.getVolume(volumeName);
      await volume.remove({ force });
      return { success: true };
    } catch (error) {
      logger.error(`删除卷失败 (服务器 ${serverId}, 卷 ${volumeName}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 清理未使用的卷
   * @param {number} serverId - 服务器 ID
   * @returns {Promise<Object>} 清理结果
   */
  async pruneVolumes(serverId) {
    try {
      const docker = await dockerodeManager.getDockerConnection(serverId);
      const result = await docker.pruneVolumes();
      return {
        success: true,
        volumesDeleted: result.VolumesDeleted || []
      };
    } catch (error) {
      logger.error(`清理未使用卷失败 (服务器 ${serverId}):`, error);
      throw this.handleDockerError(error);
    }
  }

  /**
   * 解析卷信息
   * @param {Object} volume - Dockerode 卷对象
   * @returns {Object} 解析后的卷信息
   */
  parseVolumeInfo(volume) {
    return {
      Name: volume.Name,
      Driver: volume.Driver,
      Mountpoint: volume.Mountpoint,
      CreatedAt: volume.CreatedAt,
      Labels: volume.Labels || {},
      Scope: volume.Scope,
      Options: volume.Options || {},
      UsageData: volume.UsageData
    };
  }
}

export default new DockerService();