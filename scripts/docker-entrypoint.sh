#!/bin/sh

# Docker 容器启动脚本
# 动态生成安全密钥并启动应用

set -e

echo "🚀 启动 Docker Manager 容器..."

# 生成 JWT Secret（如果未设置）
if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "auto-generated-will-be-set-by-container" ]; then
    echo "🔑 生成 JWT Secret..."
    if command -v openssl >/dev/null 2>&1; then
        export JWT_SECRET=$(openssl rand -hex 32)
    else
        # 备用方案：使用 Node.js 生成
        export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    fi
    echo "✅ JWT Secret 已生成"
fi

# 生成 Encryption Key（如果未设置）
if [ -z "$ENCRYPTION_KEY" ] || [ "$ENCRYPTION_KEY" = "auto-generated-will-be-set-by-container" ]; then
    echo "🔐 生成 Encryption Key..."
    if command -v openssl >/dev/null 2>&1; then
        export ENCRYPTION_KEY=$(openssl rand -hex 16)
    else
        # 备用方案：使用 Node.js 生成
        export ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
    fi
    echo "✅ Encryption Key 已生成"
fi

# 确保数据目录存在
mkdir -p /app/data /app/logs

# 检查权限和用户信息
echo "🔍 权限诊断:"
echo "当前用户: $(whoami)"
echo "用户ID: $(id)"
echo "数据目录权限:"
ls -la /app/data
echo "数据目录父目录权限:"
ls -la /app/
echo "尝试在数据目录创建测试文件:"
touch /app/data/test.txt 2>&1 && echo "✅ 可以创建文件" || echo "❌ 无法创建文件"
echo "数据库路径: $DATABASE_PATH"

# 如果无法创建文件，尝试修复权限
if ! touch /app/data/test2.txt 2>/dev/null; then
    echo "🔧 尝试修复数据目录权限..."
    
    # 修复权限（以 root 身份运行）
    chown -R docker-manager:nodejs /app/data /app/logs
    echo "✅ 权限已修复"
    
    # 验证权限修复
    ls -la /app/data /app/logs
fi

# 如果当前是 root 用户，切换到 docker-manager 用户执行应用
if [ "$(whoami)" = "root" ]; then
    echo "🔄 切换到 docker-manager 用户执行应用..."
    exec su-exec docker-manager "$@"
fi

# 显示启动信息
echo "📊 环境信息:"
echo "  - NODE_ENV: $NODE_ENV"
echo "  - PORT: $PORT"
echo "  - DATABASE_PATH: $DATABASE_PATH"
echo "  - LOG_LEVEL: $LOG_LEVEL"
echo "  - JWT_SECRET: [已设置]"
echo "  - ENCRYPTION_KEY: [已设置]"

echo "🎯 启动应用服务器..."

# 检查 Node.js 版本
echo "🔍 Node.js 版本:"
node --version

# 检查目录结构
echo "📁 当前目录结构:"
ls -la

echo "📁 服务器目录结构:"
ls -la server/

# 检查服务器依赖
echo "🔍 检查服务器依赖..."
if [ -d "server/node_modules" ]; then
    echo "✅ 服务器 node_modules 存在"
    ls server/node_modules/ | head -5
else
    echo "❌ 服务器 node_modules 不存在"
fi

echo "🚀 执行启动命令: $@"

# 执行传入的命令
exec "$@"