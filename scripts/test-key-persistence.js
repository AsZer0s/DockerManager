#!/usr/bin/env node

/**
 * 测试密钥持久化功能
 * 验证 ENCRYPTION_KEY 和 JWT_SECRET 是否能正确保存和读取
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

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

// 密钥文件路径
const dataDir = path.join(projectRoot, 'data');
const jwtSecretFile = path.join(dataDir, '.jwt_secret');
const encryptionKeyFile = path.join(dataDir, '.encryption_key');

// 确保数据目录存在
function ensureDataDirectory() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    log.success('已创建数据目录');
  } else {
    log.info('数据目录已存在');
  }
}

// 生成测试密钥
function generateTestKeys() {
  log.title('🔑 生成测试密钥');
  
  const jwtSecret = crypto.randomBytes(32).toString('hex');
  const encryptionKey = crypto.randomBytes(16).toString('hex');
  
  // 保存到文件
  fs.writeFileSync(jwtSecretFile, jwtSecret);
  fs.writeFileSync(encryptionKeyFile, encryptionKey);
  
  // 设置文件权限
  fs.chmodSync(jwtSecretFile, 0o600);
  fs.chmodSync(encryptionKeyFile, 0o600);
  
  log.success(`JWT Secret 已保存: ${jwtSecret.substring(0, 8)}...`);
  log.success(`Encryption Key 已保存: ${encryptionKey.substring(0, 8)}...`);
  
  return { jwtSecret, encryptionKey };
}

// 读取密钥文件
function readKeys() {
  log.title('📖 读取密钥文件');
  
  if (!fs.existsSync(jwtSecretFile)) {
    log.error('JWT Secret 文件不存在');
    return null;
  }
  
  if (!fs.existsSync(encryptionKeyFile)) {
    log.error('Encryption Key 文件不存在');
    return null;
  }
  
  const jwtSecret = fs.readFileSync(jwtSecretFile, 'utf8').trim();
  const encryptionKey = fs.readFileSync(encryptionKeyFile, 'utf8').trim();
  
  log.success(`JWT Secret 已读取: ${jwtSecret.substring(0, 8)}...`);
  log.success(`Encryption Key 已读取: ${encryptionKey.substring(0, 8)}...`);
  
  return { jwtSecret, encryptionKey };
}

// 验证密钥格式
function validateKeys(keys) {
  log.title('🔍 验证密钥格式');
  
  let valid = true;
  
  // 验证 JWT Secret
  if (keys.jwtSecret.length !== 64) {
    log.error(`JWT Secret 长度错误: ${keys.jwtSecret.length} (应为 64)`);
    valid = false;
  } else if (!/^[0-9a-fA-F]+$/.test(keys.jwtSecret)) {
    log.error('JWT Secret 不是有效的十六进制字符串');
    valid = false;
  } else {
    log.success('JWT Secret 格式正确');
  }
  
  // 验证 Encryption Key
  if (keys.encryptionKey.length !== 32) {
    log.error(`Encryption Key 长度错误: ${keys.encryptionKey.length} (应为 32)`);
    valid = false;
  } else if (!/^[0-9a-fA-F]+$/.test(keys.encryptionKey)) {
    log.error('Encryption Key 不是有效的十六进制字符串');
    valid = false;
  } else {
    log.success('Encryption Key 格式正确');
  }
  
  return valid;
}

// 测试密钥持久化
function testKeyPersistence() {
  log.title('🧪 测试密钥持久化');
  
  // 生成第一组密钥
  const keys1 = generateTestKeys();
  
  // 读取密钥
  const keys2 = readKeys();
  
  if (!keys2) {
    log.error('无法读取密钥文件');
    return false;
  }
  
  // 比较密钥
  if (keys1.jwtSecret === keys2.jwtSecret && keys1.encryptionKey === keys2.encryptionKey) {
    log.success('密钥持久化测试通过');
    return true;
  } else {
    log.error('密钥持久化测试失败 - 读取的密钥与保存的不一致');
    return false;
  }
}

// 清理测试文件
function cleanup() {
  log.title('🧹 清理测试文件');
  
  try {
    if (fs.existsSync(jwtSecretFile)) {
      fs.unlinkSync(jwtSecretFile);
      log.success('已删除 JWT Secret 测试文件');
    }
    
    if (fs.existsSync(encryptionKeyFile)) {
      fs.unlinkSync(encryptionKeyFile);
      log.success('已删除 Encryption Key 测试文件');
    }
  } catch (error) {
    log.error('清理测试文件失败:', error.message);
  }
}

// 显示使用说明
function showUsage() {
  log.title('📋 密钥持久化说明');
  
  console.log('密钥文件位置:');
  console.log(`  JWT Secret: ${jwtSecretFile}`);
  console.log(`  Encryption Key: ${encryptionKeyFile}`);
  console.log('');
  console.log('Docker 容器中的位置:');
  console.log('  JWT Secret: /app/data/.jwt_secret');
  console.log('  Encryption Key: /app/data/.encryption_key');
  console.log('');
  console.log('重要提示:');
  console.log('  1. 这些文件会在容器首次启动时自动生成');
  console.log('  2. 文件权限设置为 600 (仅所有者可读写)');
  console.log('  3. 通过 Docker 卷挂载 ./data:/app/data 实现持久化');
  console.log('  4. 删除这些文件会导致无法解密已加密的数据');
  console.log('');
}

// 主函数
async function main() {
  console.log(`${colors.bold}${colors.cyan}`);
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    密钥持久化测试工具                        ║');
  console.log('║                验证 ENCRYPTION_KEY 持久化功能                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  try {
    // 确保数据目录存在
    ensureDataDirectory();
    
    // 显示使用说明
    showUsage();
    
    // 测试密钥持久化
    const success = testKeyPersistence();
    
    if (success) {
      // 验证密钥格式
      const keys = readKeys();
      if (keys && validateKeys(keys)) {
        log.success('所有测试通过！');
      } else {
        log.error('密钥格式验证失败');
      }
    }
    
    // 清理测试文件
    cleanup();
    
  } catch (error) {
    log.error('测试过程中出现错误:');
    console.error(error);
    process.exit(1);
  }
}

// 处理命令行参数
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('密钥持久化测试工具');
  console.log('');
  console.log('用法: node test-key-persistence.js [选项]');
  console.log('');
  console.log('选项:');
  console.log('  --help, -h    显示帮助信息');
  console.log('  --no-cleanup  不清理测试文件');
  console.log('');
  process.exit(0);
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('test-key-persistence.js')) {
  main();
}