#!/usr/bin/env node

/**
 * Telegram Bot 连接测试工具
 * 测试不同的连接方式和代理配置
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

// 测试直连（无代理）
async function testDirectConnection(token) {
  log.title('🌐 测试直连（无代理）');
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      method: 'GET',
      timeout: 10000
    });
    
    if (response.ok) {
      const data = await response.json();
      log.success('直连成功');
      log.info(`Bot: @${data.result.username} (${data.result.first_name})`);
      return true;
    } else {
      log.error(`直连失败: ${response.status} ${response.statusText}`);
      return false;
    }
  } catch (error) {
    log.error('直连失败:', error.message);
    return false;
  }
}

// 测试代理连接
async function testProxyConnection(token, proxyUrl) {
  log.title('🔧 测试代理连接');
  
  try {
    // 动态导入代理模块
    let agent;
    
    if (proxyUrl.startsWith('http://') || proxyUrl.startsWith('https://')) {
      const { HttpsProxyAgent } = await import('https-proxy-agent');
      agent = new HttpsProxyAgent(proxyUrl);
      log.info('使用 HTTP 代理');
    } else if (proxyUrl.startsWith('socks5://') || proxyUrl.startsWith('socks4://')) {
      const { SocksProxyAgent } = await import('socks-proxy-agent');
      agent = new SocksProxyAgent(proxyUrl);
      log.info('使用 SOCKS 代理');
    } else {
      log.error('不支持的代理协议');
      return false;
    }
    
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      method: 'GET',
      agent: agent,
      timeout: 15000
    });
    
    if (response.ok) {
      const data = await response.json();
      log.success('代理连接成功');
      log.info(`Bot: @${data.result.username} (${data.result.first_name})`);
      return true;
    } else {
      log.error(`代理连接失败: ${response.status} ${response.statusText}`);
      return false;
    }
  } catch (error) {
    log.error('代理连接失败:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      log.warning('代理服务器连接被拒绝，请检查代理是否正在运行');
    } else if (error.code === 'ENOTFOUND') {
      log.warning('代理服务器地址无法解析');
    } else if (error.code === 'ETIMEDOUT') {
      log.warning('代理连接超时');
    }
    
    return false;
  }
}

// 测试 Webhook 设置
async function testWebhookSetup(token, proxyUrl) {
  log.title('🔗 测试 Webhook 设置');
  
  try {
    let fetchOptions = { method: 'GET', timeout: 10000 };
    
    if (proxyUrl) {
      let agent;
      if (proxyUrl.startsWith('http://') || proxyUrl.startsWith('https://')) {
        const { HttpsProxyAgent } = await import('https-proxy-agent');
        agent = new HttpsProxyAgent(proxyUrl);
      } else if (proxyUrl.startsWith('socks5://') || proxyUrl.startsWith('socks4://')) {
        const { SocksProxyAgent } = await import('socks-proxy-agent');
        agent = new SocksProxyAgent(proxyUrl);
      }
      fetchOptions.agent = agent;
    }
    
    // 获取当前 Webhook 信息
    const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, fetchOptions);
    
    if (response.ok) {
      const data = await response.json();
      log.success('Webhook 信息获取成功');
      
      if (data.result.url) {
        log.info(`当前 Webhook URL: ${data.result.url}`);
        log.info(`待处理更新数: ${data.result.pending_update_count}`);
        
        if (data.result.last_error_date) {
          log.warning(`最后错误时间: ${new Date(data.result.last_error_date * 1000).toLocaleString()}`);
          log.warning(`最后错误信息: ${data.result.last_error_message}`);
        }
      } else {
        log.info('未设置 Webhook，使用长轮询模式');
      }
      
      return true;
    } else {
      log.error(`获取 Webhook 信息失败: ${response.status}`);
      return false;
    }
  } catch (error) {
    log.error('获取 Webhook 信息失败:', error.message);
    return false;
  }
}

// 测试发送消息
async function testSendMessage(token, proxyUrl) {
  log.title('📤 测试发送消息');
  
  // 这里需要一个测试用的 chat_id
  // 通常可以使用 Bot 创建者的 chat_id 进行测试
  log.info('跳过消息发送测试（需要有效的 chat_id）');
  log.info('建议：在 Telegram 中向你的 Bot 发送 /start 命令进行测试');
  
  return true;
}

// 检查代理服务器状态
async function checkProxyServer(proxyUrl) {
  log.title('🔍 检查代理服务器状态');
  
  try {
    const url = new URL(proxyUrl);
    const host = url.hostname;
    const port = url.port || (url.protocol === 'https:' ? 443 : 80);
    
    log.info(`检查代理服务器: ${host}:${port}`);
    
    // 简单的连接测试
    const net = await import('net');
    
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        log.error('代理服务器连接超时');
        resolve(false);
      }, 5000);
      
      socket.connect(port, host, () => {
        clearTimeout(timeout);
        socket.destroy();
        log.success('代理服务器连接正常');
        resolve(true);
      });
      
      socket.on('error', (error) => {
        clearTimeout(timeout);
        log.error('代理服务器连接失败:', error.message);
        resolve(false);
      });
    });
  } catch (error) {
    log.error('检查代理服务器失败:', error.message);
    return false;
  }
}

// 主函数
async function main() {
  console.log(`${colors.bold}${colors.cyan}`);
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                Telegram Bot 连接测试工具                     ║');
  console.log('║              测试不同连接方式和代理配置                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  // 加载环境变量
  loadEnvFile();

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const proxyUrl = process.env.TGBOT_PROXY;

  if (!token || token === 'your_telegram_bot_token_here') {
    log.error('TELEGRAM_BOT_TOKEN 未设置，无法进行测试');
    return;
  }

  log.info(`Bot Token: ${token.substring(0, 10)}...`);
  if (proxyUrl) {
    log.info(`代理设置: ${proxyUrl}`);
  }

  const results = {
    directConnection: false,
    proxyConnection: false,
    proxyServer: false,
    webhookInfo: false,
    sendMessage: false
  };

  try {
    // 1. 测试直连
    results.directConnection = await testDirectConnection(token);

    // 2. 如果配置了代理，检查代理服务器
    if (proxyUrl) {
      results.proxyServer = await checkProxyServer(proxyUrl);
      
      // 3. 测试代理连接
      if (results.proxyServer) {
        results.proxyConnection = await testProxyConnection(token, proxyUrl);
      }
    }

    // 4. 测试 Webhook 设置
    const connectionWorking = results.directConnection || results.proxyConnection;
    if (connectionWorking) {
      results.webhookInfo = await testWebhookSetup(token, proxyUrl);
      results.sendMessage = await testSendMessage(token, proxyUrl);
    }

    // 统计结果
    const passed = Object.values(results).filter(Boolean).length;
    const total = Object.values(results).filter(v => v !== false).length;

    log.title('📋 测试结果');
    console.log(`通过测试: ${passed}/${total}`);

    if (results.directConnection) {
      log.success('✅ 直连可用 - 无需代理');
    } else if (results.proxyConnection) {
      log.success('✅ 代理连接可用');
    } else {
      log.error('❌ 所有连接方式都失败');
    }

    // 提供建议
    log.title('💡 建议');
    
    if (!results.directConnection && !results.proxyConnection) {
      console.log('连接失败的可能原因:');
      console.log('1. 网络防火墙阻止了 Telegram API 访问');
      console.log('2. 代理服务器配置错误或未运行');
      console.log('3. Bot Token 无效');
      console.log('4. DNS 解析问题');
      console.log('');
      console.log('建议尝试:');
      console.log('- 检查代理服务器是否正常运行');
      console.log('- 尝试不同的代理服务器');
      console.log('- 在浏览器中访问 https://api.telegram.org 测试连通性');
      console.log('- 检查防火墙和网络设置');
    } else if (results.directConnection) {
      console.log('✅ 直连可用，建议移除代理配置以提高性能');
    } else if (results.proxyConnection) {
      console.log('✅ 代理连接正常，Bot 应该可以正常工作');
    }

  } catch (error) {
    log.error('测试过程中出现错误:');
    console.error(error);
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('test-telegram-connection.js')) {
  main();
}