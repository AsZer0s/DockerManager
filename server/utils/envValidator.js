import crypto from 'crypto';
import logger from './logger.js';

/**
 * 环境变量验证器
 * 确保所有必需的环境变量都已设置且格式正确
 */
class EnvValidator {
  constructor() {
    this.requiredVars = [
      'JWT_SECRET',
      'ENCRYPTION_KEY'
    ];
    
    this.optionalVars = [
      'TELEGRAM_BOT_TOKEN',
      'DATABASE_PATH',
      'NODE_ENV',
      'PORT',
      'LOG_LEVEL',
      'MONITORING_INTERVAL'
    ];
  }

  /**
   * 验证所有环境变量
   */
  validate() {
    logger.info('🔍 开始验证环境变量...');
    
    const errors = [];
    const warnings = [];

    // 检查是否需要自动生成密钥
    this.autoGenerateKeysIfNeeded();

    // 验证必需变量
    for (const varName of this.requiredVars) {
      const value = process.env[varName];
      
      if (!value) {
        errors.push(`❌ 缺少必需的环境变量: ${varName}`);
        continue;
      }

      // 特定验证
      const validationResult = this.validateSpecificVar(varName, value);
      if (validationResult.error) {
        errors.push(`❌ ${varName}: ${validationResult.error}`);
      }
      if (validationResult.warning) {
        warnings.push(`⚠️ ${varName}: ${validationResult.warning}`);
      }
    }

    // 验证可选变量
    for (const varName of this.optionalVars) {
      const value = process.env[varName];
      
      if (value) {
        const validationResult = this.validateSpecificVar(varName, value);
        if (validationResult.error) {
          errors.push(`❌ ${varName}: ${validationResult.error}`);
        }
        if (validationResult.warning) {
          warnings.push(`⚠️ ${varName}: ${validationResult.warning}`);
        }
      }
    }

    // 输出结果
    if (warnings.length > 0) {
      logger.warn('环境变量警告:');
      warnings.forEach(warning => logger.warn(warning));
    }

    if (errors.length > 0) {
      logger.error('环境变量验证失败:');
      errors.forEach(error => logger.error(error));
      throw new Error(`环境变量验证失败: ${errors.length} 个错误`);
    }

    logger.info('✅ 环境变量验证通过');
    return true;
  }

  /**
   * 自动生成密钥（如果需要）
   */
  autoGenerateKeysIfNeeded() {
    const needsGeneration = [
      { key: 'JWT_SECRET', length: 32 },
      { key: 'ENCRYPTION_KEY', length: 16 }
    ];

    let generated = false;

    needsGeneration.forEach(({ key, length }) => {
      const value = process.env[key];
      
      // 如果值为空或者是占位符，则自动生成
      if (!value || 
          value === 'auto-generated-will-be-set-by-container' ||
          value.includes('your_') || 
          value.includes('example') ||
          value === 'Zer0Teams' ||
          value === 'DockerManager_PoweredByZer0Teams') {
        
        const newValue = key === 'ENCRYPTION_KEY' 
          ? crypto.randomBytes(length).toString('hex')
          : crypto.randomBytes(length).toString('hex');
        
        process.env[key] = newValue;
        logger.info(`🔑 自动生成 ${key}: ${newValue.substring(0, 8)}...`);
        generated = true;
      }
    });

    if (generated) {
      logger.info('✅ 已自动生成安全密钥');
    }
  }

  /**
   * 验证特定环境变量
   */
  validateSpecificVar(varName, value) {
    const result = { error: null, warning: null };

    switch (varName) {
      case 'JWT_SECRET':
        if (value.length < 32) {
          result.error = 'JWT_SECRET 长度应至少为32个字符';
        } else if (value === 'Zer0Teams' || (value.includes('your_') && !value.includes('auto-generated'))) {
          result.error = 'JWT_SECRET 不能使用默认值，请生成强随机密钥';
        }
        break;

      case 'ENCRYPTION_KEY':
        if (value.length !== 32) {
          result.error = 'ENCRYPTION_KEY 必须是32个字符长';
        } else if (!/^[0-9a-fA-F]+$/.test(value)) {
          result.error = 'ENCRYPTION_KEY 必须是十六进制字符串';
        } else if (value === 'DockerManager_PoweredByZer0Teams' || (value.includes('your_') && !value.includes('auto-generated'))) {
          result.error = 'ENCRYPTION_KEY 不能使用默认值，请生成随机密钥';
        }
        break;

      case 'TELEGRAM_BOT_TOKEN':
        if (!/^\d+:[A-Za-z0-9_-]+$/.test(value)) {
          result.error = 'TELEGRAM_BOT_TOKEN 格式无效';
        } else if (value.includes('your_') || value.includes('example')) {
          result.warning = 'TELEGRAM_BOT_TOKEN 似乎是占位符，请设置真实的Bot Token';
        }
        break;

      case 'NODE_ENV':
        if (!['development', 'production', 'test'].includes(value)) {
          result.warning = 'NODE_ENV 应该是 development, production 或 test';
        }
        break;

      case 'PORT':
        const port = parseInt(value);
        if (isNaN(port) || port < 1 || port > 65535) {
          result.error = 'PORT 必须是1-65535之间的数字';
        }
        break;

      case 'LOG_LEVEL':
        if (!['error', 'warn', 'info', 'debug'].includes(value)) {
          result.warning = 'LOG_LEVEL 应该是 error, warn, info 或 debug';
        }
        break;

      case 'MONITORING_INTERVAL':
        const interval = parseInt(value);
        if (isNaN(interval) || interval < 1000) {
          result.error = 'MONITORING_INTERVAL 必须是大于1000的数字(毫秒)';
        }
        break;
    }

    return result;
  }

  /**
   * 生成安全的环境变量值
   */
  generateSecureValues() {
    const values = {
      JWT_SECRET: crypto.randomBytes(32).toString('hex'),
      ENCRYPTION_KEY: crypto.randomBytes(16).toString('hex'),
      SESSION_SECRET: crypto.randomBytes(32).toString('hex')
    };

    logger.info('🔑 生成的安全环境变量值:');
    Object.entries(values).forEach(([key, value]) => {
      logger.info(`${key}=${value}`);
    });

    return values;
  }

  /**
   * 检查是否使用了不安全的默认值
   */
  checkForInsecureDefaults() {
    const insecureDefaults = [
      'Zer0Teams',
      'DockerManager_PoweredByZer0Teams',
      'your_telegram_bot_token_here',
      'your_jwt_secret_key_here',
      'your_32_character_hex_encryption_key'
    ];

    const foundDefaults = [];
    
    Object.entries(process.env).forEach(([key, value]) => {
      if (insecureDefaults.some(defaultVal => value && value.includes(defaultVal))) {
        foundDefaults.push(key);
      }
    });

    if (foundDefaults.length > 0) {
      logger.error('🚨 发现不安全的默认值:');
      foundDefaults.forEach(key => {
        logger.error(`  - ${key} 使用了默认值，请更改为安全的随机值`);
      });
      return false;
    }

    return true;
  }
}

export default new EnvValidator();