import { Telegraf, Markup } from 'telegraf';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import logger from '../utils/logger.js';
import database from '../config/database.js';

class TelegramBotService {
  constructor() {
    this.bot = null;
    this.isInitialized = false;
    this.verificationCodes = new Map(); // 存储验证码
    this.startTime = Date.now(); // 记录机器人启动时间
    
    // 配置参数
    this.config = {
      ignoreOldMessages: process.env.TELEGRAM_IGNORE_OLD_MESSAGES === 'true' || false, // 是否忽略旧消息
      maxMessageAge: parseInt(process.env.TELEGRAM_MAX_MESSAGE_AGE) || 300000, // 最大消息年龄（毫秒），默认5分钟
      ignoreOldCallbackQueries: process.env.TELEGRAM_IGNORE_OLD_CALLBACKS === 'true' || true // 是否忽略旧回调查询，默认true
    };
  }

  /**
   * 检查消息是否过期
   * @param {Object} ctx - Telegraf上下文
   * @returns {boolean} 是否过期
   */
  isMessageExpired(ctx) {
    if (!this.config.ignoreOldMessages && !this.config.ignoreOldCallbackQueries) {
      return false; // 如果配置为不忽略旧消息，则不过期
    }

    const now = Date.now();
    let messageTime = null;

    // 检查回调查询
    if (ctx.callbackQuery) {
      messageTime = ctx.callbackQuery.message?.date * 1000; // Telegram时间戳是秒，转换为毫秒
    }
    // 检查普通消息
    else if (ctx.message) {
      messageTime = ctx.message.date * 1000;
    }

    if (!messageTime) {
      return false; // 无法确定消息时间，不过期
    }

    const age = now - messageTime;
    const isExpired = age > this.config.maxMessageAge;

    if (isExpired) {
      logger.warn(`消息已过期: 年龄 ${Math.round(age / 1000)}秒, 最大允许 ${Math.round(this.config.maxMessageAge / 1000)}秒`);
    }

    return isExpired;
  }

  async initialize() {
    try {
      // 设置全局未处理Promise拒绝处理
      process.on('unhandledRejection', (reason, promise) => {
        if (this.isNetworkError(reason)) {
          logger.warn('检测到未处理的网络错误Promise拒绝，已忽略:', reason.message);
          return;
        }
        logger.error('未处理的 Promise 拒绝:', reason);
      });

      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token || token === 'your_telegram_bot_token_here') {
        logger.warn('TELEGRAM_BOT_TOKEN 未设置或为占位符，跳过 Telegram 机器人初始化');
        return;
      }

      // 如果已有机器人实例，先停止
      if (this.bot) {
        logger.info('检测到现有机器人实例，正在停止...');
        await this.stop();
      }

      // 确保数据库连接
      await database.connect();
      if (!database.isConnected) {
        logger.error('Telegram Bot 服务数据库连接失败');
        return;
      }

      // 配置代理
      const proxyUrl = process.env.TGBOT_PROXY;
      let agent = null;
      
      if (proxyUrl) {
        logger.info(`使用代理连接 Telegram: ${proxyUrl}`);
        
        try {
          // 根据代理类型创建相应的代理代理
          if (proxyUrl.startsWith('socks5://') || proxyUrl.startsWith('socks4://')) {
            const { SocksProxyAgent } = await import('socks-proxy-agent');
            agent = new SocksProxyAgent(proxyUrl);
            logger.info('使用 SOCKS 代理');
          } else if (proxyUrl.startsWith('http://') || proxyUrl.startsWith('https://')) {
            const { HttpsProxyAgent } = await import('https-proxy-agent');
            agent = new HttpsProxyAgent(proxyUrl);
            logger.info('使用 HTTP 代理');
          } else {
            logger.warn('不支持的代理协议，支持的协议: http, https, socks4, socks5');
          }
        } catch (importError) {
          logger.error('导入代理模块失败:', importError.message);
          logger.warn('请确保已安装代理依赖: npm install https-proxy-agent socks-proxy-agent');
        }
      }

      // 创建 Telegraf 实例
      if (agent) {
        this.bot = new Telegraf(token, {
          telegram: {
            agent: agent
          }
        });
      } else {
        this.bot = new Telegraf(token);
      }
      this.setupEventHandlers();
      this.isInitialized = true;
      
      // 设置机器人命令
      await this.setupBotCommands();
      
      // 启动机器人，添加重试机制
      await this.launchWithRetry();
      
      if (this.isInitialized) {
        logger.info('Telegram 机器人初始化成功');
        if (proxyUrl) {
          logger.info(`通过代理 ${proxyUrl} 连接成功`);
        }
      }
    } catch (error) {
      logger.error('Telegram 机器人初始化失败:', error);
      this.isInitialized = false;
      this.bot = null;
      // 不抛出错误，让服务器继续运行
    }
  }

  /**
   * 带重试机制的启动方法
   */
  async launchWithRetry(maxRetries = 3, retryDelay = 5000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`尝试启动 Telegram 机器人 (第 ${attempt}/${maxRetries} 次)`);
        
        await this.bot.launch();
        this.isInitialized = true;
        logger.info('Telegram 机器人启动成功');
        
        if (process.env.TGBOT_PROXY) {
          logger.info(`通过代理 ${process.env.TGBOT_PROXY} 连接成功`);
        }
        
        return; // 启动成功，退出重试循环
        
      } catch (error) {
        logger.error(`Telegram 机器人启动失败 (第 ${attempt}/${maxRetries} 次):`, error);
        
        // 检查是否是409冲突错误
        if (error.message && error.message.includes('409')) {
          logger.warn('检测到机器人实例冲突，等待其他实例停止...');
          
          if (attempt < maxRetries) {
            logger.info(`等待 ${retryDelay}ms 后重试...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            retryDelay *= 2; // 指数退避
            continue;
          }
        }
        
        // 如果是最后一次尝试，记录错误但不抛出
        if (attempt === maxRetries) {
          logger.error('Telegram 机器人启动失败，已达到最大重试次数');
          this.isInitialized = false;
          this.bot = null;
          return;
        }
        
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryDelay *= 2; // 指数退避
      }
    }
  }

  /**
   * 停止机器人
   */
  async stop() {
    try {
      if (this.bot) {
        logger.info('正在停止 Telegram 机器人...');
        await this.bot.stop();
        this.bot = null;
        this.isInitialized = false;
        logger.info('Telegram 机器人已停止');
      }
    } catch (error) {
      logger.error('停止 Telegram 机器人时出错:', error);
    }
  }

  setupEventHandlers() {
    // 处理 /start 命令
    this.bot.start(async (ctx) => {
      await this.handleStartCommand(ctx);
    });

    // 处理错误
    this.bot.catch((err, ctx) => {
      logger.error('Telegram 机器人错误:', err);
      
      // 检查是否是网络连接错误
      if (this.isNetworkError(err)) {
        logger.warn('检测到网络连接错误，跳过回复以避免循环错误');
        return;
      }
      
      // 尝试发送错误消息，如果失败则忽略
      this.safeReply(ctx, '抱歉，发生了错误，请稍后重试').catch(replyErr => {
        logger.error('发送错误消息失败:', replyErr);
      });
    });
  }

  async handleStartCommand(ctx) {
    try {
      const userId = ctx.from.id;
      const username = ctx.from.username || ctx.from.first_name;

      const welcomeMessage = 
        `欢迎 ${username}！\n\n` +
        'Docker Manager 机器人\n\n' +
        '点击下方按钮打开 Web 应用进行管理';

      const webAppUrl = process.env.TELEGRAM_WEBAPP_URL || 'https://localhost:3000/telegram-webapp';

      await ctx.reply(welcomeMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{
              text: '🌐 打开 Docker Manager',
              web_app: { url: webAppUrl }
            }]
          ]
        }
      });

    } catch (error) {
      logger.error('处理 /start 命令失败:', error);
      await this.safeReply(ctx, '抱歉，发生了错误，请稍后重试');
    }
  }

  // 辅助方法：安全发送消息，带重试机制
  async safeReply(ctx, message, options = {}) {
    if (!ctx || !ctx.reply) {
      logger.warn('无法发送消息：上下文无效');
      return false;
    }

    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        await ctx.reply(message, options);
        return true;
      } catch (error) {
        retryCount++;
        
        if (this.isNetworkError(error)) {
          logger.warn(`网络错误，重试 ${retryCount}/${maxRetries}:`, error.message);
          
          if (retryCount < maxRetries) {
            // 等待一段时间后重试
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            continue;
          } else {
            logger.error('达到最大重试次数，放弃发送消息');
            return false;
          }
        } else {
          logger.error('发送消息失败:', error);
          return false;
        }
      }
    }
    
    return false;
  }

  // 辅助方法：检查是否是网络连接错误
  isNetworkError(error) {
    if (!error || !error.message) return false;
    
    const networkErrors = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'EHOSTUNREACH',
      'ETIMEDOUT',
      'ECONNRESET',
      'ENETUNREACH',
      'ECONNABORTED',
      'Connection refused',
      'Network is unreachable',
      'No route to host',
      'connect ECONNREFUSED',
      'request to https://api.telegram.org',
      'FetchError'
    ];
    
    return networkErrors.some(errorType => 
      error.message.includes(errorType)
    );
  }

  async getUserByTelegramId(telegramId) {
    try {
      // 确保数据库连接
      if (!database.isConnected) {
        await database.connect();
      }
      
      // 确保 telegramId 是字符串类型
      const telegramIdStr = String(telegramId);
      
      const user = await database.db.get(
        'SELECT * FROM users WHERE telegram_id = ? AND (is_active = 1 OR is_active = true)',
        [telegramIdStr]
      );
      
      return user || null;
    } catch (error) {
      logger.error('获取用户失败:', error);
      return null;
    }
  }

  async sendNotification(telegramId, message) {
    try {
      if (!this.isInitialized || !this.bot) {
        logger.warn('Telegram 机器人未初始化，无法发送通知');
        return false;
      }

      await this.bot.telegram.sendMessage(telegramId, message);
      logger.info(`向用户 ${telegramId} 发送通知成功`);
      return true;
    } catch (error) {
      logger.error('发送 Telegram 通知失败:', error);
      return false;
    }
  }

  // 生成6位随机验证码
  generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // 发送验证码给用户
  async sendVerificationCode(telegramId, username) {
    try {
      if (!this.bot || !this.isInitialized) {
        throw new Error('Telegram 机器人未初始化');
      }

      const code = this.generateVerificationCode();
      const expiresAt = Date.now() + 5 * 60 * 1000; // 5分钟后过期

      // 存储验证码
      this.verificationCodes.set(telegramId, {
        code,
        expiresAt,
        attempts: 0
      });

      // 发送验证码消息
      await this.bot.telegram.sendMessage(
        telegramId,
        `🔐 绑定验证码\n\n` +
        `您的验证码是: \`${code}\`\n\n` +
        `验证码将在 5 分钟后过期，请及时使用\n\n` +
        `如果您没有请求此验证码，请忽略此消息`,
        { parse_mode: 'Markdown' }
      );

      logger.info(`验证码已发送给用户 ${username} (${telegramId})`);
      return { success: true, code };
    } catch (error) {
      logger.error(`发送验证码失败 (${telegramId}):`, error);
      
      // 检查是否是用户未私信机器人的错误
      if (error.message.includes('chat not found') || 
          error.message.includes('bot was blocked') ||
          error.message.includes('user is deactivated')) {
        return { 
          success: false, 
          error: 'SEND_FAILED',
          message: '无法发送验证码，请先私信机器人或确保机器人未被阻止'
        };
      }
      
      return { 
        success: false, 
        error: 'UNKNOWN_ERROR',
        message: '发送验证码失败，请稍后重试'
      };
    }
  }

  // 验证验证码
  verifyCode(telegramId, inputCode) {
    const stored = this.verificationCodes.get(telegramId);
    
    if (!stored) {
      return { success: false, message: '验证码不存在或已过期' };
    }

    if (Date.now() > stored.expiresAt) {
      this.verificationCodes.delete(telegramId);
      return { success: false, message: '验证码已过期' };
    }

    if (stored.attempts >= 3) {
      this.verificationCodes.delete(telegramId);
      return { success: false, message: '验证码尝试次数过多，请重新获取' };
    }

    if (stored.code !== inputCode) {
      stored.attempts++;
      return { success: false, message: '验证码错误' };
    }

    // 验证成功，删除验证码
    this.verificationCodes.delete(telegramId);
    return { success: true, message: '验证成功' };
  }

  // 清理过期的验证码
  cleanupExpiredCodes() {
    const now = Date.now();
    for (const [telegramId, data] of this.verificationCodes.entries()) {
      if (now > data.expiresAt) {
        this.verificationCodes.delete(telegramId);
      }
    }
  }

  /**
   * 获取Telegram用户信息
   * @param {string} telegramId - Telegram用户ID
   * @returns {Promise<Object>} 用户信息
   */
  async getTelegramUserInfo(telegramId) {
    try {
      if (!this.bot || !this.isInitialized) {
        throw new Error('Telegram 机器人未初始化');
      }

      const userInfo = await this.bot.telegram.getChat(telegramId);
      
      return {
        id: userInfo.id,
        username: userInfo.username,
        firstName: userInfo.first_name,
        lastName: userInfo.last_name,
        displayName: userInfo.username ? `@${userInfo.username}` : 
                     (userInfo.first_name ? `${userInfo.first_name}${userInfo.last_name ? ' ' + userInfo.last_name : ''}` : 'Unknown')
      };
    } catch (error) {
      logger.error('获取Telegram用户信息失败:', error);
      return {
        id: telegramId,
        username: null,
        firstName: null,
        lastName: null,
        displayName: `ID: ${telegramId}`
      };
    }
  }

  /**
   * 获取机器人信息
   * @returns {Promise<Object>} 机器人信息
   */
  async getBotInfo() {
    try {
      if (!this.bot || !this.isInitialized) {
        throw new Error('Telegram 机器人未初始化');
      }

      const botInfo = await this.bot.telegram.getMe();
      
      return {
        id: botInfo.id,
        username: botInfo.username,
        firstName: botInfo.first_name,
        canJoinGroups: botInfo.can_join_groups,
        canReadAllGroupMessages: botInfo.can_read_all_group_messages,
        supportsInlineQueries: botInfo.supports_inline_queries
      };
    } catch (error) {
      logger.error('获取机器人信息失败:', error);
      return {
        id: null,
        username: null,
        firstName: null,
        canJoinGroups: false,
        canReadAllGroupMessages: false,
        supportsInlineQueries: false
      };
    }
  }

  /**
   * 设置机器人命令和描述
   */
  async setupBotCommands() {
    try {
      if (!this.bot || !this.isInitialized) {
        logger.warn('Telegram 机器人未初始化，跳过设置机器人命令');
        return;
      }

      // 先清理所有现有命令
      await this.bot.telegram.deleteMyCommands();
      logger.info('✅ 已清理现有机器人命令');

      // 注册新的机器人命令
      const commands = [
        { command: 'start', description: '开始使用机器人' }
      ];

      await this.bot.telegram.setMyCommands(commands);
      logger.info('✅ 机器人命令注册成功');
    } catch (error) {
      logger.error('设置机器人命令失败:', error);
    }
  }

  // 转义Markdown特殊字符
  escapeMarkdown(text) {
    if (!text) return '';
    
    return text.toString()
      .replace(/\\/g, '\\\\')  // 反斜杠
      .replace(/\*/g, '\\*')   // 星号
      .replace(/_/g, '\\_')    // 下划线
      .replace(/\[/g, '\\[')   // 左方括号
      .replace(/\]/g, '\\]')   // 右方括号
      .replace(/\(/g, '\\(')   // 左圆括号
      .replace(/\)/g, '\\)')   // 右圆括号
      .replace(/~/g, '\\~')    // 波浪号
      .replace(/`/g, '\\`')    // 反引号
      .replace(/>/g, '\\>')    // 大于号
      .replace(/#/g, '\\#')    // 井号
      .replace(/\+/g, '\\+')   // 加号
      .replace(/=/g, '\\=')    // 等号
      .replace(/\|/g, '\\|')   // 竖线
      .replace(/\{/g, '\\{')   // 左花括号
      .replace(/\}/g, '\\}')   // 右花括号
      .replace(/!/g, '\\!');   // 感叹号
  }

}

export default new TelegramBotService();