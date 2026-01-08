/**
 * 安全配置模块
 * 集中管理应用的安全设置
 */

import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

/**
 * 速率限制配置
 */
export const rateLimitConfig = {
  // 登录限制
  login: rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15分钟
    max: 10, // 减少到10次尝试
    message: {
      error: '登录尝试次数过多，请稍后重试'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    trustProxy: false
  }),

  // API 通用限制
  api: rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    message: {
      error: 'API 请求过于频繁，请稍后重试'
    },
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: false
  }),

  // 严格限制 (敏感操作)
  strict: rateLimit({
    windowMs: 5 * 60 * 1000, // 5分钟
    max: 5,
    message: {
      error: '操作过于频繁，请稍后重试'
    },
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: false
  })
};

/**
 * Helmet 安全头配置
 */
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "https://telegram.org"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "https://telegram.org"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false, // 避免与某些功能冲突
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

/**
 * CORS 配置
 */
export const corsConfig = {
  origin: function (origin, callback) {
    // 允许的来源列表
    const allowedOrigins = process.env.CORS_ORIGIN 
      ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
      : ['http://localhost:3000', 'http://127.0.0.1:3000'];
    
    // 在开发环境中允许无来源的请求 (如 Postman)
    if (process.env.NODE_ENV === 'development' && !origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('不被 CORS 策略允许'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count'],
  maxAge: 86400 // 24小时
};

/**
 * JWT 配置
 */
export const jwtConfig = {
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  algorithm: 'HS256',
  issuer: 'docker-manager',
  audience: 'docker-manager-users'
};

/**
 * 密码策略配置
 */
export const passwordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: false,
  maxLength: 128
};

/**
 * 会话配置
 */
export const sessionConfig = {
  secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24小时
  }
};

/**
 * 文件上传安全配置
 */
export const uploadConfig = {
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
  allowedMimeTypes: [
    'text/plain',
    'application/json',
    'application/yaml',
    'application/x-yaml',
    'text/yaml'
  ],
  uploadPath: process.env.UPLOAD_PATH || './uploads'
};

/**
 * 验证密码强度
 */
export function validatePasswordStrength(password) {
  const errors = [];
  
  if (password.length < passwordPolicy.minLength) {
    errors.push(`密码长度至少为 ${passwordPolicy.minLength} 个字符`);
  }
  
  if (password.length > passwordPolicy.maxLength) {
    errors.push(`密码长度不能超过 ${passwordPolicy.maxLength} 个字符`);
  }
  
  if (passwordPolicy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('密码必须包含至少一个大写字母');
  }
  
  if (passwordPolicy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('密码必须包含至少一个小写字母');
  }
  
  if (passwordPolicy.requireNumbers && !/\d/.test(password)) {
    errors.push('密码必须包含至少一个数字');
  }
  
  if (passwordPolicy.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('密码必须包含至少一个特殊字符');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * 生成安全的随机字符串
 */
async function generateSecureToken(length = 32) {
  const crypto = await import('crypto');
  return crypto.default.randomBytes(length).toString('hex');
}

export default {
  rateLimitConfig,
  helmetConfig,
  corsConfig,
  jwtConfig,
  passwordPolicy,
  sessionConfig,
  uploadConfig,
  validatePasswordStrength,
  generateSecureToken
};