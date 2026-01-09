import dotenv from 'dotenv';

dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import logger from './utils/logger.js';
import envValidator from './utils/envValidator.js';
import { helmetConfig, corsConfig } from './config/security.js';
import database from './config/database.js';
import encryption from './utils/encryption.js';
import jwtManager from './utils/jwt.js';
import telegramBot from './services/telegramBot.js';
import monitoringService from './services/monitoringService.js';
import connectionMonitor from './services/connectionMonitor.js';
import alertService from './services/alertService.js';

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
import systemRoutes from './routes/system.js';
import networkRoutes from './routes/network.js';
import imageRoutes from './routes/images.js';
import templateRoutes from './routes/templates.js';
import dockerNetworkRoutes from './routes/networks.js';
import volumeRoutes from './routes/volumes.js';

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

// 优雅关闭处理
process.on('SIGINT', async () => {
  console.log('\n🛑 收到 SIGINT 信号，正在优雅关闭服务器...');
  await gracefulShutdown();
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 收到 SIGTERM 信号，正在优雅关闭服务器...');
  await gracefulShutdown();
});

// 优雅关闭函数
async function gracefulShutdown() {
  try {
    console.log('📡 正在停止 Telegram 机器人...');
    if (telegramBot && telegramBot.stop) {
      await telegramBot.stop();
    }
    
    console.log('🔗 正在关闭 SSH 连接池...');
    const sshConnectionPool = (await import('./services/sshConnectionPool.js')).default;
    await sshConnectionPool.closeAllConnections();
    
    console.log('💾 正在关闭数据库连接...');
    await database.disconnect();
    
    console.log('🔄 正在停止轮询服务...');
    const pollingService = (await import('./services/pollingService.js')).default;
    pollingService.stopPolling();
    
    console.log('✅ 服务器已优雅关闭');
    process.exit(0);
  } catch (error) {
    console.error('❌ 优雅关闭过程中出错:', error);
    process.exit(1);
  }
}

const app = express();

app.set('trust proxy', true);

const server = createServer(app);

// 中间件配置
app.use(helmetConfig);

app.use(cors(corsConfig));

app.use(compression());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 导入并添加请求日志中间件
import requestLogger from './middleware/requestLogger.js';
app.use(requestLogger);

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
app.use('/api/system', systemRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/docker-networks', dockerNetworkRoutes);
app.use('/api/volumes', volumeRoutes);

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
  const client = typeof database.getClientType === 'function'
    ? database.getClientType()
    : (process.env.DB_CLIENT || process.env.DATABASE_CLIENT || 'sqlite').toLowerCase();

  if (client !== 'sqlite') {
    console.log('ℹ️ 当前使用 MySQL 数据库，跳过本地 SQLite 初始化步骤');
    return;
  }

  try {
    console.log('🔧 检查 SQLite 数据库目录...');

    const dbPath = (typeof database.getDatabasePath === 'function' && database.getDatabasePath())
      || process.env.DATABASE_PATH
      || path.join(__dirname, 'data/database.sqlite');

    if (!dbPath) {
      return;
    }

    const fs = await import('fs');
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`📁 已创建数据库目录: ${dbDir}`);
    } else {
      console.log('✅ 数据库目录已存在');
    }
  } catch (error) {
    console.error('❌ 数据库目录检查失败:', error.message);
    throw error;
  }
}

// 初始化服务
async function initializeServices() {
  try {
    console.log('🚀 开始初始化服务...');
    
    // 验证环境变量
    console.log('🔍 验证环境变量...');
    await envValidator.validate();
    envValidator.checkForInsecureDefaults();
    console.log('✅ 环境变量验证通过');
    
    // 检查是否需要初始化数据库和管理员账户
    await initializeDatabase();
    
    // 连接数据库
    console.log('📊 连接数据库...');
    await database.connect();
    console.log('✅ 数据库连接成功');

    if (typeof database.ensureAdminAccount === 'function') {
      const adminInfo = await database.ensureAdminAccount();
      if (adminInfo?.created) {
        console.log('👤 已创建默认管理员账户:');
        console.log(`   用户名: ${adminInfo.username}`);
        console.log(`   邮箱: ${adminInfo.email}`);
        console.log(`   初始密码: ${adminInfo.password}`);
      } else if (adminInfo) {
        console.log(`👤 管理员账户: ${adminInfo.username} (${adminInfo.email})`);
      }
    }

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

    // 初始化 SSH 连接池
    console.log('🔗 初始化 SSH 连接池...');
    const sshConnectionPool = (await import('./services/sshConnectionPool.js')).default;
    sshConnectionPool.initialize();
    console.log('✅ SSH 连接池初始化成功');

    // 初始化 SSH 会话服务
    console.log('🔐 初始化 SSH 会话服务...');
    const sshSessionService = (await import('./services/sshSessionService.js')).default;
    sshSessionService.initialize();
    console.log('✅ SSH 会话服务初始化成功');

    // 初始化统一 WebSocket 服务（替代单独的 SSH WebSocket）
    console.log('🌐 初始化统一 WebSocket 服务...');
    const unifiedWebSocketService = (await import('./services/unifiedWebSocketService.js')).default;
    unifiedWebSocketService.initialize(server);
    console.log('✅ 统一 WebSocket 服务初始化成功');

    // 初始化 Dockerode 管理器
    console.log('🐳 初始化 Dockerode 管理器...');
    const dockerodeManager = (await import('./services/dockerodeManager.js')).default;
    dockerodeManager.initialize();
    console.log('✅ Dockerode 管理器初始化成功');

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

        console.log('🌐 启动网络监控服务...');
        const networkMonitoringService = (await import('./services/networkMonitoringService.js')).default;
        await networkMonitoringService.start();
        console.log('✅ 网络监控服务启动成功');

        console.log('🔍 启动连接监控服务...');
        connectionMonitor.start();
        console.log('✅ 连接监控服务启动成功');

        console.log('🚨 启动告警检查定时任务...');
        const cron = (await import('node-cron')).default;
        
        // 每分钟检查一次告警
        cron.schedule('* * * * *', async () => {
          try {
            await alertService.checkAllServers();
            // 清理过期的告警历史
            alertService.cleanupAlertHistory();
          } catch (error) {
            logger.error('告警检查失败:', error);
          }
        });
        console.log('✅ 告警检查定时任务启动成功');
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
