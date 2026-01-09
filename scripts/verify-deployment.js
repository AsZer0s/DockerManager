#!/usr/bin/env node

/**
 * 部署验证脚本
 * 验证 Docker Manager 部署是否正确，特别是密钥持久化功能
 */

import fs from 'fs';
import path from 'path';
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

// 检查 Docker 和 Docker Compose
function checkDockerEnvironment() {
  log.title('🐳 检查 Docker 环境');
  
  try {
    const dockerVersion = execSync('docker --version', { encoding: 'utf8' }).trim();
    log.success(`Docker: ${dockerVersion}`);
  } catch (error) {
    log.error('Docker 未安装或不可用');
    return false;
  }
  
  try {
    const composeVersion = execSync('docker-compose --version', { encoding: 'utf8' }).trim();
    log.success(`Docker Compose: ${composeVersion}`);
  } catch (error) {
    log.error('Docker Compose 未安装或不可用');
    return false;
  }
  
  return true;
}

// 检查项目文件
function checkProjectFiles() {
  log.title('📁 检查项目文件');
  
  const requiredFiles = [
    'docker-compose.yml',
    'Dockerfile',
    'scripts/docker-entrypoint.sh',
    'server/index.js',
    'server/utils/envValidator.js'
  ];
  
  let allExists = true;
  
  requiredFiles.forEach(file => {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      log.success(`${file} 存在`);
    } else {
      log.error(`${file} 不存在`);
      allExists = false;
    }
  });
  
  return allExists;
}

// 检查数据目录
function checkDataDirectory() {
  log.title('💾 检查数据目录');
  
  const dataDir = path.join(projectRoot, 'data');
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    log.success('已创建数据目录');
  } else {
    log.success('数据目录已存在');
  }
  
  // 检查权限
  try {
    const testFile = path.join(dataDir, 'test.txt');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    log.success('数据目录可写');
  } catch (error) {
    log.error('数据目录不可写');
    return false;
  }
  
  return true;
}

// 检查 Docker Compose 配置
function checkDockerComposeConfig() {
  log.title('🔧 检查 Docker Compose 配置');
  
  try {
    const configPath = path.join(projectRoot, 'docker-compose.yml');
    const config = fs.readFileSync(configPath, 'utf8');
    
    // 检查卷挂载
    if (config.includes('./data:/app/data')) {
      log.success('数据卷挂载配置正确');
    } else {
      log.error('数据卷挂载配置缺失');
      return false;
    }
    
    // 检查环境变量
    if (config.includes('ENCRYPTION_KEY') && config.includes('JWT_SECRET')) {
      log.success('环境变量配置正确');
    } else {
      log.warning('环境变量配置可能不完整');
    }
    
    return true;
  } catch (error) {
    log.error('无法读取 Docker Compose 配置');
    return false;
  }
}

// 检查容器状态
function checkContainerStatus() {
  log.title('📊 检查容器状态');
  
  try {
    const output = execSync('docker-compose ps', { 
      cwd: projectRoot, 
      encoding: 'utf8' 
    });
    
    if (output.includes('docker-manager') && output.includes('Up')) {
      log.success('Docker Manager 容器正在运行');
      return true;
    } else {
      log.warning('Docker Manager 容器未运行');
      return false;
    }
  } catch (error) {
    log.warning('无法检查容器状态 (可能容器未启动)');
    return false;
  }
}

// 检查密钥文件
function checkKeyFiles() {
  log.title('🔑 检查密钥文件');
  
  const dataDir = path.join(projectRoot, 'data');
  const jwtSecretFile = path.join(dataDir, '.jwt_secret');
  const encryptionKeyFile = path.join(dataDir, '.encryption_key');
  
  let hasKeys = false;
  
  if (fs.existsSync(jwtSecretFile)) {
    log.success('JWT Secret 文件存在');
    hasKeys = true;
  } else {
    log.info('JWT Secret 文件不存在 (将在首次启动时生成)');
  }
  
  if (fs.existsSync(encryptionKeyFile)) {
    log.success('Encryption Key 文件存在');
    hasKeys = true;
  } else {
    log.info('Encryption Key 文件不存在 (将在首次启动时生成)');
  }
  
  return hasKeys;
}

// 检查健康状态
function checkHealthStatus() {
  log.title('🏥 检查应用健康状态');
  
  try {
    const response = execSync('curl -f http://localhost:3000/health', { 
      encoding: 'utf8',
      timeout: 5000
    });
    
    const health = JSON.parse(response);
    if (health.status === 'healthy') {
      log.success('应用健康状态正常');
      return true;
    } else {
      log.warning(`应用健康状态: ${health.status}`);
      return false;
    }
  } catch (error) {
    log.warning('无法检查应用健康状态 (可能应用未启动或端口不可访问)');
    return false;
  }
}

// 显示部署建议
function showDeploymentSuggestions(results) {
  log.title('💡 部署建议');
  
  if (!results.docker) {
    console.log('1. 安装 Docker 和 Docker Compose');
    console.log('   - Windows: https://docs.docker.com/desktop/windows/');
    console.log('   - macOS: https://docs.docker.com/desktop/mac/');
    console.log('   - Linux: https://docs.docker.com/engine/install/');
  }
  
  if (!results.files) {
    console.log('2. 确保所有项目文件完整');
    console.log('   - 重新克隆项目或检查文件完整性');
  }
  
  if (!results.data) {
    console.log('3. 修复数据目录权限');
    console.log('   - Linux/macOS: chmod 755 data/');
    console.log('   - Windows: 检查文件夹权限设置');
  }
  
  if (!results.container) {
    console.log('4. 启动 Docker 容器');
    console.log('   - docker-compose up -d');
  }
  
  if (!results.health) {
    console.log('5. 检查应用日志');
    console.log('   - docker-compose logs -f docker-manager');
  }
  
  console.log('\n📚 更多帮助:');
  console.log('   - 查看文档: docs/ENCRYPTION_KEY_FIX.md');
  console.log('   - 运行测试: node scripts/test-key-persistence.js');
  console.log('   - 检查日志: docker-compose logs -f');
}

// 主函数
async function main() {
  console.log(`${colors.bold}${colors.cyan}`);
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Docker Manager 部署验证                   ║');
  console.log('║                  检查部署状态和密钥持久化                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  const results = {
    docker: false,
    files: false,
    data: false,
    config: false,
    container: false,
    keys: false,
    health: false
  };

  try {
    // 执行所有检查
    results.docker = checkDockerEnvironment();
    results.files = checkProjectFiles();
    results.data = checkDataDirectory();
    results.config = checkDockerComposeConfig();
    results.container = checkContainerStatus();
    results.keys = checkKeyFiles();
    results.health = checkHealthStatus();
    
    // 统计结果
    const passed = Object.values(results).filter(Boolean).length;
    const total = Object.keys(results).length;
    
    log.title('📋 验证结果');
    console.log(`通过检查: ${passed}/${total}`);
    
    if (passed === total) {
      log.success('🎉 所有检查通过！部署状态良好');
    } else if (passed >= total * 0.7) {
      log.warning('⚠️ 大部分检查通过，但有一些问题需要注意');
    } else {
      log.error('❌ 多项检查失败，需要修复问题');
    }
    
    // 显示建议
    showDeploymentSuggestions(results);
    
  } catch (error) {
    log.error('验证过程中出现错误:');
    console.error(error);
    process.exit(1);
  }
}

// 处理命令行参数
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('Docker Manager 部署验证工具');
  console.log('');
  console.log('用法: node verify-deployment.js [选项]');
  console.log('');
  console.log('选项:');
  console.log('  --help, -h    显示帮助信息');
  console.log('');
  process.exit(0);
}

// 运行验证
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('verify-deployment.js')) {
  main();
}