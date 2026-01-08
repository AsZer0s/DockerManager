#!/usr/bin/env node

/**
 * Docker Manager 快速设置脚本
 * 帮助用户快速配置和启动项目
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

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

// 生成安全密钥
function generateSecureKey(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

// 检查系统依赖
function checkDependencies() {
  log.title('🔍 检查系统依赖');
  
  const dependencies = [
    { name: 'Node.js', command: 'node --version', required: true },
    { name: 'npm', command: 'npm --version', required: true },
    { name: 'Docker', command: 'docker --version', required: false },
    { name: 'Docker Compose', command: 'docker-compose --version', required: false }
  ];

  let allRequired = true;

  dependencies.forEach(dep => {
    try {
      const version = execSync(dep.command, { encoding: 'utf8' }).trim();
      log.success(`${dep.name}: ${version}`);
    } catch (error) {
      if (dep.required) {
        log.error(`${dep.name}: 未安装 (必需)`);
        allRequired = false;
      } else {
        log.warning(`${dep.name}: 未安装 (可选，用于 Docker 部署)`);
      }
    }
  });

  if (!allRequired) {
    log.error('缺少必需的依赖，请先安装 Node.js 和 npm');
    process.exit(1);
  }

  return true;
}

// 创建环境变量文件
function createEnvFile() {
  log.title('🔧 配置环境变量');

  const envPath = path.join(projectRoot, '.env');
  const envExamplePath = path.join(projectRoot, 'server/env.example');

  if (fs.existsSync(envPath)) {
    log.warning('.env 文件已存在，跳过创建');
    return;
  }

  if (!fs.existsSync(envExamplePath)) {
    log.error('找不到环境变量模板文件');
    return;
  }

  // 读取模板
  let envContent = fs.readFileSync(envExamplePath, 'utf8');

  // 生成安全密钥
  const jwtSecret = generateSecureKey(32);
  const encryptionKey = generateSecureKey(16);
  const sessionSecret = generateSecureKey(32);

  // 替换占位符
  envContent = envContent
    .replace(/your_jwt_secret_key_here_minimum_32_characters_long/g, jwtSecret)
    .replace(/your_32_character_hex_encryption_key_here/g, encryptionKey)
    .replace(/your_session_secret_here/g, sessionSecret)
    .replace(/NODE_ENV=development/g, 'NODE_ENV=development')
    .replace(/127\.0\.0\.1:3000/g, 'localhost:3000');

  // 写入文件
  fs.writeFileSync(envPath, envContent);
  log.success('已创建 .env 文件并生成安全密钥');

  // 显示需要手动配置的项目
  log.info('请手动配置以下环境变量 (在 .env 文件中):');
  console.log('  - TELEGRAM_BOT_TOKEN (如果需要 Telegram 功能)');
  console.log('  - SMTP_* (如果需要邮件功能)');
  console.log('  - MYSQL_* (如果使用 MySQL 数据库)');
}

// 安装依赖
function installDependencies() {
  log.title('📦 安装项目依赖');

  try {
    // 安装根目录依赖
    log.info('安装根目录依赖...');
    execSync('npm install', { cwd: projectRoot, stdio: 'inherit' });

    // 安装服务器依赖
    log.info('安装服务器依赖...');
    execSync('npm install', { cwd: path.join(projectRoot, 'server'), stdio: 'inherit' });

    // 安装客户端依赖
    log.info('安装客户端依赖...');
    execSync('npm install', { cwd: path.join(projectRoot, 'client'), stdio: 'inherit' });

    log.success('所有依赖安装完成');
  } catch (error) {
    log.error('依赖安装失败');
    console.error(error.message);
    process.exit(1);
  }
}

// 初始化数据库
function initializeDatabase() {
  log.title('🗄️ 初始化数据库');

  try {
    // 创建数据目录
    const dataDir = path.join(projectRoot, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      log.success('已创建数据目录');
    }

    // 创建日志目录
    const logsDir = path.join(projectRoot, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      log.success('已创建日志目录');
    }

    log.info('数据库将在首次启动时自动初始化');
  } catch (error) {
    log.error('数据库初始化失败');
    console.error(error.message);
  }
}

// 运行安全检查
function runSecurityCheck() {
  log.title('🔒 运行安全检查');

  try {
    execSync('node scripts/security-check.js', { cwd: projectRoot, stdio: 'inherit' });
  } catch (error) {
    log.warning('安全检查发现问题，请查看上面的输出');
  }
}

// 显示启动说明
function showStartupInstructions() {
  log.title('🚀 启动说明');

  console.log('项目设置完成！您可以使用以下命令启动：\n');

  console.log(`${colors.bold}开发模式:${colors.reset}`);
  console.log('  npm run dev                    # 同时启动前端和后端');
  console.log('  npm run server:dev             # 仅启动后端');
  console.log('  npm run client:dev             # 仅启动前端\n');

  console.log(`${colors.bold}生产模式:${colors.reset}`);
  console.log('  npm run build                  # 构建前端');
  console.log('  npm start                      # 启动生产服务器\n');

  console.log(`${colors.bold}Docker 部署:${colors.reset}`);
  console.log('  docker-compose up -d           # 启动 Docker 容器');
  console.log('  scripts/deploy.sh              # 使用部署脚本 (Linux/Mac)');
  console.log('  scripts/deploy.bat             # 使用部署脚本 (Windows)\n');

  console.log(`${colors.bold}访问地址:${colors.reset}`);
  console.log('  前端: http://localhost:3000');
  console.log('  后端 API: http://localhost:3000/api');
  console.log('  健康检查: http://localhost:3000/health\n');

  console.log(`${colors.bold}默认管理员账户:${colors.reset}`);
  console.log('  用户名: admin');
  console.log('  邮箱: admin@ztms.top');
  console.log('  密码: 将在首次启动时显示在控制台\n');

  console.log(`${colors.bold}其他工具:${colors.reset}`);
  console.log('  node scripts/security-check.js # 运行安全检查');
  console.log('  npm run lint                   # 代码检查');
  console.log('  docker-compose logs -f         # 查看 Docker 日志\n');

  log.success('设置完成！祝您使用愉快！');
}

// 主函数
async function main() {
  console.log(`${colors.bold}${colors.cyan}`);
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Docker Manager 设置向导                    ║');
  console.log('║                     快速配置和启动项目                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  try {
    // 检查系统依赖
    checkDependencies();

    // 创建环境变量文件
    createEnvFile();

    // 安装依赖
    installDependencies();

    // 初始化数据库
    initializeDatabase();

    // 运行安全检查
    runSecurityCheck();

    // 显示启动说明
    showStartupInstructions();

  } catch (error) {
    log.error('设置过程中出现错误:');
    console.error(error);
    process.exit(1);
  }
}

// 处理命令行参数
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('Docker Manager 设置向导');
  console.log('');
  console.log('用法: node setup.js [选项]');
  console.log('');
  console.log('选项:');
  console.log('  --help, -h    显示帮助信息');
  console.log('  --skip-deps   跳过依赖安装');
  console.log('  --skip-check  跳过安全检查');
  console.log('');
  process.exit(0);
}

// 运行设置
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}