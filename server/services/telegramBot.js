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
  }

  async initialize() {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token || token === 'your_telegram_bot_token_here') {
        logger.warn('TELEGRAM_BOT_TOKEN 未设置或为占位符，跳过 Telegram 机器人初始化');
        return;
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
      this.isInitialized = true;
      
      // 启动机器人，添加错误处理
      await this.bot.launch().catch(error => {
        logger.error('Telegram 机器人启动失败:', error);
        this.isInitialized = false;
        this.bot = null;
      });
      
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
      ctx.reply('抱歉，发生了错误，请稍后重试。');
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
          '您需要先在 Web 界面中注册并绑定 Telegram ID 才能使用此机器人。\n\n' +
          `您的 Telegram ID 是: \`${userId}\`\n\n` +
          '请访问 DockerManager 完成注册和绑定',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const welcomeMessage = 
        `欢迎回来，${user.username}！\n\n` +
        '🤖 Docker Manager 机器人已就绪\n\n' +
        '可用命令：\n' +
        '/servers - 查看服务器列表\n' +
        '/containers - 查看容器列表\n' +
        '/status - 查看系统状态\n' +
        '/help - 获取帮助信息';

      await ctx.reply(welcomeMessage, Markup.inlineKeyboard([
        [Markup.button.callback('📊 查看服务器', 'servers')],
        [Markup.button.callback('🐳 查看容器', 'containers')],
        [Markup.button.callback('📈 系统状态', 'status')],
        [Markup.button.webApp('🌐 打开 Web App', process.env.TELEGRAM_WEBAPP_URL || 'https://ztms.top/telegram-webapp')]
      ]));

    } catch (error) {
      logger.error('处理 /start 命令失败:', error);
      await ctx.reply('抱歉，发生了错误，请稍后重试。');
    }
  }

  async handleHelpCommand(ctx) {
    try {
      const helpMessage = 
        '🤖 Docker Manager 机器人帮助\n\n' +
        '📋 可用命令：\n' +
        '/start - 启动机器人\n' +
        '/servers - 查看服务器列表\n' +
        '/containers - 查看容器列表\n' +
        '/status - 查看系统状态\n' +
        '/help - 显示此帮助信息\n\n' +
        '🔧 功能说明：\n' +
        '• 查看服务器状态和容器信息\n' +
        '• 启动/停止/重启容器\n' +
        '• 查看系统监控数据\n' +
        '• 接收系统告警通知\n\n' +
        '💡 提示：使用内联按钮可以快速访问功能';

      await ctx.reply(helpMessage);
    } catch (error) {
      logger.error('处理 /help 命令失败:', error);
      await ctx.reply('抱歉，发生了错误，请稍后重试。');
    }
  }

  async handleServersCommand(ctx) {
    try {
      const userId = ctx.from.id;
      const user = await this.getUserByTelegramId(userId);
      
      if (!user) {
        await ctx.reply('请先在 Web 界面中注册并绑定 Telegram ID。');
        return;
      }

      const servers = await this.getUserServers(user.id);
      
      if (servers.length === 0) {
        await ctx.reply('您没有访问任何服务器的权限。');
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

      await ctx.reply(message, { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      });
    } catch (error) {
      logger.error('处理 /servers 命令失败:', error);
      await ctx.reply('抱歉，发生了错误，请稍后重试。');
    }
  }

  async handleRefreshServers(ctx) {
    try {
      const userId = ctx.from.id;
      const user = await this.getUserByTelegramId(userId);
      
      if (!user) {
        await ctx.editMessageText('请先在 Web 界面中注册并绑定 Telegram ID。');
        return;
      }

      const servers = await this.getUserServers(user.id);
      
      if (servers.length === 0) {
        await ctx.editMessageText('您没有访问任何服务器的权限。');
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

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup
      });
    } catch (error) {
      logger.error('刷新服务器列表失败:', error);
      await ctx.editMessageText('抱歉，刷新失败，请稍后重试。');
    }
  }

  async handleContainersCommand(ctx) {
    try {
      const userId = ctx.from.id;
      const user = await this.getUserByTelegramId(userId);
      
      if (!user) {
        await ctx.reply('请先在 Web 界面中注册并绑定 Telegram ID。');
        return;
      }

      const servers = await this.getUserServers(user.id);
      
      if (servers.length === 0) {
        await ctx.reply('您没有访问任何服务器的权限。');
        return;
      }

      const buttons = servers.map(server => [
        Markup.button.callback(
          `🐳 ${server.name} 的容器`,
          `containers_${server.id}`
        )
      ]);

      await ctx.reply(
        '🐳 选择要查看容器的服务器：',
        Markup.inlineKeyboard(buttons)
      );
    } catch (error) {
      logger.error('处理 /containers 命令失败:', error);
      await ctx.reply('抱歉，发生了错误，请稍后重试。');
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
        `🔄 监控服务: ${monitoringStatus.isRunning ? '运行中' : '已停止'}\n` +
        `🖥️ 总服务器: ${totalServers.count}个`
      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('处理 /status 命令失败:', error);
      await ctx.reply('抱歉，发生了错误，请稍后重试。');
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

      if (data === 'servers') {
        await this.handleServersCommand(ctx);
      } else if (data === 'containers') {
        await this.handleContainersCommand(ctx);
      } else if (data === 'status') {
        await this.handleStatusCommand(ctx);
      } else if (data === 'main_menu') {
        await this.handleStartCommand(ctx);
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
        const serverId = parseInt(data.split('_')[1]);
        await this.handleServerContainers(ctx, serverId);
      } else if (data.startsWith('container_')) {
        const [_, serverId, containerId, action] = data.split('_');
        await this.handleContainerAction(ctx, parseInt(serverId), containerId, action);
      }
    } catch (error) {
      logger.error('处理回调查询失败:', error);
      await ctx.reply('抱歉，发生了错误，请稍后重试。');
    }
  }

  async handleServerDetails(ctx, serverId) {
    try {
      const server = await this.getServerById(serverId);
      if (!server) {
        await ctx.reply('服务器不存在。');
        return;
      }

      const status = await this.checkServerStatus(serverId);
      const statusIcon = status ? '🟢' : '🔴';
      const statusText = status ? '在线' : '离线';

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
        message += '🐳 该服务器上没有容器。';
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

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      });
    } catch (error) {
      logger.error('处理服务器详情失败:', error);
      
      if (this.isServerConnectionError(error)) {
        await this.sendServerConnectionError(ctx);
      } else {
        await ctx.reply('抱歉，发生了错误，请稍后重试。');
      }
    }
  }

  async handleServerContainers(ctx, serverId) {
    try {
      const containers = await dockerService.getContainers(serverId);
      
      if (containers.length === 0) {
        await ctx.reply('该服务器上没有容器。');
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

      // 容器列表
      message += `📋 **容器列表**\n`;
      const buttons = [];

      for (const container of containers.slice(0, 8)) { // 限制显示前8个容器
        const statusIcon = this.isContainerRunning(container) ? '🟢' : '🔴';
        const statusText = this.isContainerRunning(container) ? '运行中' : '已停止';
        
        message += `${statusIcon} **${container.name}**\n`;
        message += `   状态: ${statusText}\n`;
        message += `   镜像: ${container.image}\n\n`;

        buttons.push([Markup.button.callback(
          `${statusIcon} ${container.name}`,
          `container_${serverId}_${container.id}_details`
        )]);
      }

      if (containers.length > 8) {
        message += `... 还有 ${containers.length - 8} 个容器`;
      }

      // 添加控制按钮
      buttons.push([
        Markup.button.callback('🔄 刷新', `refresh_containers_${serverId}`),
        Markup.button.callback('🔍 搜索', `search_containers_${serverId}`)
      ]);
      buttons.push([Markup.button.callback('🔙 返回服务器', 'servers')]);

      await ctx.reply(message, { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      });
    } catch (error) {
      logger.error('处理服务器容器失败:', error);
      
      if (this.isServerConnectionError(error)) {
        await this.sendServerConnectionError(ctx);
      } else {
        await ctx.reply('抱歉，发生了错误，请稍后重试。');
      }
    }
  }

  async handleContainerAction(ctx, serverId, containerId, action) {
    try {
      if (action === 'details') {
        await this.showContainerDetails(ctx, serverId, containerId);
      } else if (['start', 'stop', 'restart'].includes(action)) {
        await this.performContainerAction(ctx, serverId, containerId, action);
      }
    } catch (error) {
      logger.error('处理容器操作失败:', error);
      await ctx.reply('抱歉，发生了错误，请稍后重试。');
    }
  }

  async showContainerDetails(ctx, serverId, containerId) {
    try {
      const userId = ctx.from.id;
      const user = await this.getUserByTelegramId(userId);
      
      if (!user) {
        await ctx.reply('请先在 Web 界面中注册并绑定 Telegram ID。');
        return;
      }

      const container = await dockerService.getContainerInfo(serverId, containerId);
      
      if (!container) {
        await ctx.reply('容器不存在。');
        return;
      }

      // 检查用户权限
      const hasControlPermission = await this.checkUserServerControlPermission(user.id, serverId);
      const hasViewPermission = await this.checkUserServerViewPermission(user.id, serverId);

      if (!hasViewPermission) {
        await ctx.reply('❌ 您没有权限查看此服务器的容器。');
        return;
      }

      const statusIcon = this.isContainerRunning(container) ? '🟢' : '🔴';
      const statusText = this.isContainerRunning(container) ? '运行中' : '已停止';

      // 获取服务器信息
      const server = await this.getServerById(serverId);
      const serverName = server ? server.name : `服务器 ${serverId}`;

      let message = `🐳 **容器详情**\n\n`;
      message += `**${container.name}**\n`;
      message += `服务器: ${serverName}\n\n`;
      
      message += `📊 **状态信息**\n`;
      message += `状态: ${statusIcon} ${statusText}\n`;
      message += `镜像: ${container.image}\n`;
      message += `创建时间: ${new Date(container.created).toLocaleString('zh-CN')}\n\n`;

      if (container.ports && container.ports.length > 0) {
        message += `🔌 **端口映射**\n`;
        container.ports.forEach(port => {
          message += `${port.publicPort}:${port.privatePort} (${port.type})\n`;
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

      await ctx.reply(message, { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      });
    } catch (error) {
      logger.error('显示容器详情失败:', error);
      
      if (this.isServerConnectionError(error)) {
        await this.sendServerConnectionError(ctx);
      } else {
        await ctx.reply('抱歉，发生了错误，请稍后重试。');
      }
    }
  }

  async performContainerAction(ctx, serverId, containerId, action) {
    try {
      const userId = ctx.from.id;
      const user = await this.getUserByTelegramId(userId);
      
      if (!user) {
        await ctx.reply('请先在 Web 界面中注册并绑定 Telegram ID。');
        return;
      }

      // 检查用户是否有权限控制此服务器
      const hasControlPermission = await this.checkUserServerControlPermission(user.id, serverId);
      if (!hasControlPermission && ['start', 'stop', 'restart'].includes(action)) {
        await ctx.reply('❌ 您没有权限控制此服务器的容器。');
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
          await ctx.reply('不支持的操作。');
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
        await ctx.reply('抱歉，发生了错误，请稍后重试。');
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
      await ctx.reply('抱歉，发生了错误，请稍后重试。');
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
      await ctx.reply('抱歉，发生了错误，请稍后重试。');
    }
  }

  // 新增：显示容器日志
  async showContainerLogs(ctx, serverId, containerId) {
    try {
      const logs = await dockerService.getContainerLogs(serverId, containerId, { tail: 20 });
      
      let message = `📋 **容器日志**\n\n`;
      if (logs && logs.length > 0) {
        // 限制日志长度，避免消息过长
        const recentLogs = logs.slice(-10);
        message += '```\n';
        message += recentLogs.join('\n');
        message += '\n```';
      } else {
        message += '暂无日志信息';
      }

      await ctx.reply(message, { 
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
        await ctx.reply('获取日志失败，请稍后重试。');
      }
    }
  }


  // 新增：处理文本消息
  async handleTextMessage(ctx) {
    try {
      const userId = ctx.from.id;
      const text = ctx.message.text;
      const userSession = this.userSessions.get(userId);

      if (!userSession) {
        // 如果没有会话状态，忽略文本消息
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
      await ctx.reply('抱歉，发生了错误，请稍后重试。');
    }
  }

  // 新增：执行服务器搜索
  async performServerSearch(ctx, keyword) {
    try {
      const userId = ctx.from.id;
      const user = await this.getUserByTelegramId(userId);
      
      if (!user) {
        await ctx.reply('请先在 Web 界面中注册并绑定 Telegram ID。');
        return;
      }

      const servers = await this.getUserServers(user.id);
      const filteredServers = servers.filter(server => 
        server.name.toLowerCase().includes(keyword.toLowerCase()) ||
        (server.description && server.description.toLowerCase().includes(keyword.toLowerCase()))
      );

      if (filteredServers.length === 0) {
        await ctx.reply(
          `🔍 **搜索结果**\n\n没有找到包含 "${keyword}" 的服务器。`,
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
      await ctx.reply('搜索失败，请稍后重试。');
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
          `🔍 **搜索结果**\n\n没有找到包含 "${keyword}" 的容器。`,
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
        await ctx.reply('搜索失败，请稍后重试。');
      }
    }
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
    await ctx.reply('⚠️ 服务器连接失败\n\n服务器有可能不在线，或稍后重试。');
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
      // 获取服务器完整信息
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
        `验证码将在 5 分钟后过期，请及时使用。\n\n` +
        `如果您没有请求此验证码，请忽略此消息。`,
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
}

export default new TelegramBotService();