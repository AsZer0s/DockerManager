# DockerManager (Docker Pulse)

DockerManager 是一个现代化、轻量级的多服务器 Docker 管理面板。它提供了一个美观的 Web 界面，用于集中管理多个 Docker 主机、容器及其相关资源。

DockerManager is a modern, lightweight multi-server Docker management dashboard. It provides a beautiful web interface for centrally managing multiple Docker hosts, containers, and their associated resources.

![Overview](./docs/overview.png)

## ✨ 特性 (Features)

- 📊 **实时仪表盘 (Real-time Dashboard)**: 监控所有连接服务器的 CPU、内存、容器状态和网络延迟。
- 🖥️ **多服务器管理 (Multi-Server Management)**: 集中管理多个远程 Docker 主机 (通过 TCP/Socket)。
- 🐳 **容器管理 (Container Management)**:
  - 启动、停止、重启、删除容器。
  - 📜 实时日志查看 (Real-time Logs)。
  - 💻 网页终端 (Web Terminal / Exec) - 基于 XTerm.js。
  - 📂 容器文件管理器 (File Manager) - 浏览和下载容器内文件。
  - 📊 实时资源监控 (Real-time Stats)。
- 👥 **用户管理 (User Management)**:
  - 基于角色的访问控制 (RBAC)。
  - 细粒度的服务器权限控制 (Global/Read-only/Manage)。
  - Telegram 账号绑定支持。
- 🎨 **现代化 UI (Modern UI)**:
  - 响应式设计。
  - 🌞/🌙 深色模式支持 (Dark/Light Mode)。
  - 多语言支持 (中文/English)。

## 技术栈 (Tech Stack)

### Backend (后端)
- **Language**: Go 1.21+
- **Framework**: [Gin](https://github.com/gin-gonic/gin)
- **Database**: SQLite (via [GORM](https://gorm.io/) & [modernc/sqlite](https://gitlab.com/cznic/sqlite) - Pure Go, CGO-free)
- **WebSockets**: Real-time terminal and logs
- **Auth**: JWT (JSON Web Tokens)

### Frontend (前端)
- **Framework**: [React](https://react.dev/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Styling**: [TailwindCSS](https://tailwindcss.com/)
- **Components**: Headless UI, Radix UI ideas
- **Icons**: [Lucide React](https://lucide.dev/)
- **Charts**: [Recharts](https://recharts.org/)
- **Terminal**: [XTerm.js](https://xtermjs.org/)

## 快速开始 (Getting Started)

### 使用 Docker Compose 部署 (推荐)

项目根目录已包含 `Dockerfile` 和 `docker-compose.yml`。

1. **构建并运行**:
   ```bash
   docker-compose up -d --build
   ```

2. **访问面板**:
   打开浏览器访问 `http://localhost:9090` (或你在 docker-compose 中配置的端口)。

3. **默认账号**:
   - 第一次启动时，请参考控制台日志或直接在界面注册首个管理员账号（如果系统实现了初始化逻辑）。
   - *(注：如果是开发环境，通常需要先创建第一个用户)*

### 本地开发 (Local Development)

#### Backend

```bash
cd backend
go mod download
go run cmd/api/main.go
```
后端服务将运行在 `http://localhost:8080`。

#### Frontend

```bash
cd frontend
npm install
npm run dev
```
前端开发服务器将运行在 `http://localhost:5173`。

##  License

MIT License
