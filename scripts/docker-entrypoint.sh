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