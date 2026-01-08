# 多阶段构建 - 构建阶段
FROM node:22-alpine AS builder

# 设置工作目录
WORKDIR /app

# 安装构建依赖
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# 复制 package.json 文件（利用 Docker 缓存层）
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# 安装根目录依赖
RUN npm install --only=production

# 安装服务器依赖
RUN cd server && npm install --only=production

# 安装客户端依赖（包括 devDependencies，用于构建）
RUN cd client && npm install

# 复制源代码
COPY . .

# 构建前端
RUN cd client && npm run build

# 生产阶段
FROM node:22-alpine AS production

# 安装运行时系统依赖
RUN apk add --no-cache \
    docker-cli \
    openssh-client \
    curl \
    sqlite \
    dumb-init \
    && rm -rf /var/cache/apk/*

# 创建应用用户和组
RUN addgroup -g 1001 -S nodejs && \
    adduser -S docker-manager -u 1001 -G nodejs

# 设置工作目录
WORKDIR /app

# 从构建阶段复制必要文件
COPY --from=builder --chown=docker-manager:nodejs /app/server ./server
COPY --from=builder --chown=docker-manager:nodejs /app/client/dist ./client/dist
COPY --from=builder --chown=docker-manager:nodejs /app/package*.json ./
COPY --chown=docker-manager:nodejs scripts/docker-entrypoint.sh ./scripts/

# 设置启动脚本权限
RUN chmod +x ./scripts/docker-entrypoint.sh

# 安装生产依赖
RUN npm install --only=production && \
    cd server && npm install --only=production

# 创建必要的目录并设置权限
RUN mkdir -p /app/data /app/logs && \
    chown -R docker-manager:nodejs /app/data /app/logs

# 设置默认环境变量（不包含敏感信息）
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/database.sqlite
ENV LOG_LEVEL=info
ENV MONITORING_INTERVAL=5000
ENV CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000

# 切换到非 root 用户
USER docker-manager

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# 使用 dumb-init 作为 PID 1，正确处理信号
ENTRYPOINT ["dumb-init", "--", "./scripts/docker-entrypoint.sh"]

# 启动命令
CMD ["node", "server/index.js"]