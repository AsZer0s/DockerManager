import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { createServer } from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import logger from './utils/logger.js';
import database from './config/database.js';
import encryption from './utils/encryption.js';
import jwtManager from './utils/jwt.js';
import telegramBot from './services/telegramBot.js';
import monitoringService from './services/monitoringService.js';
import connectionMonitor from './services/connectionMonitor.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

// 路由导入
import authRoutes from './routes/auth.js';
import serverRoutes from './routes/servers.js';
import containerRoutes from './routes/containers.js';
import monitoringRoutes from './routes/monitoring.js';
import sshRoutes from './routes/ssh.js';
import telegramRoutes from './routes/telegram.js';
import telegramVerificationRoutes from './routes/telegramVerification.js';
import telegramWebappRoutes from './routes/telegramWebapp.js';
import settingsRoutes from './routes/settings.js';
import userManagementRoutes from './routes/userManagement.js';
import pollingRoutes from './routes/polling.js';
import sshSessionRoutes from './routes/sshSession.js';

dotenv.config();

// 全局错误处理
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:', error.message);
  console.error('错误堆栈:', error.stack);
  logger.error('未捕获的异常:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的 Promise 拒绝:', reason);
  console.error('Promise:', promise);
  logger.error('未处理的 Promise 拒绝:', { reason, promise });
  // 不立即退出，记录错误后继续运行
});

const app = express();

app.set('trust proxy', true);

const server = createServer(app);

// 中间件配置
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://telegram.org"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://telegram.org"],
      objectSrc: ["'none'"]
    }
  }
}));

app.use(cors({
  origin: true, // 允许所有来源
  credentials: true
}));

app.use(compression());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件服务
app.use('/static', express.static('public'));

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/containers', containerRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/ssh', sshRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/telegram-verification', telegramVerificationRoutes);
app.use('/api/telegram-webapp', telegramWebappRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/user-management', userManagementRoutes);
app.use('/api/polling', pollingRoutes);
app.use('/api/ssh-session', sshSessionRoutes);

// 健康检查端点
app.get('/health', async (req, res) => {
  try {
    const healthReport = await connectionMonitor.getHealthReport();
    
    res.json({
      status: healthReport.overall ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0',
      services: healthReport.services
    });
  } catch (error) {
    logger.error('健康检查失败:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// 连接状态端点
app.get('/api/connection-status', async (req, res) => {
  try {
    const healthReport = await connectionMonitor.getHealthReport();
    res.json(healthReport);
  } catch (error) {
    logger.error('获取连接状态失败:', error);
    res.status(500).json({
      error: '获取连接状态失败',
      message: error.message
    });
  }
});

// 手动触发健康检查端点
app.post('/api/health-check', async (req, res) => {
  try {
    await connectionMonitor.triggerHealthCheck();
    res.json({
      message: '健康检查已触发',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('触发健康检查失败:', error);
    res.status(500).json({
      error: '触发健康检查失败',
      message: error.message
    });
  }
});


// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 在生产环境中配置静态文件服务
if (process.env.NODE_ENV === 'production') {
  const staticPath = path.join(__dirname, '../client/dist');
  console.log(`📁 检查静态文件目录: ${staticPath}`);
  
  // 在主应用中配置静态文件服务
  app.use(express.static(staticPath));
  
  // 设置正确的 MIME 类型
  app.use((req, res, next) => {
    if (req.url.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (req.url.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (req.url.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html');
    }
    next();
  });
  
  // 处理 SPA 路由
  app.get('*', (req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
  });
} else {
  // 开发环境：404 处理
  app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });
}

// 初始化数据库和管理员账户
async function initializeDatabase() {
  try {
    console.log('🔧 检查数据库初始化...');
    
    const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data/database.sqlite');
    
    // 确保数据目录存在
    const fs = await import('fs');
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    // 检查数据库文件是否存在
    const dbExists = fs.existsSync(dbPath);
    
    if (!dbExists) {
      console.log('📊 数据库不存在，开始初始化...');
      await createDatabaseSchema(dbPath);
      await createAdminUser(dbPath);
      console.log('✅ 数据库初始化完成');
    } else {
      console.log('✅ 数据库已存在，跳过初始化');
    }
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error.message);
    throw error;
  }
}

// 创建数据库表结构
async function createDatabaseSchema(dbPath) {
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
        telegram_username TEXT,
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
  
  await db.close();
  console.log('✅ 数据库表初始化完成');
}

// 创建管理员账户
async function createAdminUser(dbPath) {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });
  
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
    
    // 从环境变量获取管理员账户信息，如果没有则使用默认值
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@ztms.top';
    
    // 创建管理员用户
    await db.run(`
      INSERT INTO users (username, email, password_hash, role, is_active)
      VALUES (?, ?, ?, ?, ?)
    `, [adminUsername, adminEmail, passwordHash, 'admin', true]);
    
    console.log('✅ 管理员账户创建成功');
    console.log('========================');
    console.log(`用户名: ${adminUsername}`);
    console.log(`邮箱: ${adminEmail}`);
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
}

// 初始化服务
async function initializeServices() {
  try {
    console.log('🚀 开始初始化服务...');
    
    // 检查是否需要初始化数据库和管理员账户
    await initializeDatabase();
    
    // 连接数据库
    console.log('📊 连接数据库...');
    await database.connect();
    console.log('✅ 数据库连接成功');

    // 初始化加密工具
    console.log('🔐 初始化加密工具...');
    encryption.initialize();
    console.log('✅ 加密工具初始化成功');

    // 初始化 JWT 管理器
    console.log('🔑 初始化 JWT 管理器...');
    jwtManager.initialize();
    console.log('✅ JWT 管理器初始化成功');


    // 初始化 HTTP 轮询服务
    console.log('🔄 初始化 HTTP 轮询服务...');
    const pollingService = (await import('./services/pollingService.js')).default;
    pollingService.initialize();
    console.log('✅ HTTP 轮询服务初始化成功');

    // 初始化 SSH 会话服务
    console.log('🔐 初始化 SSH 会话服务...');
    const sshSessionService = (await import('./services/sshSessionService.js')).default;
    sshSessionService.initialize();
    console.log('✅ SSH 会话服务初始化成功');

    // 初始化缓存服务
    console.log('💾 初始化缓存服务...');
    const cacheService = (await import('./services/cacheService.js')).default;
    cacheService.startPolling();
    console.log('✅ 缓存服务初始化成功');

    // 启动服务器
    const PORT = 3000;
    const API_PORT = 3001;
    
    // 在生产环境中，主服务器同时处理 API 和 Web 请求
    if (process.env.NODE_ENV === 'production') {
      server.listen(PORT, () => {
        console.log(`✅ Web 服务器运行在端口 ${PORT}`);
        console.log(`✅ API 服务器运行在端口 ${API_PORT}`);
      });
    } else {
      // 开发环境：只启动 API 服务器
      server.listen(API_PORT, () => {
        console.log(`✅ API 服务器运行在端口 ${API_PORT}`);
      });
    }

    // 延迟启动其他服务，避免阻塞主服务器启动
    setTimeout(async () => {
      try {
        console.log('🤖 启动 Telegram 机器人...');
        await telegramBot.initialize();
        console.log('✅ Telegram 机器人启动成功');

        console.log('📊 启动监控服务...');
        monitoringService.start();
        console.log('✅ 监控服务启动成功');

        console.log('🔍 启动连接监控服务...');
        connectionMonitor.start();
        console.log('✅ 连接监控服务启动成功');
      } catch (error) {
        console.error('⚠️ 辅助服务启动失败:', error.message);
        // 不退出，让主服务器继续运行
      }
    }, 2000);

  } catch (error) {
    console.error('❌ 服务初始化失败:', error.message);
    console.error('错误堆栈:', error.stack);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGTERM', async () => {
  logger.info('收到 SIGTERM 信号，开始优雅关闭...');
  
  try {
    await telegramBot.stop();
    await monitoringService.stop();
    await database.disconnect();
    
    server.close(() => {
      logger.info('服务器已关闭');
      process.exit(0);
    });
  } catch (error) {
    logger.error('关闭服务时出错:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('收到 SIGINT 信号，开始优雅关闭...');
  
  try {
    await telegramBot.stop();
    await monitoringService.stop();
    await database.disconnect();
    
    server.close(() => {
      logger.info('服务器已关闭');
      process.exit(0);
    });
  } catch (error) {
    logger.error('关闭服务时出错:', error);
    process.exit(1);
  }
});

// 启动应用
console.log('🎯 准备启动应用...');
console.log('环境变量检查:');
console.log('- NODE_ENV:', process.env.NODE_ENV);
console.log('- ENCRYPTION_KEY:', process.env.ENCRYPTION_KEY ? `已设置 (长度: ${process.env.ENCRYPTION_KEY.length})` : '未设置');
console.log('- TGBOT_PROXY:', process.env.TGBOT_PROXY ? `已设置 (${process.env.TGBOT_PROXY})` : '未设置');

initializeServices().catch(error => {
  console.error('❌ 应用启动失败:', error.message);
  console.error('错误堆栈:', error.stack);
  process.exit(1);
});
