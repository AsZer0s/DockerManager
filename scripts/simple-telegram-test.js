#!/usr/bin/env node

/**
 * 简单的 Telegram Bot 测试工具
 * 直接测试 Bot API 连接
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// 手动加载环境变量
function loadEnvFile() {
  const envPath = path.join(projectRoot, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          process.env[key] = value;
        }
      }
    });
  }
}

// 颜色定义
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

// 日志函数
const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  title: (msg) => console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`)
};

async function testTelegramBot() {
  console.log(`${colors.bold}${colors.cyan}`);
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                简单 Telegram Bot 测试工具                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  // 加载环境变量
  loadEnvFile();

  log.title('🔍 检查配置');

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const proxyUrl = process.env.TGBOT_PROXY;

  if (!token || token === 'your_telegram_bot_token_here') {
    log.error('TELEGRAM_BOT_TOKEN 未设置');
    return;
  }

  log.success(`Bot Token: ${token.substring(0, 10)}...`);
  
  if (proxyUrl) {
    log.info(`代理设置: ${proxyUrl}`);
  } else {
    log.info('未配置代理');
  }

  try {
    log.title('🤖 测试 Telegram Bot 服务');

    // 动态导入 Telegram Bot 服务
    const telegramBot = (await import('../server/services/telegramBot.js')).default;
    
    log.info('正在初始化 Telegram Bot...');
    await telegramBot.initialize();
    
    if (telegramBot.isInitialized) {
      log.success('Telegram Bot 初始化成功！');
      
      // 获取 Bot 信息
      try {
        const botInfo = await telegramBot.getBotInfo();
        log.success('Bot 信息获取成功:');
        console.log(`  ID: ${botInfo.id}`);
        console.log(`  用户名: @${botInfo.username}`);
        console.log(`  名称: ${botInfo.firstName}`);
        console.log(`  支持群组: ${botInfo.canJoinGroups ? '是' : '否'}`);
        console.log(`  支持内联查询: ${botInfo.supportsInlineQueries ? '是' : '否'}`);
      } catch (error) {
        log.warning('获取 Bot 信息失败:', error.message);
      }
      
      log.title('🎉 测试完成');
      log.success('Telegram Bot 配置正确，可以正常使用！');
      log.info('建议：在 Telegram 中搜索你的机器人并发送 /start 命令测试');
      
    } else {
      log.error('Telegram Bot 初始化失败');
      log.warning('请检查网络连接和代理设置');
    }

  } catch (error) {
    log.error('测试失败:', error.message);
    
    if (error.message.includes('ENOTFOUND')) {
      log.warning('DNS 解析失败，可能需要代理');
    } else if (error.message.includes('ECONNREFUSED')) {
      log.warning('连接被拒绝，请检查代理设置');
    } else if (error.message.includes('ETIMEDOUT')) {
      log.warning('连接超时，请检查网络和代理');
    } else if (error.message.includes('401')) {
      log.warning('Bot Token 无效，请检查 Token 是否正确');
    }
  }
}

// 运行测试
testTelegramBot().catch(console.error);