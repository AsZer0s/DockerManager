import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Database {
  constructor() {
    this.db = null;
    this.isConnected = false;
    this.dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/database.sqlite');
  }

  async connect() {
    try {
      // 确保数据目录存在
      const dbDir = path.dirname(this.dbPath);
      await import('fs').then(fs => {
        if (!fs.existsSync(dbDir)) {
          fs.mkdirSync(dbDir, { recursive: true });
        }
      });

      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });

      // 启用外键约束
      await this.db.exec('PRAGMA foreign_keys = ON');
      
      // 设置 WAL 模式以提高并发性能
      await this.db.exec('PRAGMA journal_mode = WAL');
      
      // 设置同步模式
      await this.db.exec('PRAGMA synchronous = NORMAL');
      
      // 设置缓存大小
      await this.db.exec('PRAGMA cache_size = 10000');

      this.isConnected = true;
      logger.info(`SQLite 数据库连接成功: ${this.dbPath}`);
      
      // 初始化数据库表
      await this.initializeTables();
    } catch (error) {
      logger.error('SQLite 数据库连接失败:', error);
      throw error;
    }
  }

  async initializeTables() {
    try {
      // 创建用户表
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(100) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(20) DEFAULT 'user',
          telegram_id TEXT UNIQUE,
          telegram_verified BOOLEAN DEFAULT false,
          telegram_verified_at DATETIME,
          avatar VARCHAR(255),
          phone VARCHAR(20),
          bio TEXT,
          is_active BOOLEAN DEFAULT true,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 创建服务器表
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS servers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name VARCHAR(100) NOT NULL,
          host VARCHAR(255) NOT NULL,
          port INTEGER DEFAULT 2376,
          username VARCHAR(100),
          password_encrypted TEXT,
          private_key_encrypted TEXT,
          description TEXT,
          status VARCHAR(50) DEFAULT '未知',
          created_by INTEGER,
          is_active BOOLEAN DEFAULT true,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
        )
      `);

      // 创建容器表
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS containers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          container_id VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          image VARCHAR(255) NOT NULL,
          status VARCHAR(50) NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE,
          UNIQUE(server_id, container_id)
        )
      `);

      // 创建用户服务器访问权限表
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS user_server_access (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          server_id INTEGER NOT NULL,
          can_view BOOLEAN DEFAULT true,
          can_control BOOLEAN DEFAULT false,
          can_ssh BOOLEAN DEFAULT false,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
          FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE,
          UNIQUE(user_id, server_id)
        )
      `);

      // 创建用户服务器权限表（与 user_server_access 相同，但使用不同的名称）
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS user_server_permissions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          server_id INTEGER NOT NULL,
          can_view BOOLEAN DEFAULT true,
          can_control BOOLEAN DEFAULT false,
          can_ssh BOOLEAN DEFAULT false,
          hide_sensitive_info BOOLEAN DEFAULT false,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
          FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE,
          UNIQUE(user_id, server_id)
        )
      `);


      // 创建登录失败记录表
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS login_attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ip_address VARCHAR(45) NOT NULL,
          failed_attempts INTEGER DEFAULT 1,
          last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP,
          locked_until DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 创建服务器监控数据表
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS server_monitoring (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          cpu_usage REAL DEFAULT 0,
          memory_usage REAL DEFAULT 0,
          memory_total INTEGER DEFAULT 0,
          memory_used INTEGER DEFAULT 0,
          disk_usage REAL DEFAULT 0,
          disk_total INTEGER DEFAULT 0,
          disk_used INTEGER DEFAULT 0,
          network_in INTEGER DEFAULT 0,
          network_out INTEGER DEFAULT 0,
          load_average REAL DEFAULT 0,
          uptime INTEGER DEFAULT 0,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE
        )
      `);

      // 创建容器监控数据表
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS container_monitoring (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          container_id VARCHAR(255) NOT NULL,
          cpu_usage REAL DEFAULT 0,
          memory_usage REAL DEFAULT 0,
          memory_limit INTEGER DEFAULT 0,
          network_in INTEGER DEFAULT 0,
          network_out INTEGER DEFAULT 0,
          block_in INTEGER DEFAULT 0,
          block_out INTEGER DEFAULT 0,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE,
          UNIQUE(server_id, container_id, timestamp)
        )
      `);

      // 创建告警表
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS alerts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER,
          container_id VARCHAR(255),
          type VARCHAR(50) NOT NULL,
          severity VARCHAR(20) DEFAULT 'warning',
          message TEXT NOT NULL,
          resolved BOOLEAN DEFAULT false,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          resolved_at DATETIME,
          FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE
        )
      `);

      // 创建操作日志表
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS operation_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          server_id INTEGER,
          container_id VARCHAR(255),
          action VARCHAR(100) NOT NULL,
          details TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
          FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE
        )
      `);

      // 创建用户设置表
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS user_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          settings TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
          UNIQUE(user_id)
        )
      `);

      // 创建用户通知设置表
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS user_notification_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          settings TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
          UNIQUE(user_id)
        )
      `);

      // 创建用户服务器权限表
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS user_servers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          server_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
          FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE,
          UNIQUE(user_id, server_id)
        )
      `);

      // 创建用户容器权限表
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS user_containers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          container_id VARCHAR(255) NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
          UNIQUE(user_id, container_id)
        )
      `);

      // 创建索引
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_servers_name ON servers(name)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_containers_server_id ON containers(server_id)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_containers_container_id ON containers(container_id)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_user_server_access_user_id ON user_server_access(user_id)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_user_server_access_server_id ON user_server_access(server_id)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_login_attempts_locked_until ON login_attempts(locked_until)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_server_monitoring_server_id ON server_monitoring(server_id)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_server_monitoring_timestamp ON server_monitoring(timestamp)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_container_monitoring_server_id ON container_monitoring(server_id)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_container_monitoring_container_id ON container_monitoring(container_id)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_container_monitoring_timestamp ON container_monitoring(timestamp)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_user_servers_user_id ON user_servers(user_id)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_user_servers_server_id ON user_servers(server_id)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_user_containers_user_id ON user_containers(user_id)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_user_containers_container_id ON user_containers(container_id)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_alerts_server_id ON alerts(server_id)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(resolved)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_operation_logs_user_id ON operation_logs(user_id)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_operation_logs_server_id ON operation_logs(server_id)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_operation_logs_action ON operation_logs(action)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_operation_logs_timestamp ON operation_logs(timestamp)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id)');
      await this.db.exec('CREATE INDEX IF NOT EXISTS idx_user_notification_settings_user_id ON user_notification_settings(user_id)');

      logger.info('数据库表初始化完成');
    } catch (error) {
      logger.error('数据库表初始化失败:', error);
      throw error;
    }
  }

  async query(text, params = []) {
    if (!this.isConnected) {
      throw new Error('数据库未连接');
    }

    const start = Date.now();
    try {
      // 处理 PostgreSQL 风格的参数占位符 ($1, $2, ...) 转换为 SQLite 风格 (?)
      const sqliteQuery = text.replace(/\$(\d+)/g, '?');
      
      const result = await this.db.all(sqliteQuery, params);
      const duration = Date.now() - start;
      
      logger.debug('数据库查询执行', { 
        query: sqliteQuery, 
        duration, 
        rows: result.length 
      });
      
      return { rows: result, rowCount: result.length };
    } catch (error) {
      logger.error('数据库查询错误:', { query: text, error: error.message });
      throw error;
    }
  }

  async queryOne(text, params = []) {
    if (!this.isConnected) {
      throw new Error('数据库未连接');
    }

    const start = Date.now();
    try {
      const sqliteQuery = text.replace(/\$(\d+)/g, '?');
      const result = await this.db.get(sqliteQuery, params);
      const duration = Date.now() - start;
      
      logger.debug('数据库查询执行', { 
        query: sqliteQuery, 
        duration, 
        found: !!result 
      });
      
      return { rows: result ? [result] : [], rowCount: result ? 1 : 0 };
    } catch (error) {
      logger.error('数据库查询错误:', { query: text, error: error.message });
      throw error;
    }
  }

  async transaction(callback) {
    if (!this.isConnected) {
      throw new Error('数据库未连接');
    }

    try {
      await this.db.exec('BEGIN TRANSACTION');
      const result = await callback(this);
      await this.db.exec('COMMIT');
      return result;
    } catch (error) {
      await this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async disconnect() {
    if (this.db) {
      await this.db.close();
      this.isConnected = false;
      logger.info('SQLite 数据库连接已关闭');
    }
  }

  getDatabase() {
    return this.db;
  }

  // 获取数据库统计信息
  async getStats() {
    try {
      const userCount = await this.db.get('SELECT COUNT(*) as count FROM users');
      const serverCount = await this.db.get('SELECT COUNT(*) as count FROM servers');
      const containerCount = await this.db.get('SELECT COUNT(*) as count FROM containers');
      
      return {
        users: userCount.count,
        servers: serverCount.count,
        containers: containerCount.count,
        databasePath: this.dbPath,
        isConnected: this.isConnected
      };
    } catch (error) {
      logger.error('获取数据库统计信息失败:', error);
      return null;
    }
  }
}

export default new Database();