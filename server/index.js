import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';
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
import websocketService from './services/websocketService.js';

// 路由导入
import authRoutes from './routes/auth.js';
import serverRoutes from './routes/servers.js';
import containerRoutes from './routes/containers.js';
import monitoringRoutes from './routes/monitoring.js';
import sshRoutes from './routes/ssh.js';
import telegramRoutes from './routes/telegram.js';
import telegramWebAppRoutes from './routes/telegramWebApp.js';
import telegramVerificationRoutes from './routes/telegramVerification.js';
import settingsRoutes from './routes/settings.js';
import userManagementRoutes from './routes/userManagement.js';

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
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      `http://localhost:${process.env.PORT || 3000}`,
      `http://127.0.0.1:${process.env.PORT || 3000}`
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// 中间件配置
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

app.use(cors({
  origin: `http://localhost:${process.env.PORT || 3000}`,
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
app.use('/api/telegram-webapp', telegramWebAppRoutes);
app.use('/api/telegram-verification', telegramVerificationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/user-management', userManagementRoutes);

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 处理
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// 初始化服务
async function initializeServices() {
  try {
    console.log('🚀 开始初始化服务...');
    
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

    // 初始化 WebSocket 服务
    console.log('🔌 初始化 WebSocket 服务...');
    websocketService.initialize(io);
    console.log('✅ WebSocket 服务初始化成功');

    // 启动服务器
    const PORT = 3000;
    const API_PORT = 3001;
    
    server.listen(API_PORT, () => {
      console.log(`✅ API 服务器运行在端口 ${API_PORT}`);
    });

    // 启动 Web 服务器
    if (process.env.NODE_ENV === 'production') {
      const webApp = express();
      webApp.use(express.static('../client/dist'));
      webApp.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../client/dist/index.html'));
      });
      
      webApp.listen(PORT, () => {
        console.log(`✅ Web 服务器运行在端口 ${PORT}`);
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
console.log('- ENCRYPTION_KEY length:', process.env.ENCRYPTION_KEY?.length);
console.log('- TGBOT_PROXY:', process.env.TGBOT_PROXY ? `已设置 (${process.env.TGBOT_PROXY})` : '未设置');

initializeServices().catch(error => {
  console.error('❌ 应用启动失败:', error.message);
  console.error('错误堆栈:', error.stack);
  process.exit(1);
});
