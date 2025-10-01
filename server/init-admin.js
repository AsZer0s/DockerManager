#!/usr/bin/env node

import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config();

async function initAdmin() {
  try {
    console.log('🔧 初始化管理员账户...');
    
    const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data/database.sqlite');
    
    // 确保数据目录存在
    const fs = await import('fs');
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    
    // 启用 WAL 模式以提高并发性能
    await db.run('PRAGMA journal_mode = WAL;');
    // 启用外键约束
    await db.run('PRAGMA foreign_keys = ON;');
    // 设置缓存大小
    await db.run('PRAGMA cache_size = -16000;'); // 16MB
    
    // 初始化数据库表
    const schema = `
      CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          telegram_id TEXT UNIQUE,
          telegram_verified BOOLEAN DEFAULT false,
          telegram_verified_at DATETIME,
          avatar VARCHAR(255),
          phone VARCHAR(20),
          bio TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS servers (
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
      );

      CREATE TABLE IF NOT EXISTS containers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          container_id TEXT NOT NULL,
          name TEXT NOT NULL,
          image TEXT,
          status TEXT,
          ports TEXT,
          volumes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      );

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
      );

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
      );

      CREATE TABLE IF NOT EXISTS otp_codes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          code TEXT NOT NULL,
          expires_at DATETIME NOT NULL,
          used BOOLEAN DEFAULT FALSE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS login_attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ip_address VARCHAR(45) NOT NULL,
          failed_attempts INTEGER DEFAULT 1,
          last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP,
          locked_until DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

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
      );

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
      );

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
      );

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
      );

      CREATE TABLE IF NOT EXISTS user_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          settings TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
          UNIQUE(user_id)
      );

      CREATE TABLE IF NOT EXISTS user_notification_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          settings TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
          UNIQUE(user_id)
      );

      CREATE TABLE IF NOT EXISTS user_servers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          server_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
          FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE,
          UNIQUE(user_id, server_id)
      );

      CREATE TABLE IF NOT EXISTS user_containers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          container_id VARCHAR(255) NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
          UNIQUE(user_id, container_id)
      );
    `;
    await db.exec(schema);

    // 创建索引
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)',
      'CREATE INDEX IF NOT EXISTS idx_servers_name ON servers(name)',
      'CREATE INDEX IF NOT EXISTS idx_containers_server_id ON containers(server_id)',
      'CREATE INDEX IF NOT EXISTS idx_containers_container_id ON containers(container_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_server_access_user_id ON user_server_access(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_server_access_server_id ON user_server_access(server_id)',
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
      'CREATE INDEX IF NOT EXISTS idx_user_containers_container_id ON user_containers(container_id)'
    ];
    
    for (const index of indexes) {
      await db.exec(index);
    }
    
    console.log('✅ 数据库表初始化完成');
    
    // 检查是否已有管理员用户
    const result = await db.get('SELECT COUNT(*) as count FROM users WHERE role = ?', ['admin']);
    const adminCount = result.count;
    
    if (adminCount === 0) {
      console.log('👤 创建管理员账户...');
      
      // 生成16位随机密码（数字字母大小写）
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let randomPassword = '';
      for (let i = 0; i < 16; i++) {
        randomPassword += chars.charAt(crypto.randomInt(0, chars.length));
      }
      
      const passwordHash = await bcrypt.hash(randomPassword, 12);
      
      // 创建管理员用户
      await db.run(`
        INSERT INTO users (username, email, password_hash, role, is_active)
        VALUES (?, ?, ?, ?, ?)
      `, ['admin', 'admin@ztms.top', passwordHash, 'admin', true]);
      
      console.log('✅ 管理员账户创建成功');
      console.log('========================');
      console.log(`用户名: admin`);
      console.log(`邮箱: admin@ztms.top`);
      console.log(`密码: ${randomPassword}`);
      console.log('========================');
      console.log('⚠️  请妥善保存此密码！');
    } else {
      console.log('✅ 管理员账户已存在');
      
      // 显示现有管理员信息
      const admin = await db.get('SELECT username, email FROM users WHERE role = ?', ['admin']);
      console.log(`现有管理员: ${admin.username} (${admin.email})`);
    }

    await db.close();
  } catch (error) {
    console.error('❌ 初始化管理员账户失败:', error.message);
    process.exit(1);
  }
}

initAdmin();
