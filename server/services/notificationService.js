import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';
import database from '../config/database.js';
import telegramBot from './telegramBot.js';

class NotificationService {
  constructor() {
    this.smtpTransporter = null;
    this.smtpConfig = null;
    this.lastConfigCheck = 0;
    this.configCacheTimeout = 300000; // 5分钟缓存
  }

  /**
   * 获取SMTP配置
   * 优先级：数据库配置 > 环境变量 > 默认值
   */
  async getSMTPConfig() {
    const now = Date.now();
    
    // 如果缓存未过期，直接返回缓存配置
    if (this.smtpConfig && (now - this.lastConfigCheck) < this.configCacheTimeout) {
      return this.smtpConfig;
    }

    try {
      // 首先尝试从数据库获取配置
      const result = await database.query(
        'SELECT settings FROM system_settings WHERE key = ?',
        ['smtp_config']
      );

      if (result.rows.length > 0) {
        const dbConfig = JSON.parse(result.rows[0].settings);
        this.smtpConfig = {
          host: dbConfig.host,
          port: dbConfig.port,
          secure: dbConfig.secure || false,
          auth: {
            user: dbConfig.user,
            pass: dbConfig.pass
          },
          from: dbConfig.from || process.env.SMTP_FROM || 'Docker Manager <noreply@dockermanager.com>'
        };
      } else {
        // 使用环境变量配置
        this.smtpConfig = {
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          },
          from: process.env.SMTP_FROM || 'Docker Manager <noreply@dockermanager.com>'
        };
      }

      this.lastConfigCheck = now;
      return this.smtpConfig;
    } catch (error) {
      logger.error('获取SMTP配置失败:', error);
      return null;
    }
  }

  /**
   * 初始化SMTP传输器
   */
  async initializeSMTP() {
    try {
      const config = await this.getSMTPConfig();
      if (!config || !config.auth.user || !config.auth.pass) {
        logger.warn('SMTP配置不完整，无法发送邮件');
        return false;
      }

      this.smtpTransporter = nodemailer.createTransport(config);
      
      // 验证连接
      await this.smtpTransporter.verify();
      logger.info('SMTP连接验证成功');
      return true;
    } catch (error) {
      logger.error('SMTP初始化失败:', error);
      return false;
    }
  }

  /**
   * 发送邮件通知
   */
  async sendEmail(to, subject, content, isHtml = true) {
    try {
      if (!this.smtpTransporter) {
        const initialized = await this.initializeSMTP();
        if (!initialized) {
          throw new Error('SMTP未正确初始化');
        }
      }

      const config = await this.getSMTPConfig();
      const mailOptions = {
        from: config.from,
        to: to,
        subject: subject,
        [isHtml ? 'html' : 'text']: content
      };

      const result = await this.smtpTransporter.sendMail(mailOptions);
      logger.info(`邮件发送成功: ${to}, MessageId: ${result.messageId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      logger.error('邮件发送失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 发送Telegram通知
   */
  async sendTelegram(chatId, message) {
    try {
      if (!telegramBot || !telegramBot.bot) {
        logger.warn('Telegram Bot未初始化');
        return { success: false, error: 'Telegram Bot未初始化' };
      }

      await telegramBot.bot.telegram.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });

      logger.info(`Telegram消息发送成功: ${chatId}`);
      return { success: true };
    } catch (error) {
      logger.error('Telegram消息发送失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 发送浏览器通知（通过WebSocket）
   */
  async sendBrowserNotification(userId, notification) {
    try {
      // 这里需要WebSocket连接，暂时记录日志
      logger.info(`浏览器通知发送给用户 ${userId}:`, notification);
      
      // TODO: 实现WebSocket通知
      // 可以通过Socket.IO向特定用户发送通知
      
      return { success: true };
    } catch (error) {
      logger.error('浏览器通知发送失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取用户通知设置
   */
  async getNotificationSettings(userId) {
    try {
      const result = await database.query(
        'SELECT settings FROM user_notification_settings WHERE user_id = ?',
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return JSON.parse(result.rows[0].settings);
    } catch (error) {
      logger.error('获取用户通知设置失败:', error);
      return null;
    }
  }

  /**
   * 发送通知（统一接口）
   */
  async sendNotification(userId, type, message, options = {}) {
    try {
      const settings = await this.getNotificationSettings(userId);
      if (!settings) {
        logger.warn(`用户 ${userId} 没有通知设置`);
        return { success: false, error: '用户没有通知设置' };
      }

      const results = [];

      // 发送邮件通知
      if (settings.emailNotifications && settings.emailAddress) {
        const emailResult = await this.sendEmail(
          settings.emailAddress,
          options.subject || `Docker Manager ${type}通知`,
          this.formatEmailContent(type, message, options)
        );
        results.push({ type: 'email', ...emailResult });
      }

      // 发送Telegram通知
      if (settings.telegramNotifications && settings.telegramId) {
        const telegramResult = await this.sendTelegram(
          settings.telegramId,
          this.formatTelegramMessage(type, message, options)
        );
        results.push({ type: 'telegram', ...telegramResult });
      }

      // 发送浏览器通知
      if (settings.browserNotifications) {
        const browserResult = await this.sendBrowserNotification(
          userId,
          {
            type: type,
            message: message,
            timestamp: new Date().toISOString(),
            ...options
          }
        );
        results.push({ type: 'browser', ...browserResult });
      }

      return { success: true, results: results };
    } catch (error) {
      logger.error('发送通知失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 格式化邮件内容
   */
  formatEmailContent(type, message, options = {}) {
    const timestamp = new Date().toLocaleString('zh-CN');
    const serverName = options.serverName || '未知服务器';
    const containerName = options.containerName || '';

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Docker Manager</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">${this.getTypeTitle(type)}</p>
        </div>
        
        <div style="padding: 20px; background: #f8f9fa;">
          <h2 style="color: #333; margin-top: 0;">通知详情</h2>
          <p style="font-size: 16px; line-height: 1.6; color: #555;">${message}</p>
          
          ${serverName !== '未知服务器' ? `
            <div style="margin: 15px 0; padding: 10px; background: #e3f2fd; border-left: 4px solid #2196f3;">
              <strong>服务器:</strong> ${serverName}
            </div>
          ` : ''}
          
          ${containerName ? `
            <div style="margin: 15px 0; padding: 10px; background: #f3e5f5; border-left: 4px solid #9c27b0;">
              <strong>容器:</strong> ${containerName}
            </div>
          ` : ''}
          
          <div style="margin: 15px 0; padding: 10px; background: #fff3e0; border-left: 4px solid #ff9800;">
            <strong>时间:</strong> ${timestamp}
          </div>
        </div>
        
        <div style="padding: 15px; background: #f5f5f5; text-align: center; color: #666; font-size: 12px;">
          <p>此邮件由 Docker Manager 系统自动发送，请勿回复。</p>
        </div>
      </div>
    `;
  }

  /**
   * 格式化Telegram消息
   */
  formatTelegramMessage(type, message, options = {}) {
    const timestamp = new Date().toLocaleString('zh-CN');
    const serverName = options.serverName || '未知服务器';
    const containerName = options.containerName || '';

    let telegramMessage = `🔔 <b>Docker Manager ${this.getTypeTitle(type)}</b>\n\n`;
    telegramMessage += `📝 ${message}\n\n`;
    
    if (serverName !== '未知服务器') {
      telegramMessage += `🖥️ <b>服务器:</b> ${serverName}\n`;
    }
    
    if (containerName) {
      telegramMessage += `🐳 <b>容器:</b> ${containerName}\n`;
    }
    
    telegramMessage += `⏰ <b>时间:</b> ${timestamp}`;

    return telegramMessage;
  }

  /**
   * 获取通知类型标题
   */
  getTypeTitle(type) {
    const titles = {
      'container_event': '容器事件',
      'server_alert': '服务器告警',
      'security_alert': '安全告警',
      'system_alert': '系统监控告警',
      'test': '测试通知'
    };
    return titles[type] || '系统通知';
  }

  /**
   * 测试SMTP连接
   */
  async testSMTPConnection(config) {
    try {
      const transporter = nodemailer.createTransport(config);
      await transporter.verify();
      return { success: true, message: 'SMTP连接测试成功' };
    } catch (error) {
      logger.error('SMTP连接测试失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 保存SMTP配置到数据库
   */
  async saveSMTPConfig(config) {
    try {
      // 加密密码
      const encryption = await import('../utils/encryption.js');
      const encryptedConfig = {
        ...config,
        pass: encryption.default.encrypt(config.pass)
      };

      // 检查是否已存在配置
      const existing = await database.query(
        'SELECT id FROM system_settings WHERE key = ?',
        ['smtp_config']
      );

      if (existing.rows.length > 0) {
        // 更新现有配置
        await database.query(
          'UPDATE system_settings SET settings = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
          [JSON.stringify(encryptedConfig), 'smtp_config']
        );
      } else {
        // 创建新配置
        await database.query(
          'INSERT INTO system_settings (key, settings, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          ['smtp_config', JSON.stringify(encryptedConfig)]
        );
      }

      // 清除缓存，强制重新加载配置
      this.smtpConfig = null;
      this.lastConfigCheck = 0;

      logger.info('SMTP配置保存成功');
      return { success: true };
    } catch (error) {
      logger.error('保存SMTP配置失败:', error);
      return { success: false, error: error.message };
    }
  }
}

export default new NotificationService();
