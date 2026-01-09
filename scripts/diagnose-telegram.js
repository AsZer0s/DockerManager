#!/usr/bin/env node

/**
 * Telegram Bot 诊断工具
 * 检查 Telegram Bot 配置和常见问题
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

// 检查环境变量配置
function checkEnvironmentVariables() {
  log.title('🔍 检查环境变量配置');
  
  const requiredVars = ['TELEGRAM_BOT_TOKEN'];
  const optionalVars = ['TELEGRAM_WEBAPP_URL', 'TGBOT_PROXY'];
  
  let hasRequired = true;
  
  // 检查必需变量
  requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (value && value !== 'your_telegram_bot_token_here') {
      log.success(`${varName}: ${value.substring(0, 10)}... (已设置)`);
    } else {
      log.error(`${varName}: 未设置或为占位符`);
      hasRequired = false;
    }
  });
  
  // 检查可选变量
  optionalVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      log.info(`${varName}: ${value}`);
    } else {
      log.warning(`${varName}: 未设置 (可选)`);
    }
  });
  
  return hasRequired;
}

// 验证 Bot Token 格式
function validateBotToken() {
  log.title('🔑 验证 Bot Token 格式');
  
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token || token === 'your_telegram_bot_token_here') {
    log.error('Bot Token 未设置');
    return false;
  }
  
  // Telegram Bot Token 格式: 数字:字母数字字符串
  const tokenRegex = /^\d+:[A-Za-z0-9_-]+$/;
  
  if (!tokenRegex.test(token)) {
    log.error('Bot Token 格式无效');
    log.info('正确格式应为: 123456789:ABCdefGHIjklMNOpqrSTUvwxYZ');
    return false;
  }
  
  log.success('Bot Token 格式正确');
  return true;
}

// 测试 Bot API 连接
async function testBotConnection() {
  log.title('🌐 测试 Bot API 连接');
  
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token || token === 'your_telegram_bot_token_here') {
    log.error('无法测试连接：Bot Token 未设置');
    return false;
  }
  
  try {
    // 检查是否需要代理
    const proxyUrl = process.env.TGBOT_PROXY;
    let fetchOptions = {};
    
    if (proxyUrl) {
      log.info(`使用代理: ${proxyUrl}`);
      // 注意：这里需要根据实际环境配置代理
      // 在 Node.js 中，可能需要使用 https-proxy-agent 或 socks-proxy-agent
    }
    
    // 测试 getMe API
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, fetchOptions);
    
    if (!response.ok) {
      const errorData = await response.json();
      log.error(`API 请求失败: ${response.status} ${response.statusText}`);
      log.error(`错误详情: ${errorData.description || '未知错误'}`);
      
      if (response.status === 401) {
        log.error('认证失败，请检查 Bot Token 是否正确');
      } else if (response.status === 403) {
        log.error('访问被拒绝，Bot 可能被禁用');
      }
      
      return false;
    }
    
    const botInfo = await response.json();
    
    if (botInfo.ok) {
      log.success('Bot API 连接成功');
      log.info(`Bot 信息:`);
      console.log(`  ID: ${botInfo.result.id}`);
      console.log(`  用户名: @${botInfo.result.username}`);
      console.log(`  名称: ${botInfo.result.first_name}`);
      console.log(`  支持群组: ${botInfo.result.can_join_groups ? '是' : '否'}`);
      console.log(`  支持内联查询: ${botInfo.result.supports_inline_queries ? '是' : '否'}`);
      return true;
    } else {
      log.error('Bot API 返回错误:', botInfo.description);
      return false;
    }
    
  } catch (error) {
    log.error('连接测试失败:', error.message);
    
    if (error.code === 'ENOTFOUND') {
      log.warning('DNS 解析失败，可能需要代理或检查网络连接');
    } else if (error.code === 'ECONNREFUSED') {
      log.warning('连接被拒绝，可能需要代理');
    } else if (error.code === 'ETIMEDOUT') {
      log.warning('连接超时，可能需要代理或网络问题');
    }
    
    return false;
  }
}

// 检查代理配置
function checkProxyConfiguration() {
  log.title('🔧 检查代理配置');
  
  const proxyUrl = process.env.TGBOT_PROXY;
  
  if (!proxyUrl) {
    log.info('未配置代理');
    return true;
  }
  
  log.info(`代理地址: ${proxyUrl}`);
  
  // 检查代理格式
  try {
    const url = new URL(proxyUrl);
    
    if (['http:', 'https:', 'socks4:', 'socks5:'].includes(url.protocol)) {
      log.success(`代理协议: ${url.protocol.slice(0, -1)}`);
      log.info(`代理主机: ${url.hostname}:${url.port}`);
      
      if (url.username) {
        log.info(`代理认证: ${url.username}:${'*'.repeat(url.password?.length || 0)}`);
      }
      
      return true;
    } else {
      log.error(`不支持的代理协议: ${url.protocol}`);
      log.info('支持的协议: http, https, socks4, socks5');
      return false;
    }
  } catch (error) {
    log.error('代理 URL 格式无效:', error.message);
    return false;
  }
}

// 检查数据库配置
async function checkDatabaseConfiguration() {
  log.title('💾 检查数据库配置');
  
  try {
    // 动态导入数据库模块
    const database = (await import('../server/config/database.js')).default;
    
    // 连接数据库
    await database.connect();
    
    if (!database.isConnected) {
      log.error('数据库连接失败');
      return false;
    }
    
    log.success('数据库连接正常');
    
    // 检查用户表是否存在 telegram_id 字段
    const tableInfo = await database.query("PRAGMA table_info(users)");
    const hasTelegramId = tableInfo.rows.some(row => row.name === 'telegram_id');
    
    if (hasTelegramId) {
      log.success('用户表包含 telegram_id 字段');
    } else {
      log.error('用户表缺少 telegram_id 字段');
      return false;
    }
    
    // 检查是否有绑定 Telegram 的用户
    const telegramUsers = await database.query(
      "SELECT COUNT(*) as count FROM users WHERE telegram_id IS NOT NULL"
    );
    
    const count = telegramUsers.rows[0]?.count || 0;
    log.info(`已绑定 Telegram 的用户数: ${count}`);
    
    return true;
  } catch (error) {
    log.error('数据库检查失败:', error.message);
    return false;
  }
}

// 检查 Telegram Bot 服务状态
async function checkTelegramBotService() {
  log.title('🤖 检查 Telegram Bot 服务');
  
  try {
    // 动态导入 Telegram Bot 服务
    const telegramBot = (await import('../server/services/telegramBot.js')).default;
    
    if (!telegramBot) {
      log.error('Telegram Bot 服务未加载');
      return false;
    }
    
    log.info(`Bot 初始化状态: ${telegramBot.isInitialized ? '已初始化' : '未初始化'}`);
    
    if (telegramBot.isInitialized && telegramBot.bot) {
      log.success('Telegram Bot 服务运行正常');
      
      // 尝试获取 Bot 信息
      try {
        const botInfo = await telegramBot.getBotInfo();
        if (botInfo.id) {
          log.info(`Bot ID: ${botInfo.id}`);
          log.info(`Bot 用户名: @${botInfo.username}`);
        }
      } catch (error) {
        log.warning('获取 Bot 信息失败:', error.message);
      }
      
      return true;
    } else {
      log.warning('Telegram Bot 服务未初始化');
      return false;
    }
  } catch (error) {
    log.error('检查 Telegram Bot 服务失败:', error.message);
    return false;
  }
}

// 提供解决建议
function provideSolutions() {
  log.title('💡 解决建议');
  
  console.log('如果 Telegram Bot 仍然无法正常工作，请尝试以下解决方案:');
  console.log('');
  
  console.log('1. 获取 Bot Token:');
  console.log('   - 在 Telegram 中搜索 @BotFather');
  console.log('   - 发送 /newbot 创建新机器人');
  console.log('   - 按提示设置机器人名称和用户名');
  console.log('   - 复制获得的 Token 到 TELEGRAM_BOT_TOKEN');
  console.log('');
  
  console.log('2. 网络连接问题:');
  console.log('   - 如果在中国大陆，可能需要配置代理');
  console.log('   - 设置 TGBOT_PROXY 环境变量');
  console.log('   - 支持 HTTP/HTTPS/SOCKS4/SOCKS5 代理');
  console.log('');
  
  console.log('3. 配置代理:');
  console.log('   - HTTP 代理: TGBOT_PROXY=http://127.0.0.1:8080');
  console.log('   - SOCKS5 代理: TGBOT_PROXY=socks5://127.0.0.1:1080');
  console.log('   - 带认证: TGBOT_PROXY=http://user:pass@127.0.0.1:8080');
  console.log('');
  
  console.log('4. 测试 Bot:');
  console.log('   - 在 Telegram 中搜索你的机器人用户名');
  console.log('   - 发送 /start 命令测试');
  console.log('   - 检查机器人是否响应');
  console.log('');
  
  console.log('5. 调试工具:');
  console.log('   - 查看应用日志: docker-compose logs -f');
  console.log('   - 检查网络连接: curl https://api.telegram.org');
  console.log('   - 测试代理: curl --proxy $TGBOT_PROXY https://api.telegram.org');
  console.log('');
}

// 主函数
async function main() {
  console.log(`${colors.bold}${colors.cyan}`);
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  Telegram Bot 诊断工具                       ║');
  console.log('║                检查配置和诊断常见问题                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  // 加载环境变量
  loadEnvFile();

  const results = {
    envVars: false,
    tokenFormat: false,
    botConnection: false,
    proxyConfig: false,
    database: false,
    botService: false
  };

  try {
    // 执行所有检查
    results.envVars = checkEnvironmentVariables();
    results.tokenFormat = validateBotToken();
    results.botConnection = await testBotConnection();
    results.proxyConfig = checkProxyConfiguration();
    results.database = await checkDatabaseConfiguration();
    results.botService = await checkTelegramBotService();
    
    // 统计结果
    const passed = Object.values(results).filter(Boolean).length;
    const total = Object.keys(results).length;
    
    log.title('📋 诊断结果');
    console.log(`通过检查: ${passed}/${total}`);
    
    if (passed === total) {
      log.success('🎉 所有检查通过！Telegram Bot 应该可以正常工作');
    } else if (passed >= total * 0.6) {
      log.warning('⚠️ 大部分检查通过，但仍有一些问题需要解决');
    } else {
      log.error('❌ 多项检查失败，Telegram Bot 可能无法正常工作');
    }
    
    // 提供解决建议
    if (passed < total) {
      provideSolutions();
    }
    
  } catch (error) {
    log.error('诊断过程中出现错误:');
    console.error(error);
    process.exit(1);
  }
}

// 处理命令行参数
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('Telegram Bot 诊断工具');
  console.log('');
  console.log('用法: node diagnose-telegram.js');
  console.log('');
  console.log('功能:');
  console.log('  - 检查环境变量配置');
  console.log('  - 验证 Bot Token 格式');
  console.log('  - 测试 Bot API 连接');
  console.log('  - 检查代理配置');
  console.log('  - 验证数据库配置');
  console.log('  - 检查 Bot 服务状态');
  console.log('');
  process.exit(0);
}

// 运行诊断
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('diagnose-telegram.js')) {
  main();
}