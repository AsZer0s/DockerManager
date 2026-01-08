# Docker Manager - 容器管理系统

一个功能强大的 Docker 容器管理系统，支持多服务器管理、实时监控、Web SSH 控制台和 Telegram 机器人。

## ✨ 功能特性

- **多服务器管理**: 轻松添加、删除和管理多个服务器
- **Docker 容器操作**: 查看容器列表、详细信息、日志，并执行启动、停止、重启等操作
- **用户权限控制**: 管理员可以授权特定用户访问指定的服务器
- **信息隐藏**: 管理员可以为普通用户隐藏敏感信息，如服务器地址、端口、容器ID等
- **网页版 SSH 控制台**: 提供一个基于 Web 的实时 SSH 终端，方便直接在服务器上执行命令
- **实时监控**: 监控服务器状态信息（CPU、RAM、磁盘、网络等）和容器资源使用情况
- **Telegram 机器人**: 通过 Telegram 查询容器状态、执行基本操作
- **Telegram Web App**: 在 Telegram 内直接使用 Web 界面
- **灵活部署**: 支持使用 Docker Compose 在您自己的服务器上部署

## 🏗️ 技术栈

### 后端
- **Node.js 22** + **Express** - Web 框架
- **SQLite** - 轻量级数据库
- **Dockerode** - Docker API 客户端
- **Socket.IO** - WebSocket 实时通信
- **JWT** - 身份认证
- **bcryptjs** - 密码加密
- **Telegraf** - Telegram 机器人框架
- **SSH2** - SSH 连接库
- **SystemInformation** - 系统监控

### 前端
- **React 18** + **TypeScript** - 用户界面
- **Ant Design** - UI 组件库
- **React Query** - 数据获取和缓存
- **Zustand** - 状态管理
- **Socket.IO Client** - WebSocket 客户端
- **ECharts** - 数据可视化
- **XTerm.js** - 终端模拟器
- **Vite** - 构建工具

### 部署
- **Docker** + **Docker Compose** - 容器化部署
- **多阶段构建** - 优化镜像大小

# Docker Manager - 容器管理系统

一个功能强大的 Docker 容器管理系统，支持多服务器管理、实时监控、Web SSH 控制台和 Telegram 机器人。

## 🚀 一键启动

### 快速开始

```bash
# 克隆项目
git clone <repository-url>
cd docker-manager

# 一键启动 (Linux/macOS)
chmod +x start.sh && ./start.sh

# 一键启动 (Windows)
start.bat

# 或使用 Docker Compose
docker-compose up -d
```

**就是这么简单！** 🎉

### 访问系统

- **Web 界面**: http://localhost:3000
- **默认账户**: admin@ztms.top (密码在启动日志中显示)

## ✨ 功能特性

- **多服务器管理**: 轻松添加、删除和管理多个服务器
- **Docker 容器操作**: 查看容器列表、详细信息、日志，并执行启动、停止、重启等操作
- **用户权限控制**: 管理员可以授权特定用户访问指定的服务器
- **信息隐藏**: 管理员可以为普通用户隐藏敏感信息，如服务器地址、端口、容器ID等
- **网页版 SSH 控制台**: 提供一个基于 Web 的实时 SSH 终端，方便直接在服务器上执行命令
- **实时监控**: 监控服务器状态信息（CPU、RAM、磁盘、网络等）和容器资源使用情况
- **Telegram 机器人**: 通过 Telegram 查询容器状态、执行基本操作
- **Telegram Web App**: 在 Telegram 内直接使用 Web 界面
- **灵活部署**: 支持使用 Docker Compose 在您自己的服务器上部署

## 🔧 可选配置

系统开箱即用，无需任何配置。如需启用额外功能：

```bash
# 复制配置模板
cp .env.example .env

# 编辑配置文件
nano .env
```

主要可选配置：
- `TELEGRAM_BOT_TOKEN` - Telegram 机器人功能
- `SMTP_*` - 邮件通知功能  
- `MYSQL_*` - 使用 MySQL 数据库

## 🛠️ 常用命令

```bash
# 快速操作
npm run quick-start    # 启动服务
npm run quick-stop     # 停止服务
npm run quick-restart  # 重启服务
npm run quick-logs     # 查看日志
npm run quick-status   # 查看状态

# 或使用 Docker Compose
docker-compose up -d      # 启动
docker-compose down       # 停止
docker-compose logs -f    # 查看日志
docker-compose ps         # 查看状态
```

### 环境变量配置

在 `.env` 文件中配置以下变量：

```bash
# 数据库
DATABASE_PATH=./data/database.sqlite

# Telegram 机器人
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# JWT 配置
JWT_SECRET=Zer0Teams
JWT_EXPIRES_IN=7d

# 加密
ENCRYPTION_KEY=DockerManager_PoweredByZer0Teams

# 服务器
NODE_ENV=development

# 日志配置
LOG_LEVEL=info

# 监控配置
MONITORING_INTERVAL=5000

# SMTP邮件配置
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Docker Manager <noreply@dockermanager.com>

# TGBOT代理
TGBOT_PROXY=http://127.0.0.1:10808

# TG_MINIAPP_URL
TELEGRAM_WEBAPP_URL=http://127.0.0.1:3000/telegram-webapp
```

## 📖 使用指南

### 管理员账户

系统会在首次启动时自动创建管理员账户：
- **用户名**: admin
- **邮箱**: admin@ztms.top
- **密码**: 请查看启动日志或使用初始化脚本

### 添加服务器

1. 登录管理界面
2. 进入"服务器管理"页面
3. 点击"添加服务器"
4. 填写服务器信息（主机地址、端口、认证信息）
5. 测试连接确保配置正确

支持两种连接方式：
- **密码认证**: 主机地址、SSH端口、用户名和密码
- **密钥认证**: 主机地址、SSH端口、用户名和私钥内容

### 管理容器

1. 在"容器管理"页面选择服务器
2. 查看容器列表和状态
3. 执行容器操作（启动、停止、重启、删除）
4. 查看容器日志和详细信息

### 监控系统

1. 进入"监控中心"
2. 选择要监控的服务器
3. 查看实时 CPU、内存、磁盘使用情况
4. 监控容器资源使用情况

### SSH 控制台

1. 进入"SSH 控制台"页面
2. 选择服务器并建立连接
3. 在 Web 终端中执行命令
4. 支持多行命令和命令历史

### 用户权限管理

1. 管理员可以创建用户账户
2. 为每个用户分配服务器访问权限
3. 设置查看、控制、SSH 等权限
4. 可选择隐藏敏感信息

### Telegram 机器人

1. 在 Telegram 中找到 [@BotFather](https://t.me/botfather)
2. 创建新机器人并获取 Token
3. 将 Token 设置到 `TELEGRAM_BOT_TOKEN` 环境变量
4. 用户可以在 Web 界面绑定 Telegram ID
5. 通过机器人查询服务器和容器状态

## 🔧 开发指南

### 本地开发

1. **安装依赖**
```bash
npm install
cd server && npm install
cd ../client && npm install
```

2. **启动开发服务**
```bash
# 启动所有服务
npm run dev

# 或分别启动
npm run server:dev  # 后端服务
npm run client:dev  # 前端服务
```

3. **初始化数据库**
```bash
npm run init
```

### 项目结构

```
docker-manager/
├── client/                 # 前端 React 应用
│   ├── src/
│   │   ├── components/     # 可复用组件
│   │   ├── pages/         # 页面组件
│   │   ├── services/      # API 服务
│   │   ├── stores/        # 状态管理
│   │   └── hooks/         # 自定义 Hooks
│   └── package.json
├── server/                 # 后端 Node.js 应用
│   ├── routes/            # API 路由
│   ├── services/          # 业务逻辑服务
│   ├── config/            # 配置文件
│   ├── utils/             # 工具函数
│   └── data/              # 数据库文件
├── docker-compose.yml     # Docker 编排文件
├── Dockerfile            # Docker 镜像构建文件
└── .dockerignore         # Docker 忽略文件
```

### API 文档

主要 API 端点：

- `POST /api/auth/login` - 用户登录
- `GET /api/servers` - 获取服务器列表
- `GET /api/containers/:serverId` - 获取容器列表
- `POST /api/containers/:serverId/:containerId/start` - 启动容器
- `GET /api/monitoring/current/:serverId` - 获取监控数据
- `POST /api/ssh/:serverId/execute` - 执行 SSH 命令
- `POST /api/telegram-verification/send-code` - 发送 Telegram 验证码

## 🛡️ 安全考虑

- 所有密码和敏感信息都经过加密存储
- 支持 JWT 令牌认证
- 实现了用户权限控制
- 支持隐藏敏感信息
- SSH 连接支持密钥认证
- 包含请求频率限制
- Telegram 绑定需要验证码确认

## 📊 监控和日志

- 实时系统监控（CPU、内存、磁盘、网络）
- 容器资源使用监控
- 操作日志记录
- 错误日志和告警
- WebSocket 实时数据推送
- 支持深色模式

## 🔄 备份和恢复

### 数据库备份
```bash
# 复制数据库文件
cp server/data/database.sqlite backup/database-$(date +%Y%m%d).sqlite
```

### 数据恢复
```bash
# 恢复数据库文件
cp backup/database-20240101.sqlite server/data/database.sqlite
```

## 🐛 故障排除

### 常见问题

1. **Docker 连接失败**
   - 检查 Docker 服务是否运行
   - 确认 Docker socket 权限
   - 验证服务器网络连接

2. **数据库连接失败**
   - 检查 SQLite 数据库文件权限
   - 确认数据目录存在
   - 查看应用日志

3. **Telegram 机器人无响应**
   - 检查 Bot Token 是否正确
   - 确认网络连接和代理设置
   - 查看机器人日志

4. **SSH 连接超时**
   - 检查服务器网络连接
   - 确认 SSH 服务运行状态
   - 验证认证信息

### 查看日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f app

# 查看应用内部日志
docker exec docker-manager-app cat /app/logs/combined.log
```

## 🚀 部署到生产环境

### 使用 Docker Compose

1. **配置环境变量**
```bash
cp server/env.example .env
# 编辑 .env 文件，设置生产环境变量
```

2. **启动服务**
```bash
docker-compose up -d
```

3. **配置反向代理**（可选）
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 环境变量说明

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `NODE_ENV` | 运行环境 | production |
| `TELEGRAM_BOT_TOKEN` | Telegram 机器人 Token | 必填 |
| `TELEGRAM_WEBAPP_URL` | Telegram Web App URL | 必填 |
| `JWT_SECRET` | JWT 密钥 | 必填 |
| `ENCRYPTION_KEY` | 加密密钥 | 必填 |
| `TGBOT_PROXY` | Telegram 代理 | 可选 |

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

感谢以下开源项目的支持：
- [Docker](https://www.docker.com/)
- [React](https://reactjs.org/)
- [Ant Design](https://ant.design/)
- [Express.js](https://expressjs.com/)
- [SQLite](https://www.sqlite.org/)
- [Telegraf](https://telegraf.js.org/)

## 📞 支持

如果您遇到问题或有建议，请：
- 提交 [Issue](https://github.com/your-repo/issues)
- 查看 [Wiki](https://github.com/your-repo/wiki) 获取更多文档

---

**Docker Manager** - 让容器管理变得简单高效！ 🐳