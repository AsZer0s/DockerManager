#!/usr/bin/env node

/**
 * 简单的 SMTP 测试工具
 * 直接测试邮件发送功能
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

async function testSMTP() {
  console.log(`${colors.bold}${colors.cyan}`);
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    简单 SMTP 测试工具                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  // 加载环境变量
  loadEnvFile();

  log.title('📧 检查 SMTP 配置');

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

  // 检查配置
  if (!config.host || !config.auth.user || !config.auth.pass) {
    log.error('SMTP 配置不完整');
    console.log('请检查以下环境变量:');
    console.log(`  SMTP_HOST: ${config.host || '未设置'}`);
    console.log(`  SMTP_USER: ${config.auth.user || '未设置'}`);
    console.log(`  SMTP_PASS: ${config.auth.pass ? '已设置' : '未设置'}`);
    return;
  }

  log.success('SMTP 配置检查通过');
  console.log(`  主机: ${config.host}:${config.port}`);
  console.log(`  安全连接: ${config.secure ? '是' : '否'}`);
  console.log(`  用户: ${config.auth.user}`);

  try {
    log.title('🔗 测试 SMTP 连接');

    // 动态导入 nodemailer
    const nodemailer = await import('../server/node_modules/nodemailer/lib/nodemailer.js');
    
    const transporter = nodemailer.default.createTransport(config);
    
    log.info('正在验证 SMTP 连接...');
    await transporter.verify();
    log.success('SMTP 连接验证成功！');

    log.title('📮 发送测试邮件');
    
    const recipient = process.argv[2] || config.auth.user;
    
    const mailOptions = {
      from: config.from,
      to: recipient,
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
          </div>
          
          <div style="padding: 15px; background: #f5f5f5; text-align: center; color: #666; font-size: 12px;">
            <p>此邮件由 Docker Manager SMTP 测试工具自动发送</p>
          </div>
        </div>
      `
    };

    log.info(`正在发送测试邮件到: ${recipient}`);
    const result = await transporter.sendMail(mailOptions);
    
    log.success('测试邮件发送成功！');
    log.info(`消息ID: ${result.messageId}`);
    
    if (result.accepted && result.accepted.length > 0) {
      log.info(`接收者: ${result.accepted.join(', ')}`);
    }
    
    if (result.rejected && result.rejected.length > 0) {
      log.warning(`被拒绝的收件人: ${result.rejected.join(', ')}`);
    }

    log.title('🎉 测试完成');
    log.success('SMTP 邮件服务配置正确，可以正常使用！');

  } catch (error) {
    log.error('SMTP 测试失败:');
    console.error(`  错误类型: ${error.code || 'UNKNOWN'}`);
    console.error(`  错误信息: ${error.message}`);
    
    // 提供常见错误的解决建议
    if (error.code === 'EAUTH') {
      log.warning('认证失败，请检查:');
      console.log('  1. 163邮箱需要开启SMTP服务');
      console.log('  2. 使用授权码而不是登录密码');
      console.log('  3. 在163邮箱设置中生成授权码');
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
  }
}

// 运行测试
testSMTP().catch(console.error);