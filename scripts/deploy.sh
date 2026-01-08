#!/bin/bash

# Docker Manager 部署脚本
# 用于自动化部署 Docker Manager 系统

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查依赖
check_dependencies() {
    log_info "检查系统依赖..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi
    
    log_success "系统依赖检查通过"
}

# 检查环境变量
check_environment() {
    log_info "检查环境变量配置..."
    
    if [ ! -f ".env" ]; then
        log_warning ".env 文件不存在，从模板创建..."
        if [ -f "server/env.example" ]; then
            cp server/env.example .env
            log_warning "请编辑 .env 文件并设置正确的环境变量"
            log_warning "特别注意设置以下变量:"
            log_warning "  - TELEGRAM_BOT_TOKEN"
            log_warning "  - JWT_SECRET"
            log_warning "  - ENCRYPTION_KEY"
            read -p "按 Enter 键继续，或 Ctrl+C 退出编辑环境变量..."
        else
            log_error "找不到环境变量模板文件"
            exit 1
        fi
    fi
    
    # 检查关键环境变量
    source .env
    
    if [[ -z "$JWT_SECRET" || "$JWT_SECRET" == *"your_"* ]]; then
        log_error "JWT_SECRET 未设置或使用默认值，请设置安全的密钥"
        exit 1
    fi
    
    if [[ -z "$ENCRYPTION_KEY" || "$ENCRYPTION_KEY" == *"your_"* ]]; then
        log_error "ENCRYPTION_KEY 未设置或使用默认值，请设置安全的密钥"
        exit 1
    fi
    
    log_success "环境变量检查通过"
}

# 生成安全密钥
generate_keys() {
    log_info "生成安全密钥..."
    
    JWT_SECRET=$(openssl rand -hex 32)
    ENCRYPTION_KEY=$(openssl rand -hex 16)
    
    log_success "生成的密钥:"
    echo "JWT_SECRET=$JWT_SECRET"
    echo "ENCRYPTION_KEY=$ENCRYPTION_KEY"
    echo ""
    log_warning "请将这些密钥保存到 .env 文件中"
}

# 备份数据
backup_data() {
    if [ -d "data" ]; then
        log_info "备份现有数据..."
        BACKUP_DIR="backup/$(date +%Y%m%d_%H%M%S)"
        mkdir -p "$BACKUP_DIR"
        cp -r data "$BACKUP_DIR/"
        log_success "数据已备份到 $BACKUP_DIR"
    fi
}

# 构建和部署
deploy() {
    local env_type=${1:-"development"}
    
    log_info "开始部署 Docker Manager ($env_type 环境)..."
    
    # 停止现有容器
    log_info "停止现有容器..."
    docker-compose down || true
    
    # 清理旧镜像 (可选)
    if [ "$2" == "--clean" ]; then
        log_info "清理旧镜像..."
        docker system prune -f
    fi
    
    # 构建和启动
    if [ "$env_type" == "production" ]; then
        log_info "使用生产环境配置部署..."
        docker-compose -f docker-compose.prod.yml up -d --build
    else
        log_info "使用开发环境配置部署..."
        docker-compose up -d --build
    fi
    
    # 等待服务启动
    log_info "等待服务启动..."
    sleep 10
    
    # 检查服务状态
    if docker-compose ps | grep -q "Up"; then
        log_success "Docker Manager 部署成功!"
        log_info "访问地址: http://localhost:3000"
        
        # 显示日志
        log_info "最近的日志:"
        docker-compose logs --tail=20
    else
        log_error "部署失败，请检查日志"
        docker-compose logs
        exit 1
    fi
}

# 健康检查
health_check() {
    log_info "执行健康检查..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f http://localhost:3000/health &> /dev/null; then
            log_success "健康检查通过"
            return 0
        fi
        
        log_info "等待服务启动... ($attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    log_error "健康检查失败"
    return 1
}

# 显示帮助
show_help() {
    echo "Docker Manager 部署脚本"
    echo ""
    echo "用法: $0 [选项] [命令]"
    echo ""
    echo "命令:"
    echo "  deploy [dev|prod] [--clean]  部署应用"
    echo "  check                        检查系统依赖和环境"
    echo "  backup                       备份数据"
    echo "  keys                         生成安全密钥"
    echo "  health                       健康检查"
    echo "  logs                         查看日志"
    echo "  stop                         停止服务"
    echo "  restart                      重启服务"
    echo ""
    echo "选项:"
    echo "  --clean                      清理旧镜像"
    echo "  -h, --help                   显示帮助"
}

# 主函数
main() {
    case "${1:-deploy}" in
        "check")
            check_dependencies
            check_environment
            ;;
        "keys")
            generate_keys
            ;;
        "backup")
            backup_data
            ;;
        "deploy")
            check_dependencies
            check_environment
            backup_data
            deploy "${2:-development}" "$3"
            health_check
            ;;
        "health")
            health_check
            ;;
        "logs")
            docker-compose logs -f
            ;;
        "stop")
            log_info "停止服务..."
            docker-compose down
            log_success "服务已停止"
            ;;
        "restart")
            log_info "重启服务..."
            docker-compose restart
            log_success "服务已重启"
            ;;
        "-h"|"--help"|"help")
            show_help
            ;;
        *)
            log_error "未知命令: $1"
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"