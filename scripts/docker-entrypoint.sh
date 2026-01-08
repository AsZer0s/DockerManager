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

# 检查 Node.js 应用是否存在
if [ ! -f "server/index.js" ]; then
    echo "❌ 错误: server/index.js 文件不存在"
    ls -la server/
    exit 1
fi

# 检查 package.json 是否存在
if [ ! -f "server/package.json" ]; then
    echo "❌ 错误: server/package.json 文件不存在"
    ls -la server/
    exit 1
fi

# 显示当前目录结构
echo "📁 当前目录结构:"
ls -la

echo "📁 服务器目录结构:"
ls -la server/

# 检查 Node.js 版本
echo "🔍 Node.js 版本:"
node --version

# 检查 npm 版本
echo "🔍 npm 版本:"
npm --version

# 尝试启动应用，如果失败显示详细错误
echo "🚀 执行启动命令: $@"

# 直接运行并捕获错误
if [ "$1" = "node" ] && [ "$2" = "server/index.js" ]; then
    echo "🔧 直接启动 Node.js 应用..."
    cd /app
    node server/index.js 2>&1 || {
        echo "❌ Node.js 应用启动失败，错误码: $?"
        echo "📋 尝试检查依赖..."
        cd server && npm list --depth=0 2>&1 || echo "依赖检查失败"
        exit 1
    }
else
    # 执行传入的命令
    exec "$@"
fi