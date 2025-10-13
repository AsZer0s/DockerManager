import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 创建日志目录
const logDir = path.join(__dirname, '../../logs');

// 自定义日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// 控制台格式
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// 创建基础 logger 实例
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'docker-manager' },
  transports: [
    // 错误日志文件
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // 所有日志文件
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// 模块日志器存储
const moduleLoggers = {};

// 创建模块化日志器
const createModuleLogger = (moduleName) => {
  if (moduleLoggers[moduleName]) {
    return moduleLoggers[moduleName];
  }

  const moduleLogger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: 'docker-manager', module: moduleName },
    transports: [
      // 模块专用日志文件
      new winston.transports.File({
        filename: path.join(logDir, `${moduleName}.log`),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
      // 错误日志文件
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
    ],
  });

  // 开发环境添加控制台输出
  if (process.env.NODE_ENV !== 'production') {
    moduleLogger.add(new winston.transports.Console({
      format: consoleFormat
    }));
  }

  moduleLoggers[moduleName] = moduleLogger;
  return moduleLogger;
};

// 记录HTTP请求的完整信息
const logRequest = (moduleName, req, res, responseTime, responseBody) => {
  const moduleLogger = createModuleLogger(moduleName);
  
  const logData = {
    method: req.method,
    path: req.path,
    url: req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || null,
    requestBody: req.body,
    responseBody: responseBody,
    statusCode: res.statusCode,
    responseTime: responseTime,
    timestamp: new Date().toISOString()
  };

  if (res.statusCode >= 400) {
    moduleLogger.error('HTTP Request Error', logData);
  } else {
    moduleLogger.info('HTTP Request', logData);
  }
};

// 记录错误和堆栈
const logError = (moduleName, error, req = null) => {
  const moduleLogger = createModuleLogger(moduleName);
  
  const logData = {
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  };

  if (req) {
    logData.request = {
      method: req.method,
      path: req.path,
      url: req.url,
      ip: req.ip || req.connection.remoteAddress,
      userId: req.user?.id || null,
      body: req.body
    };
  }

  moduleLogger.error('Application Error', logData);
};

// 开发环境添加控制台输出
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// 生产环境添加控制台输出（仅错误级别）
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.Console({
    level: 'error',
    format: consoleFormat
  }));
}

// 处理未捕获的异常
logger.exceptions.handle(
  new winston.transports.File({
    filename: path.join(logDir, 'exceptions.log')
  })
);

// 处理未处理的 Promise 拒绝
logger.rejections.handle(
  new winston.transports.File({
    filename: path.join(logDir, 'rejections.log')
  })
);

// 导出默认logger和新增的方法
export default logger;
export { createModuleLogger, logRequest, logError };
