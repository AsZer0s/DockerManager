import si from 'systeminformation';
import fs from 'fs';
import logger from '../utils/logger.js';

class NetworkMonitoringService {
  constructor() {
    this.isRunning = false;
    this.lastStats = new Map(); // 存储每个服务器的上次统计信息
    this.currentStats = new Map(); // 存储当前统计信息
    this.samplingInterval = 1000; // 1秒采样一次
    this.intervalId = null;
    
    // 配置参数
    this.config = {
      samplingInterval: parseInt(process.env.NETWORK_SAMPLING_INTERVAL) || 1000, // 采样间隔，毫秒
      useSystemInformation: process.env.USE_SYSTEM_INFORMATION === 'true' || true, // 是否使用systeminformation库
      useProcNetDev: process.env.USE_PROC_NET_DEV === 'true' || false, // 是否使用/proc/net/dev
      interfaceName: process.env.NETWORK_INTERFACE || 'eth0' // 网络接口名称
    };
  }

  /**
   * 启动网络监控服务
   */
  async start() {
    if (this.isRunning) {
      logger.warn('网络监控服务已在运行');
      return;
    }

    this.isRunning = true;
    this.samplingInterval = this.config.samplingInterval;
    
    logger.info(`启动网络监控服务，采样间隔: ${this.samplingInterval}ms`);
    
    // 开始定时采样
    this.intervalId = setInterval(async () => {
      await this.collectNetworkStats();
    }, this.samplingInterval);
  }

  /**
   * 停止网络监控服务
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    logger.info('网络监控服务已停止');
  }

  /**
   * 收集网络统计信息
   */
  async collectNetworkStats() {
    try {
      let stats;
      
      if (this.config.useSystemInformation) {
        stats = await this.collectStatsWithSystemInformation();
      } else if (this.config.useProcNetDev) {
        stats = await this.collectStatsWithProcNetDev();
      } else {
        stats = await this.collectStatsWithSystemInformation();
      }

      if (stats) {
        this.calculateNetworkSpeed(stats);
        this.currentStats.set('local', stats);
      }
    } catch (error) {
      logger.error('收集网络统计信息失败:', error);
    }
  }

  /**
   * 使用 systeminformation 收集网络统计信息
   */
  async collectStatsWithSystemInformation() {
    try {
      const networkStats = await si.networkStats();
      const timestamp = Date.now();
      
      // 找到主要网络接口（通常是第一个非lo接口）
      const mainInterface = networkStats.find(iface => 
        iface.iface !== 'lo' && iface.iface !== 'lo0'
      ) || networkStats[0];

      if (!mainInterface) {
        logger.warn('未找到可用的网络接口');
        return null;
      }

      return {
        timestamp,
        interface: mainInterface.iface,
        bytesReceived: mainInterface.rx_bytes,
        bytesSent: mainInterface.tx_bytes,
        packetsReceived: mainInterface.rx_packets,
        packetsSent: mainInterface.tx_packets,
        errorsReceived: mainInterface.rx_errors,
        errorsSent: mainInterface.tx_errors,
        droppedReceived: mainInterface.rx_dropped,
        droppedSent: mainInterface.tx_dropped
      };
    } catch (error) {
      logger.error('使用 systeminformation 收集网络统计失败:', error);
      return null;
    }
  }

  /**
   * 使用 /proc/net/dev 收集网络统计信息
   */
  async collectStatsWithProcNetDev() {
    try {
      const data = fs.readFileSync('/proc/net/dev', 'utf8');
      const lines = data.split('\n');
      const timestamp = Date.now();
      
      // 解析 /proc/net/dev 格式
      for (const line of lines) {
        if (line.includes(':')) {
          const parts = line.split(':');
          const interfaceName = parts[0].trim();
          
          // 跳过回环接口
          if (interfaceName === 'lo' || interfaceName === 'lo0') {
            continue;
          }
          
          const stats = parts[1].trim().split(/\s+/);
          
          return {
            timestamp,
            interface: interfaceName,
            bytesReceived: parseInt(stats[0]) || 0,
            bytesSent: parseInt(stats[8]) || 0,
            packetsReceived: parseInt(stats[1]) || 0,
            packetsSent: parseInt(stats[9]) || 0,
            errorsReceived: parseInt(stats[2]) || 0,
            errorsSent: parseInt(stats[10]) || 0,
            droppedReceived: parseInt(stats[3]) || 0,
            droppedSent: parseInt(stats[11]) || 0
          };
        }
      }
      
      logger.warn('未找到可用的网络接口');
      return null;
    } catch (error) {
      logger.error('使用 /proc/net/dev 收集网络统计失败:', error);
      return null;
    }
  }

  /**
   * 计算网络速度
   */
  calculateNetworkSpeed(currentStats) {
    const key = 'local';
    const lastStats = this.lastStats.get(key);
    
    if (!lastStats) {
      // 第一次收集，保存当前统计信息
      this.lastStats.set(key, currentStats);
      return;
    }

    // 计算时间差
    const deltaTime = (currentStats.timestamp - lastStats.timestamp) / 1000; // 转换为秒
    
    if (deltaTime <= 0) {
      return; // 时间差无效
    }

    // 计算字节差
    const deltaBytesReceived = currentStats.bytesReceived - lastStats.bytesReceived;
    const deltaBytesSent = currentStats.bytesSent - lastStats.bytesSent;

    // 计算速度 (B/s)
    const inSpeed = deltaBytesReceived / deltaTime;
    const outSpeed = deltaBytesSent / deltaTime;

    // 更新当前统计信息，添加速度数据
    currentStats.inSpeed = inSpeed;
    currentStats.outSpeed = outSpeed;
    currentStats.inSpeedKB = inSpeed / 1024;
    currentStats.outSpeedKB = outSpeed / 1024;
    currentStats.inSpeedMB = inSpeed / (1024 * 1024);
    currentStats.outSpeedMB = outSpeed / (1024 * 1024);
    currentStats.deltaTime = deltaTime;

    // 保存当前统计信息作为下次的基准
    this.lastStats.set(key, currentStats);
  }

  /**
   * 获取当前网络速度
   */
  getCurrentNetworkSpeed() {
    const stats = this.currentStats.get('local');
    if (!stats) {
      return null;
    }

    return {
      interface: stats.interface,
      inSpeed: stats.inSpeed || 0,
      outSpeed: stats.outSpeed || 0,
      inSpeedKB: stats.inSpeedKB || 0,
      outSpeedKB: stats.outSpeedKB || 0,
      inSpeedMB: stats.inSpeedMB || 0,
      outSpeedMB: stats.outSpeedMB || 0,
      bytesReceived: stats.bytesReceived,
      bytesSent: stats.bytesSent,
      packetsReceived: stats.packetsReceived,
      packetsSent: stats.packetsSent,
      timestamp: stats.timestamp,
      deltaTime: stats.deltaTime || 0
    };
  }

  /**
   * 格式化字节数
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 格式化速度
   */
  formatSpeed(bytesPerSecond) {
    if (bytesPerSecond === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 获取网络统计历史（可选功能）
   */
  getNetworkHistory(limit = 60) {
    // 这里可以实现历史数据存储和查询
    // 暂时返回空数组
    return [];
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.lastStats.clear();
    this.currentStats.clear();
    logger.info('网络统计信息已重置');
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      samplingInterval: this.samplingInterval,
      config: this.config,
      hasData: this.currentStats.has('local'),
      lastUpdate: this.currentStats.get('local')?.timestamp || null
    };
  }
}

export default new NetworkMonitoringService();
