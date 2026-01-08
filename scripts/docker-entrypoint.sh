#!/bin/sh

# Docker 容器启动脚本
# 动态生成安全密钥并启动应用

set -e

echo "🚀 启动 Docker Manager 容器..."

# 生成 JWT Secret（如果未设置）
if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "auto-generated-will-be-set-by-container" ]; then
    echo "🔑 生成 JWT Secret..."
    export JWT_SECRET=$(openssl rand -hex 32)
    echo "✅ JWT Secret 已生成"
fi

# 生成 Encryption Key（如果未设置）
if [ -z "$ENCRYPTION_KEY" ] || [ "$ENCRYPTION_KEY" = "auto-generated-will-be-set-by-container" ]; then
    echo "🔐 生成 Encryption Key..."
    export ENCRYPTION_KEY=$(openssl rand -hex 16)
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

# 执行传入的命令
exec "$@"