import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import mysql from 'mysql2/promise.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WAIT_BETWEEN_RETRIES = 1000;

class Database {
  constructor() {
    this.client = (process.env.DB_CLIENT || process.env.DATABASE_CLIENT || 'sqlite').toLowerCase();
    this.dbPath = this.client === 'sqlite'
      ? (process.env.DATABASE_PATH || path.join(__dirname, '../data/database.sqlite'))
      : null;
    this.db = null;
    this.sqliteDb = null;
    this.mysqlPool = null;
    this.mysqlConfig = null;
    this.isConnected = false;
  }

  getClientType() {
    return this.client;
  }

  getDatabasePath() {
    return this.dbPath;
  }

  async connect(maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (this.client === 'mysql') {
          await this.connectMySQL();
        } else {
          await this.connectSqlite();
        }

        this.isConnected = true;
        await this.initializeTables();
        logger.info(`${this.client === 'mysql' ? 'MySQL' : 'SQLite'} 数据库连接成功`);
        return;
      } catch (error) {
        logger.error(`数据库连接失败 (尝试 ${attempt}/${maxRetries}): ${error.message}`, error);

        if (attempt === maxRetries) {
          throw error;
        }

        await new Promise(resolve => setTimeout(resolve, WAIT_BETWEEN_RETRIES * attempt));
      }
    }
  }

  async connectSqlite() {
    if (!this.dbPath) {
      throw new Error('未指定 SQLite 数据库路径');
    }

    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.sqliteDb = await open({
      filename: this.dbPath,
      driver: sqlite3.Database
    });

    await this.sqliteDb.exec('PRAGMA foreign_keys = ON;');
    await this.sqliteDb.exec('PRAGMA journal_mode = WAL;');
    await this.sqliteDb.exec('PRAGMA synchronous = NORMAL;');
    await this.sqliteDb.exec('PRAGMA cache_size = 10000;');
    await this.sqliteDb.exec('PRAGMA temp_store = MEMORY;');
    await this.sqliteDb.exec('PRAGMA mmap_size = 268435456;');
    await this.sqliteDb.exec('PRAGMA page_size = 4096;');
    await this.sqliteDb.exec('PRAGMA auto_vacuum = INCREMENTAL;');
    await this.sqliteDb.exec('PRAGMA busy_timeout = 30000;');

    this.db = this.sqliteDb;
  }

  async connectMySQL() {
    const {
      MYSQL_HOST,
      MYSQL_PORT = 3306,
      MYSQL_USER,
      MYSQL_PASSWORD = '',
      MYSQL_DATABASE,
      MYSQL_POOL_SIZE = 10
    } = process.env;

    if (!MYSQL_HOST || !MYSQL_USER || !MYSQL_DATABASE) {
      throw new Error('缺少 MySQL 连接配置，请检查 MYSQL_HOST、MYSQL_USER 和 MYSQL_DATABASE 环境变量');
    }

    this.mysqlConfig = {
      host: MYSQL_HOST,
      port: Number(MYSQL_PORT) || 3306,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: Number(MYSQL_POOL_SIZE) || 10,
      queueLimit: 0,
      charset: 'utf8mb4_unicode_ci'
    };

    this.mysqlPool = await mysql.createPool(this.mysqlConfig);
    this.db = this.createMySQLWrapper(this.mysqlPool);
  }

  createMySQLWrapper(executor) {
    const exec = executor ?? this.mysqlPool;

    if (!exec) {
      throw new Error('MySQL 执行器未初始化');
    }

    return {
      get: async (sql, params = []) => {
        const [rows] = await exec.execute(this.prepareQuery(sql), params);
        return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      },
      all: async (sql, params = []) => {
        const [rows] = await exec.execute(this.prepareQuery(sql), params);
        return Array.isArray(rows) ? rows : [];
      },
      run: async (sql, params = []) => {
        const [result] = await exec.execute(this.prepareQuery(sql), params);
        return {
          ...result,
          lastID: typeof result?.insertId === 'number' ? result.insertId : null,
          changes: typeof result?.affectedRows === 'number' ? result.affectedRows : 0
        };
      },
      exec: async (sql) => {
        const statements = this.prepareBatch(sql);
        for (const statement of statements) {
          await exec.query(this.prepareQuery(statement));
        }
      },
      close: async () => {
        if (typeof exec.release === 'function') {
          exec.release();
        } else if (typeof exec.end === 'function') {
          await exec.end();
        }
      }
    };
  }

  prepareBatch(sql) {
    if (!sql) {
      return [];
    }

    return sql
      .split(/;\s*(?=\n|$)/)
      .map(statement => statement.trim())
      .filter(Boolean);
  }

  prepareQuery(query) {
    if (!query) {
      return query;
    }

    let prepared = query.replace(/\$(\d+)/g, '?').trim();

    if (prepared.endsWith(';')) {
      prepared = prepared.slice(0, -1);
    }

    if (this.client === 'mysql') {
      prepared = prepared
        .replace(/datetime\(\s*'now'\s*,\s*'-(\d+)\s+hours?'\s*\)/gi, 'DATE_SUB(NOW(), INTERVAL $1 HOUR)')
        .replace(/datetime\(\s*'now'\s*,\s*'-(\d+)\s+days?'\s*\)/gi, 'DATE_SUB(NOW(), INTERVAL $1 DAY)')
        .replace(/datetime\(\s*'now'\s*,\s*'-(\d+)\s+minutes?'\s*\)/gi, 'DATE_SUB(NOW(), INTERVAL $1 MINUTE)');
    }

    return prepared;
  }

  getTableDefinitions() {
    if (this.client === 'mysql') {
      return [
        `CREATE TABLE IF NOT EXISTS users (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(50) NOT NULL UNIQUE,
          email VARCHAR(100) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(20) DEFAULT 'user',
          telegram_id VARCHAR(64) UNIQUE,
          telegram_username VARCHAR(255),
          telegram_verified TINYINT(1) DEFAULT 0,
          telegram_verified_at DATETIME NULL,
          avatar VARCHAR(255),
          phone VARCHAR(20),
          bio TEXT,
          is_active TINYINT(1) DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS servers (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          host VARCHAR(255) NOT NULL,
          port INT DEFAULT 2376,
          ssh_port INT DEFAULT 22,
          username VARCHAR(100),
          password_encrypted TEXT,
          private_key_encrypted TEXT,
          description TEXT,
          status VARCHAR(50) DEFAULT '未知',
          proxy_enabled TINYINT(1) DEFAULT 0,
          proxy_host VARCHAR(255),
          proxy_port INT DEFAULT 1080,
          proxy_username VARCHAR(100),
          proxy_password_encrypted TEXT,
          created_by INT UNSIGNED,
          is_active TINYINT(1) DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS containers (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          server_id INT UNSIGNED NOT NULL,
          container_id VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          image VARCHAR(255) NOT NULL,
          status VARCHAR(50) NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_server_container (server_id, container_id),
          FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS user_server_access (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          user_id INT UNSIGNED NOT NULL,
          server_id INT UNSIGNED NOT NULL,
          can_view TINYINT(1) DEFAULT 1,
          can_control TINYINT(1) DEFAULT 0,
          can_ssh TINYINT(1) DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_user_server_access (user_id, server_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS user_server_permissions (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          user_id INT UNSIGNED NOT NULL,
          server_id INT UNSIGNED NOT NULL,
          can_view TINYINT(1) DEFAULT 1,
          can_control TINYINT(1) DEFAULT 0,
          can_ssh TINYINT(1) DEFAULT 0,
          hide_sensitive_info TINYINT(1) DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_user_server_permission (user_id, server_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS otp_codes (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          user_id INT UNSIGNED NOT NULL,
          code VARCHAR(20) NOT NULL,
          expires_at DATETIME NOT NULL,
          used TINYINT(1) DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS login_attempts (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          ip_address VARCHAR(45) NOT NULL,
          failed_attempts INT DEFAULT 1,
          last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP,
          locked_until DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS server_monitoring (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          server_id INT UNSIGNED NOT NULL,
          cpu_usage DOUBLE DEFAULT 0,
          memory_usage DOUBLE DEFAULT 0,
          memory_total BIGINT DEFAULT 0,
          memory_used BIGINT DEFAULT 0,
          disk_usage DOUBLE DEFAULT 0,
          disk_total BIGINT DEFAULT 0,
          disk_used BIGINT DEFAULT 0,
          network_in BIGINT DEFAULT 0,
          network_out BIGINT DEFAULT 0,
          load_average DOUBLE DEFAULT 0,
          uptime BIGINT DEFAULT 0,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS container_monitoring (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          server_id INT UNSIGNED NOT NULL,
          container_id VARCHAR(255) NOT NULL,
          cpu_usage DOUBLE DEFAULT 0,
          memory_usage DOUBLE DEFAULT 0,
          memory_limit BIGINT DEFAULT 0,
          network_in BIGINT DEFAULT 0,
          network_out BIGINT DEFAULT 0,
          block_in BIGINT DEFAULT 0,
          block_out BIGINT DEFAULT 0,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_container_metric (server_id, container_id, timestamp),
          FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS alerts (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          server_id INT UNSIGNED,
          container_id VARCHAR(255),
          type VARCHAR(50) NOT NULL,
          severity VARCHAR(20) DEFAULT 'warning',
          message TEXT NOT NULL,
          resolved TINYINT(1) DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          resolved_at DATETIME,
          FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS operation_logs (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          user_id INT UNSIGNED,
          server_id INT UNSIGNED,
          container_id VARCHAR(255),
          action VARCHAR(100) NOT NULL,
          details TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS user_settings (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          user_id INT UNSIGNED NOT NULL,
          settings TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_user_settings (user_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS user_notification_settings (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          user_id INT UNSIGNED NOT NULL,
          settings TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_user_notification_settings (user_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS system_settings (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          ` + '`key`' + ` VARCHAR(100) NOT NULL UNIQUE,
          settings TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS user_servers (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          user_id INT UNSIGNED NOT NULL,
          server_id INT UNSIGNED NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_user_server (user_id, server_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS user_containers (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          user_id INT UNSIGNED NOT NULL,
          container_id VARCHAR(255) NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_user_container (user_id, container_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS container_templates (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          description TEXT,
          type VARCHAR(50) DEFAULT 'custom',
          category VARCHAR(50),
          icon VARCHAR(255),
          config LONGTEXT NOT NULL,
          compose_file LONGTEXT,
          dependencies LONGTEXT,
          created_by INT UNSIGNED,
          is_public TINYINT(1) DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS template_deployments (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          template_id INT UNSIGNED NOT NULL,
          server_id INT UNSIGNED NOT NULL,
          user_id INT UNSIGNED NOT NULL,
          status VARCHAR(50) DEFAULT 'pending',
          containers LONGTEXT,
          error_message LONGTEXT,
          deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (template_id) REFERENCES container_templates(id) ON DELETE CASCADE,
          FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      ];
    }

    return [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        telegram_id TEXT UNIQUE,
        telegram_username TEXT,
        telegram_verified BOOLEAN DEFAULT false,
        telegram_verified_at DATETIME,
        avatar VARCHAR(255),
        phone VARCHAR(20),
        bio TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(100) NOT NULL,
        host VARCHAR(255) NOT NULL,
        port INTEGER DEFAULT 2376,
        ssh_port INTEGER DEFAULT 22,
        username VARCHAR(100),
        password_encrypted TEXT,
        private_key_encrypted TEXT,
        description TEXT,
        status VARCHAR(50) DEFAULT '未知',
        proxy_enabled BOOLEAN DEFAULT false,
        proxy_host VARCHAR(255),
        proxy_port INTEGER DEFAULT 1080,
        proxy_username VARCHAR(100),
        proxy_password_encrypted TEXT,
        created_by INTEGER,
        is_active BOOLEAN DEFAULT true,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
      )`,
      `CREATE TABLE IF NOT EXISTS containers (
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
      )`,
      `CREATE TABLE IF NOT EXISTS user_server_access (
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
      )`,
      `CREATE TABLE IF NOT EXISTS user_server_permissions (
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
      )`,
      `CREATE TABLE IF NOT EXISTS otp_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        code TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        used BOOLEAN DEFAULT false,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address VARCHAR(45) NOT NULL,
        failed_attempts INTEGER DEFAULT 1,
        last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP,
        locked_until DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS server_monitoring (
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
      )`,
      `CREATE TABLE IF NOT EXISTS container_monitoring (
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
      )`,
      `CREATE TABLE IF NOT EXISTS alerts (
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
      )`,
      `CREATE TABLE IF NOT EXISTS operation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        server_id INTEGER,
        container_id VARCHAR(255),
        action VARCHAR(100) NOT NULL,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
        FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        settings TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(user_id)
      )`,
      `CREATE TABLE IF NOT EXISTS user_notification_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        settings TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(user_id)
      )`,
      `CREATE TABLE IF NOT EXISTS system_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key VARCHAR(100) NOT NULL UNIQUE,
        settings TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS user_servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        server_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE,
        UNIQUE(user_id, server_id)
      )`,
      `CREATE TABLE IF NOT EXISTS user_containers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        container_id VARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(user_id, container_id)
      )`,
      `CREATE TABLE IF NOT EXISTS container_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        type VARCHAR(50) DEFAULT 'custom',
        category VARCHAR(50),
        icon VARCHAR(255),
        config TEXT NOT NULL,
        compose_file TEXT,
        dependencies TEXT,
        created_by INTEGER,
        is_public BOOLEAN DEFAULT false,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
      )`,
      `CREATE TABLE IF NOT EXISTS template_deployments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_id INTEGER NOT NULL,
        server_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        containers TEXT,
        error_message TEXT,
        deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (template_id) REFERENCES container_templates (id) ON DELETE CASCADE,
        FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )`
    ];
  }

  getIndexStatements() {
    return [
      'CREATE INDEX IF NOT EXISTS idx_servers_name ON servers(name)',
      'CREATE INDEX IF NOT EXISTS idx_servers_host_port ON servers(host, port)',
      'CREATE INDEX IF NOT EXISTS idx_containers_server_id ON containers(server_id)',
      'CREATE INDEX IF NOT EXISTS idx_containers_container_id ON containers(container_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_server_access_user_id ON user_server_access(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_server_access_server_id ON user_server_access(server_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_server_permissions_user_id ON user_server_permissions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_server_permissions_server_id ON user_server_permissions(server_id)',
      'CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address)',
      'CREATE INDEX IF NOT EXISTS idx_login_attempts_locked_until ON login_attempts(locked_until)',
      'CREATE INDEX IF NOT EXISTS idx_server_monitoring_server_id ON server_monitoring(server_id)',
      'CREATE INDEX IF NOT EXISTS idx_server_monitoring_timestamp ON server_monitoring(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_container_monitoring_server_id ON container_monitoring(server_id)',
      'CREATE INDEX IF NOT EXISTS idx_container_monitoring_container_id ON container_monitoring(container_id)',
      'CREATE INDEX IF NOT EXISTS idx_container_monitoring_timestamp ON container_monitoring(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_alerts_server_id ON alerts(server_id)',
      'CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity)',
      'CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(resolved)',
      'CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_operation_logs_user_id ON operation_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_operation_logs_server_id ON operation_logs(server_id)',
      'CREATE INDEX IF NOT EXISTS idx_operation_logs_action ON operation_logs(action)',
      'CREATE INDEX IF NOT EXISTS idx_operation_logs_timestamp ON operation_logs(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_notification_settings_user_id ON user_notification_settings(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_servers_user_id ON user_servers(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_servers_server_id ON user_servers(server_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_containers_user_id ON user_containers(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_containers_container_id ON user_containers(container_id)',
      'CREATE INDEX IF NOT EXISTS idx_container_templates_category ON container_templates(category)',
      'CREATE INDEX IF NOT EXISTS idx_container_templates_public ON container_templates(is_public)',
      'CREATE INDEX IF NOT EXISTS idx_container_templates_created_by ON container_templates(created_by)',
      'CREATE INDEX IF NOT EXISTS idx_template_deployments_template_id ON template_deployments(template_id)',
      'CREATE INDEX IF NOT EXISTS idx_template_deployments_server_id ON template_deployments(server_id)',
      'CREATE INDEX IF NOT EXISTS idx_template_deployments_user_id ON template_deployments(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_template_deployments_status ON template_deployments(status)'
    ];
  }

  async initializeTables() {
    const definitions = this.getTableDefinitions();
    for (const statement of definitions) {
      await this.db.exec(statement);
    }

    const indexes = this.getIndexStatements();
    for (const statement of indexes) {
      await this.db.exec(statement);
    }

    logger.info('数据库表初始化完成');
  }

  generateSecurePassword(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_-+=';
    return Array.from({ length }).map(() => chars[crypto.randomInt(0, chars.length)]).join('');
  }

  async ensureAdminAccount() {
    if (!this.isConnected) {
      throw new Error('数据库未连接');
    }

    const existingAdmin = await this.db.get(
      'SELECT id, username, email FROM users WHERE role = ? LIMIT 1',
      ['admin']
    );

    if (existingAdmin) {
      logger.info(`管理员账户已存在: ${existingAdmin.username} (${existingAdmin.email})`);
      return { created: false, username: existingAdmin.username, email: existingAdmin.email };
    }

    const username = process.env.ADMIN_USERNAME || 'admin';
    const email = process.env.ADMIN_EMAIL || 'admin@ztms.top';
    const password = this.generateSecurePassword(16);
    const passwordHash = await bcrypt.hash(password, 12);
    const isActiveValue = this.client === 'mysql' ? 1 : true;

    await this.db.run(
      `INSERT INTO users (username, email, password_hash, role, is_active)
       VALUES (?, ?, ?, 'admin', ?)`
      , [username, email, passwordHash, isActiveValue]
    );

    logger.warn('系统已创建默认管理员账户，请尽快修改密码');
    logger.warn(`用户名: ${username}`);
    logger.warn(`邮箱: ${email}`);
    logger.warn(`初始密码: ${password}`);

    return { created: true, username, email, password };
  }

  async query(text, params = []) {
    if (!this.isConnected) {
      throw new Error('数据库未连接');
    }

    const prepared = this.prepareQuery(text);
    const isWrite = /^\s*(INSERT|UPDATE|DELETE|REPLACE|UPSERT)/i.test(prepared);

    if (isWrite) {
      const result = await this.db.run(prepared, params);
      return {
        rows: [],
        rowCount: result?.changes ?? 0,
        lastID: result?.lastID ?? null
      };
    }

    const rows = await this.db.all(prepared, params);
    return {
      rows,
      rowCount: rows.length
    };
  }

  async queryOne(text, params = []) {
    if (!this.isConnected) {
      throw new Error('数据库未连接');
    }

    const prepared = this.prepareQuery(text);
    const row = await this.db.get(prepared, params);

    return {
      rows: row ? [row] : [],
      rowCount: row ? 1 : 0
    };
  }

  async transaction(callback) {
    if (!this.isConnected) {
      throw new Error('数据库未连接');
    }

    if (this.client === 'mysql') {
      const connection = await this.mysqlPool.getConnection();
      const transactionalWrapper = this.createMySQLWrapper(connection);
      const originalDb = this.db;

      try {
        await connection.beginTransaction();
        this.db = transactionalWrapper;
        const result = await callback(this);
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        this.db = originalDb;
        connection.release();
      }
    } else {
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
  }

  async disconnect() {
    if (!this.isConnected) {
      return;
    }

    if (this.client === 'mysql' && this.mysqlPool) {
      await this.mysqlPool.end();
      this.mysqlPool = null;
    }

    if (this.client === 'sqlite' && this.sqliteDb) {
      await this.sqliteDb.close();
      this.sqliteDb = null;
    }

    this.db = null;
    this.isConnected = false;
    logger.info(`${this.client === 'mysql' ? 'MySQL' : 'SQLite'} 数据库连接已关闭`);
  }

  getDatabase() {
    return this.db;
  }

  async getStats() {
    try {
      const userCountRow = await this.db.get('SELECT COUNT(*) as count FROM users');
      const serverCountRow = await this.db.get('SELECT COUNT(*) as count FROM servers WHERE is_active = 1');
      const containerCountRow = await this.db.get('SELECT COUNT(*) as count FROM containers');

      return {
        users: Number(userCountRow?.count ?? 0),
        servers: Number(serverCountRow?.count ?? 0),
        containers: Number(containerCountRow?.count ?? 0),
        client: this.client,
        database: this.client === 'sqlite'
          ? this.dbPath
          : `${this.mysqlConfig?.host ?? ''}/${this.mysqlConfig?.database ?? ''}`,
        isConnected: this.isConnected
      };
    } catch (error) {
      logger.error('获取数据库统计信息失败:', error);
      return null;
    }
  }
}

export default new Database();
