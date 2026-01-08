#!/usr/bin/env node

/**
 * Docker Manager 安全检查脚本
 * 检查项目的安全配置和潜在风险
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
  reset: '\x1b[0m'
};

// 日志函数
const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`)
};

// 安全检查项
const securityChecks = {
  // 检查环境变量文件
  checkEnvFiles: () => {
    log.info('检查环境变量文件安全性...');
    const issues = [];

    // 检查 .env 文件是否存在于版本控制中
    const envPath = path.join(projectRoot, '.env');
    const serverEnvPath = path.join(projectRoot, 'server/.env');
    
    if (fs.existsSync(envPath)) {
      issues.push('根目录 .env 文件存在，可能包含敏感信息');
    }
    
    if (fs.existsSync(serverEnvPath)) {
      issues.push('server/.env 文件存在，可能包含敏感信息');
    }

    // 检查 .gitignore 是否正确配置
    const gitignorePath = path.join(projectRoot, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
      if (!gitignoreContent.includes('.env') || !gitignoreContent.includes('server/.env')) {
        issues.push('.gitignore 文件未正确配置环境变量忽略规则');
      }
    } else {
      issues.push('缺少 .gitignore 文件');
    }

    return issues;
  },

  // 检查默认密钥
  checkDefaultKeys: () => {
    log.info('检查默认密钥使用情况...');
    const issues = [];
    const dangerousDefaults = [
      'Zer0Teams',
      'DockerManager_PoweredByZer0Teams',
      'your_telegram_bot_token_here',
      'your_jwt_secret_key_here',
      'your_32_character_hex_encryption_key'
    ];

    // 检查所有可能包含配置的文件
    const configFiles = [
      'server/env.example',
      'docker-compose.yml',
      'docker-compose.prod.yml'
    ];

    configFiles.forEach(file => {
      const filePath = path.join(projectRoot, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        dangerousDefaults.forEach(defaultVal => {
          if (content.includes(defaultVal) && !file.includes('example')) {
            issues.push(`${file} 包含不安全的默认值: ${defaultVal}`);
          }
        });
      }
    });

    return issues;
  },

  // 检查文件权限
  checkFilePermissions: () => {
    log.info('检查敏感文件权限...');
    const issues = [];
    
    // 在 Windows 上跳过权限检查
    if (process.platform === 'win32') {
      log.info('Windows 系统，跳过文件权限检查');
      return issues;
    }

    const sensitiveFiles = [
      'server/.env',
      'data/database.sqlite',
      'ssl/private.key'
    ];

    sensitiveFiles.forEach(file => {
      const filePath = path.join(projectRoot, file);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const mode = stats.mode & parseInt('777', 8);
        
        // 检查是否对其他用户可读
        if (mode & parseInt('044', 8)) {
          issues.push(`${file} 对其他用户可读，存在安全风险`);
        }
      }
    });

    return issues;
  },

  // 检查依赖安全性
  checkDependencies: () => {
    log.info('检查依赖包安全性...');
    const issues = [];

    const packageFiles = [
      'package.json',
      'server/package.json',
      'client/package.json'
    ];

    packageFiles.forEach(file => {
      const filePath = path.join(projectRoot, file);
      if (fs.existsSync(filePath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          
          // 检查已知有安全问题的包
          const vulnerablePackages = [
            'lodash@<4.17.21',
            'axios@<0.21.1',
            'express@<4.17.1'
          ];

          if (packageJson.dependencies) {
            Object.keys(packageJson.dependencies).forEach(pkg => {
              vulnerablePackages.forEach(vuln => {
                const [vulnPkg, vulnVersion] = vuln.split('@');
                if (pkg === vulnPkg) {
                  // 简单版本检查
                  const currentVersion = packageJson.dependencies[pkg].replace(/[\^~]/, '');
                  log.warning(`检查 ${pkg} 版本: ${currentVersion}`);
                }
              });
            });
          }
        } catch (error) {
          issues.push(`无法解析 ${file}: ${error.message}`);
        }
      }
    });

    return issues;
  },

  // 检查 Docker 配置
  checkDockerConfig: () => {
    log.info('检查 Docker 配置安全性...');
    const issues = [];

    const dockerFiles = [
      'Dockerfile',
      'docker-compose.yml',
      'docker-compose.prod.yml'
    ];

    dockerFiles.forEach(file => {
      const filePath = path.join(projectRoot, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // 检查是否以 root 用户运行
        if (content.includes('USER root') || (!content.includes('USER ') && file === 'Dockerfile')) {
          issues.push(`${file} 可能以 root 用户运行容器`);
        }

        // 检查是否暴露了不必要的端口
        const portMatches = content.match(/ports:\s*\n\s*-\s*"(\d+):\d+"/g);
        if (portMatches) {
          portMatches.forEach(match => {
            const port = match.match(/(\d+):/)[1];
            if (port !== '3000' && port !== '80' && port !== '443') {
              log.warning(`${file} 暴露了额外端口: ${port}`);
            }
          });
        }

        // 检查 Docker socket 挂载
        if (content.includes('/var/run/docker.sock')) {
          log.warning(`${file} 挂载了 Docker socket，需要谨慎使用`);
        }
      }
    });

    return issues;
  },

  // 检查网络配置
  checkNetworkConfig: () => {
    log.info('检查网络配置安全性...');
    const issues = [];

    // 检查 CORS 配置
    const serverIndexPath = path.join(projectRoot, 'server/index.js');
    if (fs.existsSync(serverIndexPath)) {
      const content = fs.readFileSync(serverIndexPath, 'utf8');
      
      if (content.includes('origin: true')) {
        issues.push('CORS 配置允许所有来源，存在安全风险');
      }
    }

    // 检查 Nginx 配置
    const nginxConfigPath = path.join(projectRoot, 'nginx.conf');
    if (fs.existsSync(nginxConfigPath)) {
      const content = fs.readFileSync(nginxConfigPath, 'utf8');
      
      if (!content.includes('ssl_protocols')) {
        issues.push('Nginx 配置缺少 SSL 协议限制');
      }
      
      if (!content.includes('add_header Strict-Transport-Security')) {
        issues.push('Nginx 配置缺少 HSTS 头');
      }
    }

    return issues;
  },

  // 检查日志配置
  checkLoggingConfig: () => {
    log.info('检查日志配置安全性...');
    const issues = [];

    // 检查是否记录敏感信息
    const loggerPath = path.join(projectRoot, 'server/utils/logger.js');
    if (fs.existsSync(loggerPath)) {
      const content = fs.readFileSync(loggerPath, 'utf8');
      
      // 检查日志级别
      if (content.includes('level: "debug"') && process.env.NODE_ENV === 'production') {
        issues.push('生产环境使用 debug 日志级别，可能泄露敏感信息');
      }
    }

    return issues;
  }
};

// 生成安全报告
function generateSecurityReport() {
  log.info('开始安全检查...');
  console.log('='.repeat(60));
  
  let totalIssues = 0;
  const report = {};

  Object.keys(securityChecks).forEach(checkName => {
    try {
      const issues = securityChecks[checkName]();
      report[checkName] = issues;
      totalIssues += issues.length;

      if (issues.length === 0) {
        log.success(`${checkName}: 通过`);
      } else {
        log.error(`${checkName}: 发现 ${issues.length} 个问题`);
        issues.forEach(issue => {
          console.log(`  - ${issue}`);
        });
      }
    } catch (error) {
      log.error(`${checkName}: 检查失败 - ${error.message}`);
    }
  });

  console.log('='.repeat(60));
  
  if (totalIssues === 0) {
    log.success('🎉 安全检查通过！未发现安全问题。');
  } else {
    log.error(`⚠️ 发现 ${totalIssues} 个安全问题需要处理。`);
  }

  // 生成修复建议
  generateFixSuggestions(report);
  
  return totalIssues === 0;
}

// 生成修复建议
function generateFixSuggestions(report) {
  console.log('\n' + '='.repeat(60));
  log.info('修复建议:');
  
  const suggestions = [
    '1. 确保 .env 文件不被提交到版本控制系统',
    '2. 使用强随机密钥替换所有默认值',
    '3. 定期更新依赖包到最新安全版本',
    '4. 配置适当的 CORS 策略',
    '5. 使用非 root 用户运行容器',
    '6. 启用 HTTPS 和安全头',
    '7. 定期进行安全审计',
    '8. 监控和记录安全事件'
  ];

  suggestions.forEach(suggestion => {
    console.log(`  ${suggestion}`);
  });

  console.log('\n详细的安全配置指南请参考项目文档。');
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Docker Manager 安全检查工具');
    console.log('');
    console.log('用法: node security-check.js [选项]');
    console.log('');
    console.log('选项:');
    console.log('  --help, -h    显示帮助信息');
    console.log('  --fix         显示修复建议');
    console.log('');
    return;
  }

  const passed = generateSecurityReport();
  
  if (args.includes('--fix')) {
    console.log('\n' + '='.repeat(60));
    log.info('自动修复功能开发中...');
  }

  process.exit(passed ? 0 : 1);
}

// 运行检查
if (process.argv[1].endsWith('security-check.js')) {
  main();
}