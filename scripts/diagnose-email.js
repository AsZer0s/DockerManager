#!/usr/bin/env node

/**
 * 邮件服务诊断工具
 * 检查邮件服务配置和常见问题
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 加载环境变量
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
  
  const requiredVars = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
  const optionalVars = ['SMTP_PORT', 'SMTP_SECURE', 'SMTP_FROM'];
  
  let hasRequired = true;
  
  // 检查必需变量
  requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      if (varName === 'SMTP_PASS') {
        log.success(`${varName}: ${'*'.repeat(value.length)} (已设置)`);
      } else {
        log.success(`${varName}: ${value}`);
      }
    } else {
      log.error(`${varName}: 未设置`);
      hasRequired = false;
    }
  });
  
  // 检查可选变量
  optionalVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      log.info(`${varName}: ${value}`);
    } else {
      log.warning(`${varName}: 未设置 (使用默认值)`);
    }
  });
  
  return hasRequired;
}

// 检查加密密钥
function checkEncryptionKey() {
  log.title('🔐 检查加密密钥');
  
  const encryptionKey = process.env.ENCRYPTION_KEY;
  
  if (!encryptionKey) {
    log.error('ENCRYPTION_KEY 未设置');
    return false;
  }
  
  if (encryptionKey.length !== 32) {
    log.error(`ENCRYPTION_KEY 长度错误: ${encryptionKey.length} (应为 32)`);
    return false;
  }
  
  if (!/^[0-9a-fA-F]+$/.test(encryptionKey)) {
    log.error('ENCRYPTION_KEY 不是有效的十六进制字符串');
    return false;
  }
  
  log.success(`ENCRYPTION_KEY: ${encryptionKey.substring(0, 8)}... (格式正确)`);
  return true;
}

// 检查数据库中的 SMTP 配置
async function checkDatabaseConfig() {
  log.title('💾 检查数据库中的 SMTP 配置');
  
  try {
    // 动态导入数据库模块
    const database = (await import('../server/config/database.js')).default;
    
    // 连接数据库
    await database.connect();
    
    // 查询 SMTP 配置
    const result = await database.query(
      'SELECT settings FROM system_settings WHERE key = ?',
      ['smtp_config']
    );
    
    if (result.rows.length === 0) {
      log.info('数据库中没有 SMTP 配置，将使用环境变量');
      return true;
    }
    
    const dbConfig = JSON.parse(result.rows[0].settings);
    
    log.success('数据库中存在 SMTP 配置:');
    console.log(`  主机: ${dbConfig.host || '未设置'}`);
    console.log(`  端口: ${dbConfig.port || '未设置'}`);
    console.log(`  安全连接: ${dbConfig.secure ? '是' : '否'}`);
    console.log(`  用户名: ${dbConfig.user || '未设置'}`);
    console.log(`  密码: ${dbConfig.pass ? '已设置 (加密)' : '未设置'}`);
    console.log(`  发件人: ${dbConfig.from || '未设置'}`);
    
    // 检查密码是否加密
    if (dbConfig.pass && dbConfig.pass.includes(':')) {
      log.info('密码已加密存储');
      
      // 尝试解密测试
      try {
        const encryption = (await import('../server/utils/encryption.js')).default;
        encryption.initialize();
        const decrypted = encryption.decrypt(dbConfig.pass);
        log.success('密码解密测试成功');
      } catch (error) {
        log.error('密码解密测试失败:', error.message);
        return false;
      }
    } else {
      log.warning('密码可能未加密存储');
    }
    
    return true;
  } catch (error) {
    log.error('检查数据库配置失败:', error.message);
    return false;
  }
}

// 检查邮件服务状态
async function checkEmailService() {
  log.title('📧 检查邮件服务状态');
  
  try {
    // 动态导入邮件服务
    const notificationService = (await import('../server/services/notificationService.js')).default;
    
    // 获取 SMTP 配置
    const config = await notificationService.getSMTPConfig();
    
    if (!config) {
      log.error('无法获取 SMTP 配置');
      return false;
    }
    
    log.success('SMTP 配置获取成功');
    
    // 测试 SMTP 连接
    const testResult = await notificationService.testSMTPConnection(config);
    
    if (testResult.success) {
      log.success('SMTP 连接测试成功');
      return true;
    } else {
      log.error('SMTP 连接测试失败:', testResult.error);
      return false;
    }
  } catch (error) {
    log.error('检查邮件服务失败:', error.message);
    return false;
  }
}

// 检查常见问题
function checkCommonIssues() {
  log.title('🔧 检查常见问题');
  
  const issues = [];
  
  // 检查端口配置
  const port = parseInt(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true';
  
  if (port === 465 && !secure) {
    issues.push('端口 465 通常需要启用 SSL (SMTP_SECURE=true)');
  }
  
  if (port === 587 && secure) {
    issues.push('端口 587 通常使用 STARTTLS (SMTP_SECURE=false)');
  }
  
  // 检查常见邮件服务商
  const host = process.env.SMTP_HOST;
  if (host) {
    if (host.includes('gmail.com')) {
      issues.push('Gmail 需要启用两步验证并使用应用专用密码');
    } else if (host.includes('qq.com')) {
      issues.push('QQ邮箱需要开启SMTP服务并使用授权码');
    } else if (host.includes('163.com')) {
      issues.push('163邮箱需要开启SMTP服务并使用授权码');
    }
  }
  
  // 检查用户名格式
  const user = process.env.SMTP_USER;
  if (user && !user.includes('@')) {
    issues.push('SMTP_USER 通常应该是完整的邮箱地址');
  }
  
  if (issues.length > 0) {
    log.warning('发现潜在问题:');
    issues.forEach((issue, index) => {
      console.log(`  ${index + 1}. ${issue}`);
    });
  } else {
    log.success('未发现常见配置问题');
  }
  
  return issues.length === 0;
}

// 提供解决建议
function provideSolutions() {
  log.title('💡 解决建议');
  
  console.log('如果邮件发送仍然失败，请尝试以下解决方案:');
  console.log('');
  
  console.log('1. 检查邮件服务商设置:');
  console.log('   - Gmail: 启用两步验证，生成应用专用密码');
  console.log('   - QQ/163: 开启SMTP服务，使用授权码而非登录密码');
  console.log('   - Outlook: 确保账户安全设置允许第三方应用');
  console.log('');
  
  console.log('2. 网络和防火墙:');
  console.log('   - 检查防火墙是否阻止SMTP端口 (25, 587, 465)');
  console.log('   - 确认网络连接正常');
  console.log('   - 某些ISP可能阻止端口25');
  console.log('');
  
  console.log('3. 配置验证:');
  console.log('   - 使用邮件客户端 (如Outlook) 测试相同配置');
  console.log('   - 检查用户名是否为完整邮箱地址');
  console.log('   - 确认密码正确且未过期');
  console.log('');
  
  console.log('4. 调试工具:');
  console.log('   - 运行: node scripts/test-smtp.js');
  console.log('   - 查看详细日志: docker-compose logs -f');
  console.log('   - 检查邮件服务商的发送日志');
  console.log('');
}

// 主函数
async function main() {
  console.log(`${colors.bold}${colors.cyan}`);
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    邮件服务诊断工具                          ║');
  console.log('║                检查配置和诊断常见问题                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  const results = {
    envVars: false,
    encryptionKey: false,
    database: false,
    emailService: false,
    commonIssues: false
  };

  try {
    // 加载环境变量
    loadEnvFile();
    
    // 执行所有检查
    results.envVars = checkEnvironmentVariables();
    results.encryptionKey = checkEncryptionKey();
    results.database = await checkDatabaseConfig();
    results.emailService = await checkEmailService();
    results.commonIssues = checkCommonIssues();
    
    // 统计结果
    const passed = Object.values(results).filter(Boolean).length;
    const total = Object.keys(results).length;
    
    log.title('📋 诊断结果');
    console.log(`通过检查: ${passed}/${total}`);
    
    if (passed === total) {
      log.success('🎉 所有检查通过！邮件服务应该可以正常工作');
    } else if (passed >= total * 0.6) {
      log.warning('⚠️ 大部分检查通过，但仍有一些问题需要解决');
    } else {
      log.error('❌ 多项检查失败，邮件服务可能无法正常工作');
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
  console.log('邮件服务诊断工具');
  console.log('');
  console.log('用法: node diagnose-email.js');
  console.log('');
  console.log('功能:');
  console.log('  - 检查环境变量配置');
  console.log('  - 验证加密密钥');
  console.log('  - 检查数据库配置');
  console.log('  - 测试邮件服务连接');
  console.log('  - 识别常见配置问题');
  console.log('');
  process.exit(0);
}

// 运行诊断
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('diagnose-email.js')) {
  main();
}