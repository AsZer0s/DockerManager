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
RUN npm ci --only=production

# 安装服务器依赖
RUN cd server && npm ci --only=production

# 安装客户端依赖（包括 devDependencies，用于构建）
RUN cd client && npm ci

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

# 安装生产依赖
RUN npm ci --only=production && \
    cd server && npm ci --only=production

# 创建必要的目录并设置权限
RUN mkdir -p /app/data /app/logs && \
    chown -R docker-manager:nodejs /app/data /app/logs

# 复制环境变量示例文件
COPY --chown=docker-manager:nodejs server/env.example ./server/.env.example

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV CLIENT_PORT=3001

# 切换到非 root 用户
USER docker-manager

# 暴露端口
EXPOSE 3000 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# 使用 dumb-init 作为 PID 1，正确处理信号
ENTRYPOINT ["dumb-init", "--"]

# 启动命令
CMD ["node", "server/index.js"]