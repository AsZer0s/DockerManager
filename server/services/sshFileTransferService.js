import { Client } from 'ssh2';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger.js';
import sshConnectionPool from './sshConnectionPool.js';

/**
 * SSH 文件传输服务
 * 提供高效的 SFTP 文件上传下载功能
 */
class SSHFileTransferService {
  constructor() {
    this.activeTransfers = new Map(); // transferId -> transfer info
    this.transferHistory = new Map(); // serverId -> transfer history
  }

  /**
   * 上传文件到服务器
   * @param {number} serverId - 服务器ID
   * @param {string} localPath - 本地文件路径
   * @param {string} remotePath - 远程文件路径
   * @param {Object} options - 上传选项
   */
  async uploadFile(serverId, localPath, remotePath, options = {}) {
    const transferId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const startTime = Date.now();
    
    try {
      // 检查本地文件是否存在
      if (!fs.existsSync(localPath)) {
        throw new Error(`本地文件不存在: ${localPath}`);
      }

      const fileStats = fs.statSync(localPath);
      const fileSize = fileStats.size;

      // 创建传输记录
      const transferInfo = {
        transferId,
        type: 'upload',
        serverId,
        localPath,
        remotePath,
        fileSize,
        startTime,
        progress: 0,
        status: 'starting',
        speed: 0,
        eta: 0
      };

      this.activeTransfers.set(transferId, transferInfo);

      // 获取 SSH 连接
      const client = await sshConnectionPool.getConnection(serverId);
      
      return new Promise((resolve, reject) => {
        client.sftp((err, sftp) => {
          if (err) {
            this.activeTransfers.delete(transferId);
            reject(new Error(`SFTP 连接失败: ${err.message}`));
            return;
          }

          transferInfo.status = 'transferring';
          let transferredBytes = 0;
          let lastProgressTime = Date.now();
          let lastTransferredBytes = 0;

          // 创建读取流
          const readStream = fs.createReadStream(localPath);
          
          // 创建写入流
          const writeStream = sftp.createWriteStream(remotePath, {
            flags: 'w',
            mode: fileStats.mode,
            ...options
          });

          // 监听进度
          readStream.on('data', (chunk) => {
            transferredBytes += chunk.length;
            const now = Date.now();
            
            // 更新进度信息
            transferInfo.progress = Math.round((transferredBytes / fileSize) * 100);
            
            // 计算传输速度和预计完成时间
            if (now - lastProgressTime >= 1000) { // 每秒更新一次
              const timeDiff = (now - lastProgressTime) / 1000;
              const bytesDiff = transferredBytes - lastTransferredBytes;
              transferInfo.speed = Math.round(bytesDiff / timeDiff); // bytes/second
              
              const remainingBytes = fileSize - transferredBytes;
              transferInfo.eta = transferInfo.speed > 0 
                ? Math.round(remainingBytes / transferInfo.speed)
                : 0;
              
              lastProgressTime = now;
              lastTransferredBytes = transferredBytes;
            }
          });

          // 处理传输完成
          writeStream.on('close', () => {
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            transferInfo.status = 'completed';
            transferInfo.endTime = endTime;
            transferInfo.duration = duration;
            transferInfo.averageSpeed = Math.round(fileSize / (duration / 1000));
            
            // 移动到历史记录
            this.addToHistory(serverId, transferInfo);
            this.activeTransfers.delete(transferId);
            
            logger.info(`文件上传完成: ${localPath} -> ${remotePath} (${this.formatFileSize(fileSize)}, ${duration}ms)`);
            
            resolve({
              transferId,
              success: true,
              fileSize,
              duration,
              averageSpeed: transferInfo.averageSpeed
            });
          });

          // 处理错误
          const handleError = (error) => {
            transferInfo.status = 'failed';
            transferInfo.error = error.message;
            transferInfo.endTime = Date.now();
            
            this.addToHistory(serverId, transferInfo);
            this.activeTransfers.delete(transferId);
            
            logger.error(`文件上传失败: ${localPath} -> ${remotePath}`, error);
            reject(error);
          };

          readStream.on('error', handleError);
          writeStream.on('error', handleError);

          // 开始传输
          readStream.pipe(writeStream);
        });
      });
    } catch (error) {
      this.activeTransfers.delete(transferId);
      throw error;
    }
  }

  /**
   * 从服务器下载文件
   * @param {number} serverId - 服务器ID
   * @param {string} remotePath - 远程文件路径
   * @param {string} localPath - 本地文件路径
   * @param {Object} options - 下载选项
   */
  async downloadFile(serverId, remotePath, localPath, options = {}) {
    const transferId = `download_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const startTime = Date.now();
    
    try {
      // 确保本地目录存在
      const localDir = path.dirname(localPath);
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }

      // 获取 SSH 连接
      const client = await sshConnectionPool.getConnection(serverId);
      
      return new Promise((resolve, reject) => {
        client.sftp((err, sftp) => {
          if (err) {
            reject(new Error(`SFTP 连接失败: ${err.message}`));
            return;
          }

          // 获取远程文件信息
          sftp.stat(remotePath, (statErr, stats) => {
            if (statErr) {
              reject(new Error(`远程文件不存在: ${remotePath}`));
              return;
            }

            const fileSize = stats.size;

            // 创建传输记录
            const transferInfo = {
              transferId,
              type: 'download',
              serverId,
              remotePath,
              localPath,
              fileSize,
              startTime,
              progress: 0,
              status: 'transferring',
              speed: 0,
              eta: 0
            };

            this.activeTransfers.set(transferId, transferInfo);

            let transferredBytes = 0;
            let lastProgressTime = Date.now();
            let lastTransferredBytes = 0;

            // 创建读取流
            const readStream = sftp.createReadStream(remotePath, options);
            
            // 创建写入流
            const writeStream = fs.createWriteStream(localPath);

            // 监听进度
            readStream.on('data', (chunk) => {
              transferredBytes += chunk.length;
              const now = Date.now();
              
              // 更新进度信息
              transferInfo.progress = Math.round((transferredBytes / fileSize) * 100);
              
              // 计算传输速度和预计完成时间
              if (now - lastProgressTime >= 1000) { // 每秒更新一次
                const timeDiff = (now - lastProgressTime) / 1000;
                const bytesDiff = transferredBytes - lastTransferredBytes;
                transferInfo.speed = Math.round(bytesDiff / timeDiff);
                
                const remainingBytes = fileSize - transferredBytes;
                transferInfo.eta = transferInfo.speed > 0 
                  ? Math.round(remainingBytes / transferInfo.speed)
                  : 0;
                
                lastProgressTime = now;
                lastTransferredBytes = transferredBytes;
              }
            });

            // 处理传输完成
            writeStream.on('close', () => {
              const endTime = Date.now();
              const duration = endTime - startTime;
              
              transferInfo.status = 'completed';
              transferInfo.endTime = endTime;
              transferInfo.duration = duration;
              transferInfo.averageSpeed = Math.round(fileSize / (duration / 1000));
              
              // 移动到历史记录
              this.addToHistory(serverId, transferInfo);
              this.activeTransfers.delete(transferId);
              
              logger.info(`文件下载完成: ${remotePath} -> ${localPath} (${this.formatFileSize(fileSize)}, ${duration}ms)`);
              
              resolve({
                transferId,
                success: true,
                fileSize,
                duration,
                averageSpeed: transferInfo.averageSpeed
              });
            });

            // 处理错误
            const handleError = (error) => {
              transferInfo.status = 'failed';
              transferInfo.error = error.message;
              transferInfo.endTime = Date.now();
              
              this.addToHistory(serverId, transferInfo);
              this.activeTransfers.delete(transferId);
              
              logger.error(`文件下载失败: ${remotePath} -> ${localPath}`, error);
              reject(error);
            };

            readStream.on('error', handleError);
            writeStream.on('error', handleError);

            // 开始传输
            readStream.pipe(writeStream);
          });
        });
      });
    } catch (error) {
      this.activeTransfers.delete(transferId);
      throw error;
    }
  }

  /**
   * 列出远程目录内容
   * @param {number} serverId - 服务器ID
   * @param {string} remotePath - 远程目录路径
   */
  async listDirectory(serverId, remotePath = '.') {
    try {
      const client = await sshConnectionPool.getConnection(serverId);
      
      return new Promise((resolve, reject) => {
        client.sftp((err, sftp) => {
          if (err) {
            reject(new Error(`SFTP 连接失败: ${err.message}`));
            return;
          }

          sftp.readdir(remotePath, (readErr, list) => {
            if (readErr) {
              reject(new Error(`读取目录失败: ${readErr.message}`));
              return;
            }

            // 格式化文件列表
            const formattedList = list.map(item => ({
              name: item.filename,
              type: item.attrs.isDirectory() ? 'directory' : 'file',
              size: item.attrs.size,
              mode: item.attrs.mode,
              uid: item.attrs.uid,
              gid: item.attrs.gid,
              mtime: new Date(item.attrs.mtime * 1000),
              atime: new Date(item.attrs.atime * 1000),
              permissions: this.formatPermissions(item.attrs.mode),
              isDirectory: item.attrs.isDirectory(),
              isFile: item.attrs.isFile(),
              isSymbolicLink: item.attrs.isSymbolicLink()
            }));

            resolve(formattedList);
          });
        });
      });
    } catch (error) {
      logger.error(`列出目录失败: ${remotePath}`, error);
      throw error;
    }
  }

  /**
   * 创建远程目录
   * @param {number} serverId - 服务器ID
   * @param {string} remotePath - 远程目录路径
   * @param {Object} options - 创建选项
   */
  async createDirectory(serverId, remotePath, options = {}) {
    try {
      const client = await sshConnectionPool.getConnection(serverId);
      
      return new Promise((resolve, reject) => {
        client.sftp((err, sftp) => {
          if (err) {
            reject(new Error(`SFTP 连接失败: ${err.message}`));
            return;
          }

          const mode = options.mode || 0o755;
          
          sftp.mkdir(remotePath, { mode }, (mkdirErr) => {
            if (mkdirErr) {
              reject(new Error(`创建目录失败: ${mkdirErr.message}`));
              return;
            }

            logger.info(`目录创建成功: ${remotePath}`);
            resolve({ success: true, path: remotePath });
          });
        });
      });
    } catch (error) {
      logger.error(`创建目录失败: ${remotePath}`, error);
      throw error;
    }
  }

  /**
   * 删除远程文件或目录
   * @param {number} serverId - 服务器ID
   * @param {string} remotePath - 远程路径
   * @param {Object} options - 删除选项
   */
  async deleteRemote(serverId, remotePath, options = {}) {
    try {
      const client = await sshConnectionPool.getConnection(serverId);
      
      return new Promise((resolve, reject) => {
        client.sftp((err, sftp) => {
          if (err) {
            reject(new Error(`SFTP 连接失败: ${err.message}`));
            return;
          }

          // 先检查文件类型
          sftp.stat(remotePath, (statErr, stats) => {
            if (statErr) {
              reject(new Error(`文件不存在: ${remotePath}`));
              return;
            }

            if (stats.isDirectory()) {
              // 删除目录
              if (options.recursive) {
                this.deleteDirectoryRecursive(sftp, remotePath, (deleteErr) => {
                  if (deleteErr) {
                    reject(deleteErr);
                  } else {
                    logger.info(`目录删除成功: ${remotePath}`);
                    resolve({ success: true, path: remotePath, type: 'directory' });
                  }
                });
              } else {
                sftp.rmdir(remotePath, (rmdirErr) => {
                  if (rmdirErr) {
                    reject(new Error(`删除目录失败: ${rmdirErr.message}`));
                  } else {
                    logger.info(`目录删除成功: ${remotePath}`);
                    resolve({ success: true, path: remotePath, type: 'directory' });
                  }
                });
              }
            } else {
              // 删除文件
              sftp.unlink(remotePath, (unlinkErr) => {
                if (unlinkErr) {
                  reject(new Error(`删除文件失败: ${unlinkErr.message}`));
                } else {
                  logger.info(`文件删除成功: ${remotePath}`);
                  resolve({ success: true, path: remotePath, type: 'file' });
                }
              });
            }
          });
        });
      });
    } catch (error) {
      logger.error(`删除失败: ${remotePath}`, error);
      throw error;
    }
  }

  /**
   * 递归删除目录
   * @param {Object} sftp - SFTP 客户端
   * @param {string} dirPath - 目录路径
   * @param {Function} callback - 回调函数
   */
  deleteDirectoryRecursive(sftp, dirPath, callback) {
    sftp.readdir(dirPath, (readErr, list) => {
      if (readErr) {
        callback(new Error(`读取目录失败: ${readErr.message}`));
        return;
      }

      let pending = list.length;
      if (pending === 0) {
        sftp.rmdir(dirPath, callback);
        return;
      }

      list.forEach(item => {
        const itemPath = path.posix.join(dirPath, item.filename);
        
        if (item.attrs.isDirectory()) {
          this.deleteDirectoryRecursive(sftp, itemPath, (err) => {
            if (err) {
              callback(err);
              return;
            }
            
            pending--;
            if (pending === 0) {
              sftp.rmdir(dirPath, callback);
            }
          });
        } else {
          sftp.unlink(itemPath, (err) => {
            if (err) {
              callback(new Error(`删除文件失败: ${err.message}`));
              return;
            }
            
            pending--;
            if (pending === 0) {
              sftp.rmdir(dirPath, callback);
            }
          });
        }
      });
    });
  }

  /**
   * 获取传输进度
   * @param {string} transferId - 传输ID
   */
  getTransferProgress(transferId) {
    return this.activeTransfers.get(transferId) || null;
  }

  /**
   * 获取活跃传输列表
   */
  getActiveTransfers() {
    return Array.from(this.activeTransfers.values());
  }

  /**
   * 获取传输历史
   * @param {number} serverId - 服务器ID
   * @param {number} limit - 限制数量
   */
  getTransferHistory(serverId, limit = 20) {
    const history = this.transferHistory.get(serverId) || [];
    return history.slice(-limit);
  }

  /**
   * 取消传输
   * @param {string} transferId - 传输ID
   */
  cancelTransfer(transferId) {
    const transferInfo = this.activeTransfers.get(transferId);
    if (transferInfo) {
      transferInfo.status = 'cancelled';
      transferInfo.endTime = Date.now();
      
      this.addToHistory(transferInfo.serverId, transferInfo);
      this.activeTransfers.delete(transferId);
      
      logger.info(`传输已取消: ${transferId}`);
      return true;
    }
    return false;
  }

  /**
   * 添加到历史记录
   * @param {number} serverId - 服务器ID
   * @param {Object} transferInfo - 传输信息
   */
  addToHistory(serverId, transferInfo) {
    if (!this.transferHistory.has(serverId)) {
      this.transferHistory.set(serverId, []);
    }
    
    const history = this.transferHistory.get(serverId);
    history.push({
      ...transferInfo,
      completedAt: Date.now()
    });
    
    // 限制历史记录数量
    if (history.length > 100) {
      history.shift();
    }
  }

  /**
   * 格式化文件大小
   * @param {number} bytes - 字节数
   */
  formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * 格式化权限
   * @param {number} mode - 权限模式
   */
  formatPermissions(mode) {
    const permissions = [];
    const types = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
    
    // 所有者权限
    permissions.push(types[(mode >> 6) & 7]);
    // 组权限
    permissions.push(types[(mode >> 3) & 7]);
    // 其他用户权限
    permissions.push(types[mode & 7]);
    
    return permissions.join('');
  }

  /**
   * 获取服务统计
   */
  getStats() {
    const activeTransfers = Array.from(this.activeTransfers.values());
    const totalHistory = Array.from(this.transferHistory.values())
      .reduce((sum, history) => sum + history.length, 0);
    
    return {
      activeTransfers: activeTransfers.length,
      totalHistoryRecords: totalHistory,
      transfersByType: activeTransfers.reduce((acc, transfer) => {
        acc[transfer.type] = (acc[transfer.type] || 0) + 1;
        return acc;
      }, {}),
      transfersByStatus: activeTransfers.reduce((acc, transfer) => {
        acc[transfer.status] = (acc[transfer.status] || 0) + 1;
        return acc;
      }, {}),
      averageProgress: activeTransfers.length > 0
        ? Math.round(activeTransfers.reduce((sum, t) => sum + t.progress, 0) / activeTransfers.length)
        : 0
    };
  }
}

export default new SSHFileTransferService();