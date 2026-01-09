#!/usr/bin/env node

/**
 * SMTP 邮件发送测试工具
 * 用于诊断和测试邮件服务配置
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

// 加载环境变量
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

loadEnvFile();

// 动态导入 nodemailer
const nodemailer = await import('../server/node_modules/nodemailer/lib/nodemailer.js');

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

// 获取 SMTP 配置
function getSMTPConfig() {
  log.title('📧 获取 SMTP 配置');
  
  const config = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    from: process.env.SMTP_FROM || 'Docker Manager <noreply@dockermanager.com>'
  };
  
  // 检查必需的配置
  const requiredFields = ['host', 'auth.user', 'auth.pass'];
  const missing = [];
  
  if (!config.host) missing.push('SMTP_HOST');
  if (!config.auth.user) missing.push('SMTP_USER');
  if (!config.auth.pass) missing.push('SMTP_PASS');
  
  if (missing.length > 0) {
    log.error(`缺少必需的环境变量: ${missing.join(', ')}`);
    return null;
  }
  
  // 显示配置信息（隐藏密码）
  log.info(`主机: ${config.host}`);
  log.info(`端口: ${config.port}`);
  log.info(`安全连接: ${config.secure ? '是' : '否'}`);
  log.info(`用户名: ${config.auth.user}`);
  log.info(`密码: ${'*'.repeat(config.auth.pass.length)}`);
  log.info(`发件人: ${config.from}`);
  
  return config;
}

// 测试 SMTP 连接
async function testSMTPConnection(config) {
  log.title('🔗 测试 SMTP 连接');
  
  try {
    const transporter = nodemailer.createTransporter(config);
    
    log.info('正在验证 SMTP 连接...');
    await transporter.verify();
    
    log.success('SMTP 连接验证成功！');
    return { success: true, transporter };
  } catch (error) {
    log.error('SMTP 连接验证失败:');
    console.error(`  错误类型: ${error.code || 'UNKNOWN'}`);
    console.error(`  错误信息: ${error.message}`);
    
    // 提供常见错误的解决建议
    if (error.code === 'EAUTH') {
      log.warning('认证失败，请检查:');
      console.log('  1. 用户名和密码是否正确');
      console.log('  2. 是否启用了两步验证（需要使用应用专用密码）');
      console.log('  3. 是否启用了"允许不够安全的应用"');
    } else if (error.code === 'ECONNECTION') {
      log.warning('连接失败，请检查:');
      console.log('  1. SMTP 服务器地址和端口是否正确');
      console.log('  2. 网络连接是否正常');
      console.log('  3. 防火墙是否阻止了连接');
    } else if (error.code === 'ETIMEDOUT') {
      log.warning('连接超时，请检查:');
      console.log('  1. 网络连接是否稳定');
      console.log('  2. SMTP 服务器是否可访问');
    }
    
    return { success: false, error };
  }
}

// 发送测试邮件
async function sendTestEmail(transporter, config, recipient) {
  log.title('📮 发送测试邮件');
  
  const testEmail = recipient || config.auth.user;
  
  const mailOptions = {
    from: config.from,
    to: testEmail,
    subject: 'Docker Manager SMTP 测试邮件',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Docker Manager</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">SMTP 测试邮件</p>
        </div>
        
        <div style="padding: 20px; background: #f8f9fa;">
          <h2 style="color: #333; margin-top: 0;">测试成功！</h2>
          <p style="font-size: 16px; line-height: 1.6; color: #555;">
            恭喜！您的 SMTP 邮件服务配置正确，可以正常发送邮件。
          </p>
          
          <div style="margin: 15px 0; padding: 15px; background: #e8f5e8; border-left: 4px solid #4caf50; border-radius: 4px;">
            <h3 style="margin: 0 0 10px 0; color: #2e7d32;">配置信息</h3>
            <p style="margin: 5px 0; color: #555;"><strong>SMTP 服务器:</strong> ${config.host}:${config.port}</p>
            <p style="margin: 5px 0; color: #555;"><strong>安全连接:</strong> ${config.secure ? 'SSL/TLS' : 'STARTTLS'}</p>
            <p style="margin: 5px 0; color: #555;"><strong>发送账户:</strong> ${config.auth.user}</p>
            <p style="margin: 5px 0; color: #555;"><strong>测试时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>
          </div>
          
          <div style="margin: 15px 0; padding: 15px; background: #fff3e0; border-left: 4px solid #ff9800; border-radius: 4px;">
            <h3 style="margin: 0 0 10px 0; color: #f57c00;">注意事项</h3>
            <ul style="margin: 0; padding-left: 20px; color: #555;">
              <li>请确保邮件服务器配置的安全性</li>
              <li>定期检查邮件发送日志</li>
              <li>避免发送垃圾邮件</li>
            </ul>
          </div>
        </div>
        
        <div style="padding: 15px; background: #f5f5f5; text-align: center; color: #666; font-size: 12px;">
          <p>此邮件由 Docker Manager SMTP 测试工具自动发送</p>
        </div>
      </div>
    `
  };
  
  try {
    log.info(`正在发送测试邮件到: ${testEmail}`);
    const result = await transporter.sendMail(mailOptions);
    
    log.success('测试邮件发送成功！');
    log.info(`消息ID: ${result.messageId}`);
    log.info(`接收者: ${result.accepted.join(', ')}`);
    
    if (result.rejected.length > 0) {
      log.warning(`被拒绝的收件人: ${result.rejected.join(', ')}`);
    }
    
    return { success: true, result };
  } catch (error) {
    log.error('测试邮件发送失败:');
    console.error(`  错误信息: ${error.message}`);
    
    return { success: false, error };
  }
}

// 常见邮件服务商配置示例
function showCommonConfigs() {
  log.title('📋 常见邮件服务商配置');
  
  const configs = [
    {
      name: 'Gmail',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      note: '需要启用两步验证并使用应用专用密码'
    },
    {
      name: 'QQ邮箱',
      host: 'smtp.qq.com',
      port: 587,
      secure: false,
      note: '需要开启SMTP服务并使用授权码'
    },
    {
      name: '163邮箱',
      host: 'smtp.163.com',
      port: 587,
      secure: false,
      note: '需要开启SMTP服务并使用授权码'
    },
    {
      name: 'Outlook/Hotmail',
      host: 'smtp-mail.outlook.com',
      port: 587,
      secure: false,
      note: '使用Microsoft账户密码或应用密码'
    },
    {
      name: '阿里云邮箱',
      host: 'smtp.mxhichina.com',
      port: 587,
      secure: false,
      note: '企业邮箱服务'
    }
  ];
  
  configs.forEach(config => {
    console.log(`${colors.bold}${config.name}:${colors.reset}`);
    console.log(`  SMTP_HOST=${config.host}`);
    console.log(`  SMTP_PORT=${config.port}`);
    console.log(`  SMTP_SECURE=${config.secure}`);
    console.log(`  ${colors.yellow}注意: ${config.note}${colors.reset}`);
    console.log('');
  });
}

// 主函数
async function main() {
  console.log(`${colors.bold}${colors.cyan}`);
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    SMTP 邮件服务测试工具                     ║');
  console.log('║                  诊断和测试邮件发送功能                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  try {
    // 获取配置
    const config = getSMTPConfig();
    if (!config) {
      log.error('无法获取 SMTP 配置，请检查环境变量设置');
      showCommonConfigs();
      return;
    }
    
    // 测试连接
    const connectionResult = await testSMTPConnection(config);
    if (!connectionResult.success) {
      log.error('SMTP 连接测试失败，无法继续');
      return;
    }
    
    // 发送测试邮件
    const recipient = process.argv[2]; // 可选的收件人参数
    const emailResult = await sendTestEmail(connectionResult.transporter, config, recipient);
    
    if (emailResult.success) {
      log.title('🎉 测试完成');
      log.success('SMTP 邮件服务配置正确，可以正常使用！');
    } else {
      log.title('❌ 测试失败');
      log.error('邮件发送失败，请检查配置和网络连接');
    }
    
  } catch (error) {
    log.error('测试过程中出现错误:');
    console.error(error);
    process.exit(1);
  }
}

// 处理命令行参数
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('SMTP 邮件服务测试工具');
  console.log('');
  console.log('用法: node test-smtp.js [收件人邮箱]');
  console.log('');
  console.log('选项:');
  console.log('  --help, -h      显示帮助信息');
  console.log('  --configs       显示常见邮件服务商配置');
  console.log('');
  console.log('示例:');
  console.log('  node test-smtp.js                    # 发送到配置的邮箱');
  console.log('  node test-smtp.js test@example.com   # 发送到指定邮箱');
  console.log('');
  process.exit(0);
}

if (args.includes('--configs')) {
  showCommonConfigs();
  process.exit(0);
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('test-smtp.js')) {
  main();
}