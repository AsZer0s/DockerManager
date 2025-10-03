import { Telegraf, Markup } from 'telegraf';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import logger from '../utils/logger.js';
import database from '../config/database.js';
import dockerService from './dockerService.js';
import monitoringService from './monitoringService.js';

class TelegramBotService {
  constructor() {
    this.bot = null;
    this.isInitialized = false;
    this.userSessions = new Map(); // 存储用户会话状态
    this.verificationCodes = new Map(); // 存储验证码
    this.startTime = Date.now(); // 记录机器人启动时间
    this.registeredButtons = new Map(); // 存储注册的按钮
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
        this.registerDefaultButtons();
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
        
        // 根据代理类型创建相应的代理代理
        if (proxyUrl.startsWith('socks5://') || proxyUrl.startsWith('socks4://')) {
          agent = new SocksProxyAgent(proxyUrl);
          logger.info('使用 SOCKS 代理');
        } else if (proxyUrl.startsWith('http://') || proxyUrl.startsWith('https://')) {
          agent = new HttpsProxyAgent(proxyUrl);
          logger.info('使用 HTTP 代理');
        } else {
          logger.warn('不支持的代理协议，支持的协议: http, https, socks4, socks5');
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
      this.registerDefaultButtons(); // 注册默认按钮
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

    // 处理 /help 命令
    this.bot.help(async (ctx) => {
      await this.handleHelpCommand(ctx);
    });

    // 处理 /servers 命令
    this.bot.command('servers', async (ctx) => {
      await this.handleServersCommand(ctx);
    });

    // 处理 /containers 命令
    this.bot.command('containers', async (ctx) => {
      await this.handleContainersCommand(ctx);
    });

    // 处理 /status 命令
    this.bot.command('status', async (ctx) => {
      await this.handleStatusCommand(ctx);
    });

    // 处理回调查询
    this.bot.on('callback_query', async (ctx) => {
      await this.handleCallbackQuery(ctx);
    });

    // 处理文本消息
    this.bot.on('text', async (ctx) => {
      await this.handleTextMessage(ctx);
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

      // 检查用户是否已注册
      const user = await this.getUserByTelegramId(userId);
      
      if (!user) {
        await ctx.reply(
          `欢迎 ${username}！\n\n` +
          '您需要先在 DockerManager 中注册并绑定 Telegram ID 才能使用此机器人\n\n' +
          `您的 Telegram ID 是: \`${userId}\`\n\n` +
          '请访问 DockerManager 完成注册和绑定',
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{
                  text: '🌐 打开 Web App',
                  web_app: { url: process.env.TELEGRAM_WEBAPP_URL || 'https://ztms.top/telegram-webapp' }
                }]
              ]
            }
          }
        );
        return;
      }

      const welcomeMessage = 
        `欢迎回来，${user.username}！\n\n` +
        'Docker Manager 机器人已就绪\n\n' +
        '随时为您提供服务';

      // 使用标准回复键盘
      await ctx.reply(welcomeMessage, this.getStandardKeyboard());

    } catch (error) {
      logger.error('处理 /start 命令失败:', error);
      await this.safeReply(ctx, '抱歉，发生了错误，请稍后重试');
    }
  }

  async handleHelpCommand(ctx) {
    try {
      const helpMessage = 
        '🤖 **Docker Manager 机器人帮助**\n\n' +
        '📋 **可用功能：**\n' +
        '• 📊 服务器管理 - 查看和管理服务器状态\n' +
        '• 🐳 容器管理 - 查看和管理Docker容器\n' +
        '• 🌐 在线监控 - 打开Web应用进行详细监控\n' +
        '• ❓ 帮助菜单 - 查看此帮助信息\n\n' +
        '💡 **使用提示：**\n' +
        '• 点击下方按钮快速访问功能\n' +
        '• 使用内联按钮进行具体操作\n' +
        '• 支持搜索和筛选功能\n\n' +
        '🔧 **技术支持：**\n' +
        '如有问题请联系管理员';

      await ctx.reply(helpMessage, { 
        parse_mode: 'Markdown',
        ...this.getStandardKeyboard()
      });
    } catch (error) {
      logger.error('处理 /help 命令失败:', error);
      await this.safeReply(ctx, '抱歉，发生了错误，请稍后重试');
    }
  }

  async handleServersCommand(ctx) {
    try {
      const userId = ctx.from.id;
      const user = await this.getUserByTelegramId(userId);
      
      if (!user) {
        await ctx.reply('请先在 Web 界面中注册并绑定 Telegram ID');
        return;
      }

      const servers = await this.getUserServers(user.id);
      
      if (servers.length === 0) {
        await ctx.reply('您没有访问任何服务器的权限');
        return;
      }

      // 显示类似图片中的界面
      let message = '🖥️ **服务器状态监控**\n\n';
      const buttons = [];

      // 添加状态统计
      let onlineCount = 0;
      let offlineCount = 0;

      for (const server of servers) {
        const status = await this.checkServerStatus(server.id);
        if (status) {
          onlineCount++;
        } else {
          offlineCount++;
        }
      }

      message += `📊 **状态概览**\n`;
      message += `🟢 在线: ${onlineCount}\n`;
      message += `🔴 离线: ${offlineCount}\n\n`;

      // 显示服务器列表
      message += `📋 **服务器列表**\n`;
      for (const server of servers.slice(0, 5)) { // 限制显示前5个
        const status = await this.checkServerStatus(server.id);
        const statusIcon = status ? '🟢' : '🔴';
        const statusText = status ? '在线' : '离线';
        
        message += `${statusIcon} **${server.name}**\n`;
        message += `   状态: ${statusText}\n`;
        message += `   描述: ${server.description || '无'}\n\n`;

        buttons.push([Markup.button.callback(
          `${statusIcon} ${server.name}`,
          `server_${server.id}`
        )]);
      }

      if (servers.length > 5) {
        message += `... 还有 ${servers.length - 5} 个服务器`;
      }

      // 添加控制按钮
      buttons.push([
        Markup.button.callback('🔄 刷新', 'refresh_servers'),
        Markup.button.callback('🔍 搜索', 'search_servers')
      ]);
      buttons.push([Markup.button.callback('🏠 返回主菜单', 'main_menu')]);

      // 如果是回调查询（从其他页面返回），编辑现有消息；否则发送新消息
      if (ctx.callbackQuery) {
        // 添加时间戳来确保消息内容有变化
        const messageWithTimestamp = message + `\n\n_🕐 更新时间: ${new Date().toLocaleString('zh-CN')}_`;
        
        try {
          await ctx.editMessageText(messageWithTimestamp, { 
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(buttons).reply_markup
          });
        } catch (error) {
          // 如果仍然失败，尝试不添加时间戳
          if (error.description && error.description.includes('message is not modified')) {
            try {
              await ctx.editMessageText(message, { 
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard(buttons).reply_markup
              });
            } catch (retryError) {
              // 如果还是失败，发送新消息
              await ctx.reply(message, { 
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: buttons,
                  keyboard: this.getStandardKeyboard().reply_markup.keyboard,
                  resize_keyboard: true,
                  persistent: true
                }
              });
            }
          } else {
            throw error;
          }
        }
      } else {
        await ctx.reply(message, { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: buttons,
            keyboard: this.getStandardKeyboard().reply_markup.keyboard,
            resize_keyboard: true,
            persistent: true
          }
        });
      }
    } catch (error) {
      logger.error('处理 /servers 命令失败:', error);
      await this.safeReply(ctx, '抱歉，发生了错误，请稍后重试');
    }
  }

  async handleRefreshServers(ctx) {
    try {
      const userId = ctx.from.id;
      const user = await this.getUserByTelegramId(userId);
      
      if (!user) {
        await ctx.editMessageText('请先在 Web 界面中注册并绑定 Telegram ID');
        return;
      }

      const servers = await this.getUserServers(user.id);
      
      if (servers.length === 0) {
        await ctx.editMessageText('您没有访问任何服务器的权限');
        return;
      }

      // 显示类似图片中的界面
      let message = '🖥️ **服务器状态监控**\n\n';
      const buttons = [];

      // 添加状态统计
      let onlineCount = 0;
      let offlineCount = 0;

      for (const server of servers) {
        const status = await this.checkServerStatus(server.id);
        if (status) {
          onlineCount++;
        } else {
          offlineCount++;
        }
      }

      message += `📊 **状态概览**\n`;
      message += `🟢 在线: ${onlineCount}\n`;
      message += `🔴 离线: ${offlineCount}\n\n`;

      // 显示服务器列表
      message += `📋 **服务器列表**\n`;
      for (const server of servers.slice(0, 5)) { // 限制显示前5个
        const status = await this.checkServerStatus(server.id);
        const statusIcon = status ? '🟢' : '🔴';
        const statusText = status ? '在线' : '离线';
        
        message += `${statusIcon} **${server.name}**\n`;
        message += `   状态: ${statusText}\n`;
        message += `   描述: ${server.description || '无'}\n\n`;

        buttons.push([Markup.button.callback(
          `${statusIcon} ${server.name}`,
          `server_${server.id}`
        )]);
      }

      if (servers.length > 5) {
        message += `... 还有 ${servers.length - 5} 个服务器`;
      }

      // 添加控制按钮
      buttons.push([
        Markup.button.callback('🔄 刷新', 'refresh_servers'),
        Markup.button.callback('🔍 搜索', 'search_servers')
      ]);
      buttons.push([Markup.button.callback('🏠 主菜单', 'main_menu')]);

      // 添加时间戳来确保消息内容有变化
      const messageWithTimestamp = message + `\n\n_🕐 更新时间: ${new Date().toLocaleString('zh-CN')}_`;
      
      try {
        await ctx.editMessageText(messageWithTimestamp, {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard(buttons).reply_markup
        });
      } catch (error) {
        // 如果仍然失败，尝试不添加时间戳
        if (error.description && error.description.includes('message is not modified')) {
          try {
            await ctx.editMessageText(message, {
              parse_mode: 'Markdown',
              reply_markup: Markup.inlineKeyboard(buttons).reply_markup
            });
          } catch (retryError) {
            // 如果还是失败，发送新消息
            await ctx.reply(message, {
              parse_mode: 'Markdown',
              reply_markup: Markup.inlineKeyboard(buttons).reply_markup
            });
          }
        } else {
          throw error;
        }
      }
    } catch (error) {
      logger.error('刷新服务器列表失败:', error);
      await this.safeEditMessageText(ctx, '抱歉，刷新失败，请稍后重试');
    }
  }

  async handleContainersCommand(ctx) {
    try {
      const userId = ctx.from.id;
      const user = await this.getUserByTelegramId(userId);
      
      if (!user) {
        await ctx.reply('请先在 Web 界面中注册并绑定 Telegram ID');
        return;
      }

      const servers = await this.getUserServers(user.id);
      
      if (servers.length === 0) {
        await ctx.reply('您没有访问任何服务器的权限');
        return;
      }

      const buttons = servers.map(server => [
        Markup.button.callback(
          `🐳 ${server.name}`,
          `containers_${server.id}`
        )
      ]);

      await ctx.reply(
        '🐳 选择要查看容器的服务器：',
        Markup.inlineKeyboard(buttons)
      );
    } catch (error) {
      logger.error('处理 /containers 命令失败:', error);
      await this.safeReply(ctx, '抱歉，发生了错误，请稍后重试');
    }
  }

  async handleStatusCommand(ctx) {
    try {
      // 获取系统运行时间
      const uptime = process.uptime();
      const uptimeHours = Math.floor(uptime / 3600);
      const uptimeMinutes = Math.floor((uptime % 3600) / 60);
      const uptimeSeconds = Math.floor(uptime % 60);
      
      // 获取内存使用情况
      const memUsage = process.memoryUsage();
      const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      
      // 获取Node.js版本
      const nodeVersion = process.version;
      
      // 获取监控服务状态
      const monitoringService = (await import('./monitoringService.js')).default;
      const monitoringStatus = monitoringService.getStatus();
      
      // 获取所有服务器数量（包括离线的）
      const totalServers = await database.db.get(
        'SELECT COUNT(*) as count FROM servers WHERE is_active = 1'
      );
      
      const message = 
        '📈 **系统状态**\n\n' +
        `⏰ 运行时间: ${uptimeHours}小时 ${uptimeMinutes}分钟 ${uptimeSeconds}秒\n` +
        `💾 内存使用: ${memUsedMB}MB / ${memTotalMB}MB\n` +
        `🟢 Node.js版本: ${nodeVersion}\n` +
        `🖥️ 总服务器: ${totalServers.count}个`
      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('处理 /status 命令失败:', error);
      await this.safeReply(ctx, '抱歉，发生了错误，请稍后重试');
    }
  }

  async handleCallbackQuery(ctx) {
    try {
      const data = ctx.callbackQuery.data;
      const userId = ctx.from.id;

      // 立即确认回调查询，避免超时
      try {
      await ctx.answerCbQuery();
      } catch (error) {
        // 忽略回调查询超时错误，继续处理
        if (error.description && error.description.includes('query is too old')) {
          logger.warn('回调查询已超时，继续处理:', error.description);
        } else {
          logger.error('回调查询确认失败:', error);
        }
      }

      // 检查是否是注册的按钮
      if (this.registeredButtons.has(data)) {
        const button = this.registeredButtons.get(data);
        if (button.handler) {
          await button.handler(ctx);
        }
      } else if (data === 'main_menu') {
        await this.handleStartCommand(ctx);
      } else if (data === 'servers') {
        await this.handleServersCommand(ctx);
      } else if (data === 'refresh_servers') {
        await this.handleRefreshServers(ctx);
      } else if (data === 'search_servers') {
        await this.handleSearchServers(ctx);
      } else if (data.startsWith('refresh_containers_')) {
        const serverId = parseInt(data.split('_')[2]);
        await this.handleServerContainers(ctx, serverId);
      } else if (data.startsWith('search_containers_')) {
        const serverId = parseInt(data.split('_')[2]);
        await this.handleSearchContainers(ctx, serverId);
      } else if (data.startsWith('server_')) {
        const serverId = parseInt(data.split('_')[1]);
        await this.handleServerDetails(ctx, serverId);
      } else if (data.startsWith('containers_')) {
        const parts = data.split('_');
        const serverId = parseInt(parts[1]);
        
        // 检查是否是分页请求
        if (parts.length === 4 && parts[2] === 'page') {
          const page = parseInt(parts[3]);
          await this.handleServerContainers(ctx, serverId, page);
        } else {
          await this.handleServerContainers(ctx, serverId);
        }
      } else if (data.startsWith('container_')) {
        const [_, serverId, containerId, action] = data.split('_');
        await this.handleContainerAction(ctx, parseInt(serverId), containerId, action);
      } else if (data === 'refresh_monitoring') {
        await this.handleMonitoringCommand(ctx);
      }
    } catch (error) {
      logger.error('处理回调查询失败:', error);
      await this.safeReply(ctx, '抱歉，发生了错误，请稍后重试');
    }
  }

  async handleServerDetails(ctx, serverId) {
    try {
      const server = await this.getServerById(serverId);
      if (!server) {
        await this.safeReply(ctx, '服务器不存在');
        return;
      }

      const status = await this.checkServerStatus(serverId);
      const statusIcon = status ? '🟢' : '🔴';
      const statusText = status ? '在线' : '离线';

      // 如果服务器离线，直接显示离线信息
      if (!status) {
        let message = 
          `🖥️ 服务器详情：${server.name}\n\n` +
          `状态: ${statusIcon} ${statusText}\n` +
          `描述: ${server.description || '无'}\n` +
          `创建时间: ${new Date(server.created_at).toLocaleString('zh-CN')}\n\n` +
          `⚠️ 当前服务器状态异常，请稍后重试`;

        const buttons = [
          [Markup.button.callback('🔄 刷新状态', `server_${serverId}`)],
          [Markup.button.callback('🔙 返回服务器列表', 'servers')]
        ];

        await this.safeReply(ctx, message, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(buttons)
        });
        return;
      }

      // 获取容器列表
      const containers = await dockerService.getContainers(serverId);
      
      // 获取服务器性能数据
      const monitoringService = (await import('./monitoringService.js')).default;
      const serverStats = await monitoringService.getLatestServerStats(serverId);
      
      let message = 
        `🖥️ 服务器详情：${server.name}\n\n` +
        `状态: ${statusIcon} ${statusText}\n` +
        `描述: ${server.description || '无'}\n` +
        `创建时间: ${new Date(server.created_at).toLocaleString('zh-CN')}\n\n`;
      
      // 添加性能信息
      if (serverStats) {
        message += `📊 **性能状态**\n`;
        message += `🖥️ CPU: ${serverStats.cpu_usage.toFixed(1)}%\n`;
        message += `💾 内存: ${serverStats.memory_usage.toFixed(1)}% (${this.formatBytes(serverStats.memory_used)} / ${this.formatBytes(serverStats.memory_total)})\n`;
        message += `💿 磁盘: ${serverStats.disk_usage.toFixed(1)}% (${this.formatBytes(serverStats.disk_used)} / ${this.formatBytes(serverStats.disk_total)})\n`;
        message += `🌐 网络: ↓${this.formatBytes(serverStats.network_in)} ↑${this.formatBytes(serverStats.network_out)}\n\n`;
      } else {
        message += `📊 **性能状态**: 暂无监控数据\n\n`;
      }

      const buttons = [];

      if (containers.length === 0) {
        message += '🐳 该服务器上没有容器';
        buttons.push([Markup.button.callback('🔙 返回服务器列表', 'servers')]);
      } else {
        // 统计容器状态
        let runningCount = 0;
        let stoppedCount = 0;
        containers.forEach(container => {
          if (this.isContainerRunning(container)) {
            runningCount++;
          } else {
            stoppedCount++;
          }
        });

        message += `🐳 **容器列表** (${containers.length}个)\n`;
        message += `🟢 在线: ${runningCount}  🔴 离线: ${stoppedCount}\n\n`;

        // 为每个容器创建按钮
        for (const container of containers.slice(0, 10)) { // 限制显示前10个容器
          const containerStatusIcon = this.isContainerRunning(container) ? '🟢' : '🔴';
          buttons.push([Markup.button.callback(
            `${containerStatusIcon} ${container.name}`,
            `container_${serverId}_${container.id}_details`
          )]);
        }

        if (containers.length > 10) {
          message += `... 还有 ${containers.length - 10} 个容器`;
        }

        // 添加控制按钮
        buttons.push([
          Markup.button.callback('🔄 刷新', `refresh_containers_${serverId}`),
          Markup.button.callback('🔍 搜索', `search_containers_${serverId}`)
        ]);
        buttons.push([Markup.button.callback('🔙 返回服务器列表', 'servers')]);
      }

      // 如果是刷新请求，编辑现有消息；否则发送新消息
      if (ctx.callbackQuery) {
        // 添加时间戳来确保消息内容有变化
        const messageWithTimestamp = message + `\n\n_🕐 更新时间: ${new Date().toLocaleString('zh-CN')}_`;
        
        try {
          await ctx.editMessageText(messageWithTimestamp, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
          });
        } catch (error) {
          // 如果仍然失败，尝试不添加时间戳
          if (error.description && error.description.includes('message is not modified')) {
            try {
              await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(buttons)
              });
            } catch (retryError) {
              // 如果还是失败，发送新消息
              await ctx.reply(message, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(buttons)
              });
            }
          } else {
            throw error;
          }
        }
      } else {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(buttons)
        });
      }
    } catch (error) {
      logger.error('处理服务器详情失败:', error);
      
      if (this.isServerConnectionError(error)) {
        await this.sendServerConnectionError(ctx);
      } else {
        await this.safeReply(ctx, '抱歉，发生了错误，请稍后重试');
      }
    }
  }

  async handleServerContainers(ctx, serverId, currentPage = 1) {
    try {
      // 先检查服务器状态
      const status = await this.checkServerStatus(serverId);
      if (!status) {
        const server = await this.getServerById(serverId);
        const serverName = server ? server.name : `服务器 ${serverId}`;
        
        let message = `🐳 **${serverName} - 容器监控**\n\n`;
        message += `⚠️ 当前服务器状态异常，请稍后重试\n\n`;
        message += `无法获取容器信息，请检查服务器连接状态。`;

        const buttons = [
          [Markup.button.callback('🔄 刷新状态', `containers_${serverId}`)],
          [Markup.button.callback('🔙 返回服务器列表', 'servers')]
        ];

        await this.safeReply(ctx, message, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(buttons)
        });
        return;
      }

      // 优先使用缓存获取容器列表
      const cacheService = (await import('./cacheService.js')).default;
      const cachedContainers = cacheService.getContainers(serverId);
      
      let containers;
      if (cachedContainers) {
        containers = cachedContainers.containers;
        logger.debug(`Telegram Bot 使用缓存容器列表: 服务器 ${serverId} - ${containers.length} 个容器`);
      } else {
        // 如果缓存中没有，从 Docker 服务获取
        containers = await dockerService.getContainers(serverId);
        logger.debug(`Telegram Bot 从 Docker 服务获取容器列表: 服务器 ${serverId} - ${containers.length} 个容器`);
      }
      
      if (containers.length === 0) {
        await this.safeReply(ctx, '该服务器上没有容器');
        return;
      }

      // 获取服务器信息
      const server = await this.getServerById(serverId);
      const serverName = server ? server.name : `服务器 ${serverId}`;

      // 统计容器状态
      let runningCount = 0;
      let stoppedCount = 0;
      containers.forEach(container => {
        if (this.isContainerRunning(container)) {
          runningCount++;
        } else {
          stoppedCount++;
        }
      });

      let message = `🐳 **${serverName} - 容器监控**\n\n`;
      
      // 状态概览
      message += `📊 **状态概览**\n`;
      message += `🟢 运行中: ${runningCount}\n`;
      message += `🔴 已停止: ${stoppedCount}\n\n`;

      // 容器列表 - 支持分页
      const pageSize = 5; // 每页显示5个容器
      const totalPages = Math.ceil(containers.length / pageSize);
      
      message += `📋 **容器列表** (第 ${currentPage}/${totalPages} 页)\n`;
      const buttons = [];

      // 显示当前页的容器
      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = Math.min(startIndex + pageSize, containers.length);
      const currentPageContainers = containers.slice(startIndex, endIndex);

      for (const container of currentPageContainers) {
        const statusIcon = this.isContainerRunning(container) ? '🟢' : '🔴';
        const statusText = this.isContainerRunning(container) ? '运行中' : '已停止';
        
        // 转义Markdown特殊字符
        const safeName = this.escapeMarkdown(container.name);
        const safeId = this.escapeMarkdown(container.id);
        const safeImage = this.escapeMarkdown(container.image);
        
        message += `${statusIcon} **${safeName}**\n`;
        message += `   容器ID: \`${safeId}\`\n`;
        message += `   状态: ${statusText}\n`;
        message += `   镜像: \`${safeImage}\`\n\n`;

        buttons.push([Markup.button.callback(
          `${statusIcon} ${container.name}`,
          `container_${serverId}_${container.id}_details`
        )]);
      }

      // 添加分页按钮
      const paginationButtons = [];
      if (totalPages > 1) {
        if (currentPage > 1) {
          paginationButtons.push(Markup.button.callback('⬅️ 上一页', `containers_${serverId}_page_${currentPage - 1}`));
        }
        if (currentPage < totalPages) {
          paginationButtons.push(Markup.button.callback('下一页 ➡️', `containers_${serverId}_page_${currentPage + 1}`));
        }
        if (paginationButtons.length > 0) {
          buttons.push(paginationButtons);
        }
      }

      // 添加控制按钮
      buttons.push([
        Markup.button.callback('🔄 刷新', `refresh_containers_${serverId}`),
        Markup.button.callback('🔍 搜索', `search_containers_${serverId}`)
      ]);
      buttons.push([Markup.button.callback('🔙 返回服务器', 'servers')]);

      // 如果是分页请求或刷新请求，编辑现有消息；否则发送新消息
      if (currentPage > 1 || ctx.callbackQuery) {
        // 添加时间戳来确保消息内容有变化
        const messageWithTimestamp = message + `\n\n_🕐 更新时间: ${new Date().toLocaleString('zh-CN')}_`;
        
        try {
          await ctx.editMessageText(messageWithTimestamp, { 
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
          });
        } catch (error) {
          // 如果仍然失败，尝试不添加时间戳
          if (error.description && error.description.includes('message is not modified')) {
            try {
              await ctx.editMessageText(message, { 
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(buttons)
              });
            } catch (retryError) {
              // 如果还是失败，发送新消息
              await ctx.reply(message, { 
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(buttons)
              });
            }
          } else {
            throw error;
          }
        }
      } else {
        await ctx.reply(message, { 
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(buttons)
        });
      }
    } catch (error) {
      logger.error('处理服务器容器失败:', error);
      
      if (this.isServerConnectionError(error)) {
        await this.sendServerConnectionError(ctx);
      } else {
        await this.safeReply(ctx, '抱歉，发生了错误，请稍后重试');
      }
    }
  }

  async handleContainerAction(ctx, serverId, containerId, action) {
    try {
      if (action === 'details') {
        await this.showContainerDetails(ctx, serverId, containerId);
      } else if (action === 'logs') {
        await this.showContainerLogs(ctx, serverId, containerId);
      } else if (['start', 'stop', 'restart'].includes(action)) {
        await this.performContainerAction(ctx, serverId, containerId, action);
      }
    } catch (error) {
      logger.error('处理容器操作失败:', error);
      await this.safeReply(ctx, '抱歉，发生了错误，请稍后重试');
    }
  }

  async showContainerDetails(ctx, serverId, containerId) {
    try {
      const userId = ctx.from.id;
      const user = await this.getUserByTelegramId(userId);
      
      if (!user) {
        await this.safeReply(ctx, '请先在 Web 界面中注册并绑定 Telegram ID');
        return;
      }

      // 先检查服务器状态
      const status = await this.checkServerStatus(serverId);
      if (!status) {
        const server = await this.getServerById(serverId);
        const serverName = server ? server.name : `服务器 ${serverId}`;
        
        let message = `🐳 **容器详情**\n\n`;
        message += `服务器: ${serverName}\n\n`;
        message += `⚠️ 当前服务器状态异常，请稍后重试\n\n`;
        message += `无法获取容器信息，请检查服务器连接状态。`;

        const buttons = [
          [Markup.button.callback('🔄 刷新状态', `container_${serverId}_${containerId}_details`)],
          [Markup.button.callback('🔙 返回容器列表', `containers_${serverId}`)]
        ];

        await this.safeReply(ctx, message, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(buttons)
        });
        return;
      }

      const container = await dockerService.getContainerInfo(serverId, containerId);
      
      if (!container) {
        await this.safeReply(ctx, '容器不存在');
        return;
      }

      // 检查用户权限
      const hasControlPermission = await this.checkUserServerControlPermission(user.id, serverId);
      const hasViewPermission = await this.checkUserServerViewPermission(user.id, serverId);

      if (!hasViewPermission) {
        await ctx.reply('❌ 您没有权限查看此服务器的容器');
        return;
      }

      const statusIcon = this.isContainerRunning(container) ? '🟢' : '🔴';
      const statusText = this.isContainerRunning(container) ? '运行中' : '已停止';

      // 获取服务器信息
      const server = await this.getServerById(serverId);
      const serverName = server ? server.name : `服务器 ${serverId}`;

      // 转义Markdown特殊字符
      const safeContainerName = this.escapeMarkdown(container.name);
      const safeContainerId = this.escapeMarkdown(container.id);
      const safeContainerImage = this.escapeMarkdown(container.image);
      const safeServerName = this.escapeMarkdown(serverName);

      let message = `🐳 **容器详情**\n\n`;
      message += `**${safeContainerName}**\n`;
      message += `服务器: ${safeServerName}\n\n`;
      
      message += `📊 **状态信息**\n`;
      message += `容器ID: \`${safeContainerId}\`\n`;
      message += `状态: ${statusIcon} ${statusText}\n`;
      message += `镜像: \`${safeContainerImage}\`\n`;
      message += `创建时间: ${new Date(container.created).toLocaleString('zh-CN')}\n\n`;

      if (container.ports && container.ports.length > 0) {
        message += `🔌 **端口映射**\n`;
        container.ports.forEach(port => {
          if (port.publicPort && port.privatePort) {
            const safePort = this.escapeMarkdown(`${port.publicPort}:${port.privatePort}/${port.type}`);
            message += `\`${safePort}\`\n`;
          } else if (port.privatePort) {
            const safePort = this.escapeMarkdown(`${port.privatePort}/${port.type}`);
            message += `\`${safePort}\` (仅内部)\n`;
          }
        });
        message += '\n';
      }

      // 添加操作按钮（根据权限显示）
      const buttons = [];
      
      // 控制按钮（需要控制权限）
      if (hasControlPermission) {
        if (this.isContainerRunning(container)) {
        buttons.push([
          Markup.button.callback('⏹️ 停止', `container_${serverId}_${containerId}_stop`),
          Markup.button.callback('🔄 重启', `container_${serverId}_${containerId}_restart`)
        ]);
      } else {
        buttons.push([
          Markup.button.callback('▶️ 启动', `container_${serverId}_${containerId}_start`)
        ]);
      }
      }

      // 查看按钮（需要查看权限）
      if (hasViewPermission) {
        buttons.push([
          Markup.button.callback('📋 查看日志', `container_${serverId}_${containerId}_logs`)
        ]);
      }
      
      buttons.push([Markup.button.callback('🔙 返回容器列表', `containers_${serverId}`)]);

      // 如果是刷新请求，编辑现有消息；否则发送新消息
      if (ctx.callbackQuery) {
        // 添加时间戳来确保消息内容有变化
        const messageWithTimestamp = message + `\n\n_🕐 更新时间: ${new Date().toLocaleString('zh-CN')}_`;
        
        try {
          await ctx.editMessageText(messageWithTimestamp, { 
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
          });
        } catch (error) {
          // 如果仍然失败，尝试不添加时间戳
          if (error.description && error.description.includes('message is not modified')) {
            try {
              await ctx.editMessageText(message, { 
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(buttons)
              });
            } catch (retryError) {
              // 如果还是失败，发送新消息
              await ctx.reply(message, { 
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(buttons)
              });
            }
          } else {
            throw error;
          }
        }
      } else {
        await ctx.reply(message, { 
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(buttons)
        });
      }
    } catch (error) {
      logger.error('显示容器详情失败:', error);
      
      if (this.isServerConnectionError(error)) {
        await this.sendServerConnectionError(ctx);
      } else {
        await this.safeReply(ctx, '抱歉，发生了错误，请稍后重试');
      }
    }
  }

  async performContainerAction(ctx, serverId, containerId, action) {
    try {
      const userId = ctx.from.id;
      const user = await this.getUserByTelegramId(userId);
      
      if (!user) {
        await this.safeReply(ctx, '请先在 Web 界面中注册并绑定 Telegram ID');
        return;
      }

      // 先检查服务器状态
      const status = await this.checkServerStatus(serverId);
      if (!status) {
        const server = await this.getServerById(serverId);
        const serverName = server ? server.name : `服务器 ${serverId}`;
        
        let message = `⚠️ 当前服务器状态异常，请稍后重试\n\n`;
        message += `服务器: ${serverName}\n`;
        message += `容器ID: \`${containerId}\`\n`;
        message += `无法执行容器操作，请检查服务器连接状态。`;

        const buttons = [
          [Markup.button.callback('🔄 刷新状态', `container_${serverId}_${containerId}_details`)],
          [Markup.button.callback('🔙 返回容器列表', `containers_${serverId}`)]
        ];

        await this.safeReply(ctx, message, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(buttons)
        });
        return;
      }

      // 检查用户是否有权限控制此服务器
      const hasControlPermission = await this.checkUserServerControlPermission(user.id, serverId);
      if (!hasControlPermission && ['start', 'stop', 'restart'].includes(action)) {
        await this.safeReply(ctx, '❌ 您没有权限控制此服务器的容器');
        return;
      }

      let result;
      let actionText;

      switch (action) {
        case 'start':
          result = await dockerService.startContainer(serverId, containerId);
          actionText = '启动';
          break;
        case 'stop':
          result = await dockerService.stopContainer(serverId, containerId);
          actionText = '停止';
          break;
        case 'restart':
          result = await dockerService.restartContainer(serverId, containerId);
          actionText = '重启';
          break;
        case 'logs':
          await this.showContainerLogs(ctx, serverId, containerId);
          return;
        default:
          await ctx.reply('不支持的操作');
          return;
      }

      if (result.success) {
        await ctx.reply(`✅ 容器${actionText}成功！`);
        // 显示更新后的容器详情
        await this.showContainerDetails(ctx, serverId, containerId);
      } else {
        await ctx.reply(`❌ 容器${actionText}失败：${result.message}`);
      }
    } catch (error) {
      logger.error('执行容器操作失败:', error);
      
      if (this.isServerConnectionError(error)) {
        await this.sendServerConnectionError(ctx);
      } else {
        await this.safeReply(ctx, '抱歉，发生了错误，请稍后重试');
      }
    }
  }

  // 新增：搜索服务器功能
  async handleSearchServers(ctx) {
    try {
      await ctx.reply(
        '🔍 **搜索服务器**\n\n请输入要搜索的服务器名称关键词：',
        { 
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 返回服务器列表', 'servers')]
          ])
        }
      );
      
      // 设置用户状态为搜索模式
      const userId = ctx.from.id;
      this.userSessions.set(userId, { mode: 'search_servers' });
    } catch (error) {
      logger.error('处理搜索服务器失败:', error);
      await this.safeReply(ctx, '抱歉，发生了错误，请稍后重试');
    }
  }

  // 新增：搜索容器功能
  async handleSearchContainers(ctx, serverId) {
    try {
      await ctx.reply(
        '🔍 **搜索容器**\n\n请输入要搜索的容器名称关键词：',
        { 
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 返回容器列表', `containers_${serverId}`)]
          ])
        }
      );
      
      // 设置用户状态为搜索模式
      const userId = ctx.from.id;
      this.userSessions.set(userId, { mode: 'search_containers', serverId });
    } catch (error) {
      logger.error('处理搜索容器失败:', error);
      await this.safeReply(ctx, '抱歉，发生了错误，请稍后重试');
    }
  }

  // 新增：显示容器日志
  async showContainerLogs(ctx, serverId, containerId) {
    try {
      const userId = ctx.from.id;
      const user = await this.getUserByTelegramId(userId);
      
      if (!user) {
        await ctx.reply('❌ 用户未找到，请先注册');
        return;
      }

      // 检查用户权限
      const hasViewPermission = await this.checkUserServerViewPermission(user.id, serverId);
      if (!hasViewPermission) {
        await ctx.reply('❌ 您没有权限查看此服务器的容器日志');
        return;
      }

      // 先检查服务器状态
      const status = await this.checkServerStatus(serverId);
      if (!status) {
        const server = await this.getServerById(serverId);
        const serverName = server ? server.name : `服务器 ${serverId}`;
        
        let message = `📋 **容器日志**\n\n`;
        message += `服务器: ${serverName}\n\n`;
        message += `⚠️ 当前服务器状态异常，请稍后重试\n\n`;
        message += `容器ID: \`${containerId}\`\n`;
        message += `无法获取容器日志，请检查服务器连接状态。`;

        const buttons = [
          [Markup.button.callback('🔄 刷新状态', `container_${serverId}_${containerId}_logs`)],
          [Markup.button.callback('🔙 返回容器详情', `container_${serverId}_${containerId}_details`)]
        ];

        await this.safeReply(ctx, message, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(buttons)
        });
        return;
      }

      const logs = await dockerService.getContainerLogs(serverId, containerId, { tail: 20 });
      
      let message = `📋 **容器日志**\n\n`;
      if (logs && logs.trim()) {
        // 显示最新的20条日志
        message += '```\n';
        message += logs.trim();
        message += '\n```';
      } else {
        message += '暂无日志信息';
      }

      await this.safeReply(ctx, message, { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 返回容器详情', `container_${serverId}_${containerId}_details`)]
        ])
      });
    } catch (error) {
      logger.error('显示容器日志失败:', error);
      
      if (this.isServerConnectionError(error)) {
        await this.sendServerConnectionError(ctx);
      } else {
        await this.safeReply(ctx, '获取日志失败，请稍后重试');
      }
    }
  }


  // 新增：处理文本消息
  async handleTextMessage(ctx) {
    try {
      const userId = ctx.from.id;
      const text = ctx.message.text;
      const userSession = this.userSessions.get(userId);

      // 处理按钮文本
      if (text === '📊 服务器管理') {
        await this.handleServersCommand(ctx);
        return;
      } else if (text === '🐳 容器管理') {
        await this.handleContainersCommand(ctx);
        return;
      } else if (text === '🌐 在线监控') {
        const webAppUrl = process.env.TELEGRAM_WEBAPP_URL || 'https://ztms.top/telegram-webapp';
        await ctx.reply('点此打开', Markup.inlineKeyboard([
          [Markup.button.webApp('🌐 在线监控', webAppUrl)]
        ]));
        return;
      } else if (text === '❓ 帮助菜单') {
        await this.handleHelpCommand(ctx);
        return;
      }

      if (!userSession) {
        // 如果没有会话状态，忽略其他文本消息
        return;
      }

      if (userSession.mode === 'search_servers') {
        await this.performServerSearch(ctx, text);
      } else if (userSession.mode === 'search_containers') {
        await this.performContainerSearch(ctx, text, userSession.serverId);
      }

      // 清除会话状态
      this.userSessions.delete(userId);
    } catch (error) {
      logger.error('处理文本消息失败:', error);
      await this.safeReply(ctx, '抱歉，发生了错误，请稍后重试');
    }
  }

  // 新增：执行服务器搜索
  async performServerSearch(ctx, keyword) {
    try {
      const userId = ctx.from.id;
      const user = await this.getUserByTelegramId(userId);
      
      if (!user) {
        await ctx.reply('请先在 Web 界面中注册并绑定 Telegram ID');
        return;
      }

      const servers = await this.getUserServers(user.id);
      const filteredServers = servers.filter(server => 
        server.name.toLowerCase().includes(keyword.toLowerCase()) ||
        (server.description && server.description.toLowerCase().includes(keyword.toLowerCase()))
      );

      if (filteredServers.length === 0) {
        await ctx.reply(
          `🔍 **搜索结果**\n\n没有找到包含 "${keyword}" 的服务器`,
          { 
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔙 返回服务器列表', 'servers')]
            ])
          }
        );
        return;
      }

      let message = `🔍 **搜索结果** (关键词: "${keyword}")\n\n`;
      const buttons = [];

      for (const server of filteredServers.slice(0, 5)) {
        const status = await this.checkServerStatus(server.id);
        const statusIcon = status ? '🟢' : '🔴';
        const statusText = status ? '运行中' : '已停止';
        
        message += `${statusIcon} **${server.name}**\n`;
        message += `   状态: ${statusText}\n`;
        message += `   描述: ${server.description || '无'}\n\n`;

        buttons.push([Markup.button.callback(
          `${statusIcon} ${server.name}`,
          `server_${server.id}`
        )]);
      }

      if (filteredServers.length > 5) {
        message += `... 还有 ${filteredServers.length - 5} 个结果`;
      }

      buttons.push([Markup.button.callback('🔙 返回服务器列表', 'servers')]);

      await ctx.reply(message, { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      });
    } catch (error) {
      logger.error('执行服务器搜索失败:', error);
      await this.safeReply(ctx, '搜索失败，请稍后重试');
    }
  }

  // 新增：执行容器搜索
  async performContainerSearch(ctx, keyword, serverId) {
    try {
      const containers = await dockerService.getContainers(serverId);
      const filteredContainers = containers.filter(container => 
        container.name.toLowerCase().includes(keyword.toLowerCase()) ||
        container.image.toLowerCase().includes(keyword.toLowerCase())
      );

      if (filteredContainers.length === 0) {
        await ctx.reply(
          `🔍 **搜索结果**\n\n没有找到包含 "${keyword}" 的容器`,
          { 
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔙 返回容器列表', `containers_${serverId}`)]
            ])
          }
        );
        return;
      }

      let message = `🔍 **搜索结果** (关键词: "${keyword}")\n\n`;
      const buttons = [];

      for (const container of filteredContainers.slice(0, 5)) {
        const statusIcon = this.isContainerRunning(container) ? '🟢' : '🔴';
        const statusText = this.isContainerRunning(container) ? '在线' : '离线';
        
        message += `${statusIcon} **${container.name}**\n`;
        message += `   状态: ${statusText}\n`;
        message += `   镜像: ${container.image}\n\n`;

        buttons.push([Markup.button.callback(
          `${statusIcon} ${container.name}`,
          `container_${serverId}_${container.id}_details`
        )]);
      }

      if (filteredContainers.length > 5) {
        message += `... 还有 ${filteredContainers.length - 5} 个结果`;
      }

      buttons.push([Markup.button.callback('🔙 返回容器列表', `containers_${serverId}`)]);

      await ctx.reply(message, { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      });
    } catch (error) {
      logger.error('执行容器搜索失败:', error);
      
      if (this.isServerConnectionError(error)) {
        await this.sendServerConnectionError(ctx);
      } else {
        await this.safeReply(ctx, '搜索失败，请稍后重试');
      }
    }
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

  // 辅助方法：检查是否是服务器连接错误
  isServerConnectionError(error) {
    if (!error || !error.message) return false;
    
    const connectionErrors = [
      'Timed out while waiting for handshake',
      'ECONNREFUSED',
      'ENOTFOUND',
      'EHOSTUNREACH',
      'ETIMEDOUT',
      'Connection refused',
      'Network is unreachable',
      'No route to host'
    ];
    
    return connectionErrors.some(errorType => 
      error.message.includes(errorType)
    );
  }

  // 辅助方法：发送服务器连接失败消息
  async sendServerConnectionError(ctx) {
    await this.safeReply(ctx, '⚠️ 服务器连接失败\n\n服务器有可能不在线，或稍后重试');
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

  // 辅助方法：安全编辑消息
  async safeEditMessageText(ctx, message, options = {}) {
    if (!ctx || !ctx.editMessageText) {
      logger.warn('无法编辑消息：上下文无效');
      return false;
    }

    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        await ctx.editMessageText(message, options);
        return true;
      } catch (error) {
        retryCount++;
        
        if (this.isNetworkError(error)) {
          logger.warn(`网络错误，重试编辑消息 ${retryCount}/${maxRetries}:`, error.message);
          
          if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            continue;
          } else {
            logger.error('达到最大重试次数，放弃编辑消息');
            return false;
          }
        } else {
          logger.error('编辑消息失败:', error);
          return false;
        }
      }
    }
    
    return false;
  }

  // 辅助方法：检查用户服务器控制权限
  async checkUserServerControlPermission(userId, serverId) {
    try {
      // 首先检查用户是否为管理员
      const user = await database.db.get(
        'SELECT role FROM users WHERE id = ?',
        [userId]
      );

      if (user && user.role === 'admin') {
        // 管理员默认拥有所有服务器权限
        return true;
      }

      // 普通用户查询权限表
      const result = await database.db.get(
        'SELECT can_control FROM user_server_permissions WHERE user_id = ? AND server_id = ?',
        [userId, serverId]
      );
      return result && result.can_control;
    } catch (error) {
      logger.error('检查用户服务器控制权限失败:', error);
      return false;
    }
  }

  // 辅助方法：检查用户服务器查看权限
  async checkUserServerViewPermission(userId, serverId) {
    try {
      // 首先检查用户是否为管理员
      const user = await database.db.get(
        'SELECT role FROM users WHERE id = ?',
        [userId]
      );

      if (user && user.role === 'admin') {
        // 管理员默认拥有所有服务器权限
        return true;
      }

      // 普通用户查询权限表
      const result = await database.db.get(
        'SELECT can_view FROM user_server_permissions WHERE user_id = ? AND server_id = ?',
        [userId, serverId]
      );
      return result && result.can_view;
    } catch (error) {
      logger.error('检查用户服务器查看权限失败:', error);
      return false;
    }
  }

  // 辅助方法：格式化字节数
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // 辅助方法
  isMessageBeforeStart(message) {
    // 检查消息时间是否在机器人启动之前
    if (!message || !message.date) {
      return false;
    }
    
    // Telegram 消息时间戳是 Unix 时间戳（秒），需要转换为毫秒
    const messageTime = message.date * 1000;
    return messageTime < this.startTime;
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

  async getUserServers(userId) {
    try {
      // 首先检查用户是否为管理员
      const user = await database.db.get(
        'SELECT role FROM users WHERE id = ?',
        [userId]
      );

      if (user && user.role === 'admin') {
        // 管理员默认拥有所有服务器权限
        const servers = await database.db.all(`
          SELECT s.*, 1 as can_view, 1 as can_control, 1 as can_ssh, 0 as hide_sensitive_info
          FROM servers s
          WHERE s.is_active = 1
          ORDER BY s.name
        `);
        return servers;
      }

      // 普通用户查询权限表
      const servers = await database.db.all(`
        SELECT s.*, p.can_view, p.can_control, p.can_ssh, p.hide_sensitive_info
        FROM servers s
        JOIN user_server_permissions p ON s.id = p.server_id
        WHERE p.user_id = ? AND (s.is_active = 1 OR s.is_active = true) AND (p.can_view = 1 OR p.can_view = true)
        ORDER BY s.name
      `, [userId]);
      return servers;
    } catch (error) {
      logger.error('获取用户服务器失败:', error);
      return [];
    }
  }

  async getServerById(serverId) {
    try {
      const server = await database.db.get(
        'SELECT * FROM servers WHERE id = ?',
        [serverId]
      );
      return server || null;
    } catch (error) {
      logger.error('获取服务器失败:', error);
      return null;
    }
  }

  /**
   * 检查容器是否运行中
   * @param {Object} container - 容器对象
   * @returns {boolean} 是否运行中
   */
  isContainerRunning(container) {
    if (!container || !container.status) {
      return false;
    }
    
    const status = container.status.toLowerCase();
    return status === 'running' || 
           status.includes('up') || 
           status.includes('running');
  }

  async checkServerStatus(serverId) {
    try {
      // 优先使用缓存检查服务器状态
      const cacheService = (await import('./cacheService.js')).default;
      const cachedStatus = cacheService.getServerStatus(serverId);
      
      if (cachedStatus) {
        logger.debug(`Telegram Bot 使用缓存服务器状态: 服务器 ${serverId} - ${cachedStatus.status}`);
        return cachedStatus.status === '在线';
      }
      
      // 如果缓存中没有，使用原有逻辑
      const server = await database.db.get(
        'SELECT * FROM servers WHERE id = ? AND (is_active = 1 OR is_active = true)',
        [serverId]
      );
      
      if (!server) {
        return false;
      }
      
      // 实时检查服务器连接状态
      const monitoringService = (await import('./monitoringService.js')).default;
      const isOnline = await monitoringService.checkServerConnection(serverId);
      
      return isOnline;
    } catch (error) {
      logger.error('检查服务器状态失败:', error);
      return false;
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

  async stop() {
    try {
      if (this.bot) {
        this.bot.stop();
        this.isInitialized = false;
        logger.info('Telegram 机器人已停止');
      }
    } catch (error) {
      logger.error('停止 Telegram 机器人失败:', error);
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
   * 生成标准回复键盘
   * @returns {Object} ReplyKeyboardMarkup对象
   */
  getStandardKeyboard() {
    return Markup.keyboard([
      ['📊 服务器管理', '🐳 容器管理'],
      ['🌐 在线监控', '❓ 帮助菜单']
    ])
    .resize()
    .persistent();
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
        { command: 'start', description: '开始使用机器人' },
        { command: 'help', description: '查看帮助信息' },
        { command: 'servers', description: '查看服务器列表' },
        { command: 'containers', description: '查看容器列表' },
        { command: 'status', description: '查看系统状态' }
      ];

      await this.bot.telegram.setMyCommands(commands);
      logger.info('✅ 机器人命令注册成功');
    } catch (error) {
      logger.error('设置机器人命令失败:', error);
    }
  }

  /**
   * 注册默认按钮
   */
  registerDefaultButtons() {
    // 注册服务器管理按钮
    this.registerButton('servers', {
      text: '📊 服务器管理',
      icon: '📊',
      description: '查看和管理服务器',
      handler: this.handleServersCommand.bind(this),
      category: 'main',
      order: 1
    });

    // 注册容器管理按钮
    this.registerButton('containers', {
      text: '🐳 容器管理',
      icon: '🐳',
      description: '查看和管理容器',
      handler: this.handleContainersCommand.bind(this),
      category: 'main',
      order: 2
    });

    // 注册系统状态按钮
    this.registerButton('status', {
      text: '📈 系统状态',
      icon: '📈',
      description: '查看系统运行状态',
      handler: this.handleStatusCommand.bind(this),
      category: 'main',
      order: 3
    });

    // 注册监控按钮
    this.registerButton('monitoring', {
      text: '📊 实时监控',
      icon: '📊',
      description: '查看实时监控数据',
      handler: this.handleMonitoringCommand.bind(this),
      category: 'main',
      order: 4
    });

    logger.info(`已注册 ${this.registeredButtons.size} 个默认按钮`);
  }

  /**
   * 注册按钮
   * @param {string} id - 按钮ID
   * @param {Object} config - 按钮配置
   */
  registerButton(id, config) {
    const buttonConfig = {
      id,
      text: config.text || id,
      icon: config.icon || '🔘',
      description: config.description || '',
      handler: config.handler,
      category: config.category || 'main',
      order: config.order || 0,
      registeredAt: Date.now()
    };

    this.registeredButtons.set(id, buttonConfig);
    logger.info(`注册按钮: ${id} - ${buttonConfig.text}`);
  }

  /**
   * 注销按钮
   * @param {string} id - 按钮ID
   */
  unregisterButton(id) {
    if (this.registeredButtons.has(id)) {
      this.registeredButtons.delete(id);
      logger.info(`注销按钮: ${id}`);
    }
  }

  /**
   * 获取所有注册的按钮
   * @param {string} category - 按钮分类
   */
  getRegisteredButtons(category = null) {
    const buttons = Array.from(this.registeredButtons.values());
    
    if (category) {
      return buttons.filter(button => button.category === category);
    }
    
    return buttons.sort((a, b) => a.order - b.order);
  }

  /**
   * 生成主菜单按钮
   */
  generateMainMenuButtons() {
    const buttons = this.getRegisteredButtons('main');
    logger.info(`生成主菜单按钮，找到 ${buttons.length} 个按钮:`, buttons.map(b => b.text));
    
    const keyboard = [];
    
    // 每行2个按钮
    for (let i = 0; i < buttons.length; i += 2) {
      const row = [];
      row.push(Markup.button.callback(buttons[i].text, buttons[i].id));
      
      if (i + 1 < buttons.length) {
        row.push(Markup.button.callback(buttons[i + 1].text, buttons[i + 1].id));
      }
      
      keyboard.push(row);
    }

    // 添加Web App按钮
    keyboard.push([Markup.button.webApp('快速监控', process.env.TELEGRAM_WEBAPP_URL || 'https://ztms.top/telegram-webapp')]);
    
    logger.info('生成的键盘布局:', keyboard);
    return Markup.inlineKeyboard(keyboard);
  }

  /**
   * 处理监控命令
   */
  async handleMonitoringCommand(ctx) {
    try {
      const userId = ctx.from.id;
      const user = await this.getUserByTelegramId(userId);
      
      if (!user) {
        await ctx.reply('请先注册并绑定 Telegram ID');
        return;
      }

      const status = monitoringService.getStatus();
      const message = 
        `📊 实时监控数据\n\n` +
        `🟢 监控服务: ${status.isRunning ? '运行中' : '已停止'}\n` +
        `⏱️ 监控间隔: ${status.monitoringInterval}ms\n` +
        `🖥️ 活跃服务器: ${status.activeServers}个\n\n` +
        `📈 系统运行时间: ${Math.floor(process.uptime() / 3600)}小时`;

      // 如果是刷新请求，编辑现有消息；否则发送新消息
      if (ctx.callbackQuery) {
        // 添加时间戳来确保消息内容有变化
        const messageWithTimestamp = message + `\n\n_🕐 更新时间: ${new Date().toLocaleString('zh-CN')}_`;
        
        try {
          await ctx.editMessageText(messageWithTimestamp, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔄 刷新监控', 'refresh_monitoring')],
              [Markup.button.callback('🏠 返回主菜单', 'main_menu')]
            ])
          });
        } catch (error) {
          // 如果仍然失败，尝试不添加时间戳
          if (error.description && error.description.includes('message is not modified')) {
            try {
              await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                  [Markup.button.callback('🔄 刷新监控', 'refresh_monitoring')],
                  [Markup.button.callback('🏠 返回主菜单', 'main_menu')]
                ])
              });
            } catch (retryError) {
              // 如果还是失败，发送新消息
              await ctx.reply(message, Markup.inlineKeyboard([
                [Markup.button.callback('🔄 刷新监控', 'refresh_monitoring')],
                [Markup.button.callback('🏠 返回主菜单', 'main_menu')]
              ]));
            }
          } else {
            throw error;
          }
        }
      } else {
        await ctx.reply(message, Markup.inlineKeyboard([
          [Markup.button.callback('🔄 刷新监控', 'refresh_monitoring')],
          [Markup.button.callback('🏠 返回主菜单', 'main_menu')]
        ]));
      }
    } catch (error) {
      logger.error('处理监控命令失败:', error);
      await this.safeReply(ctx, '获取监控数据失败');
    }
  }

  // 转义Markdown特殊字符
  escapeMarkdown(text) {
    if (!text) return '';
    
    // 转义Markdown特殊字符
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
      .replace(/-/g, '\\-')    // 减号
      .replace(/=/g, '\\=')    // 等号
      .replace(/\|/g, '\\|')   // 竖线
      .replace(/\{/g, '\\{')   // 左花括号
      .replace(/\}/g, '\\}')   // 右花括号
      .replace(/\./g, '\\.')   // 点号
      .replace(/!/g, '\\!');   // 感叹号
  }

}

export default new TelegramBotService();