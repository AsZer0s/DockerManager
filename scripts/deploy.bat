@echo off
setlocal enabledelayedexpansion

REM Docker Manager 部署脚本 (Windows)
REM 用于自动化部署 Docker Manager 系统

title Docker Manager 部署工具

:main
if "%1"=="" goto deploy_dev
if "%1"=="check" goto check
if "%1"=="keys" goto generate_keys
if "%1"=="backup" goto backup
if "%1"=="deploy" goto deploy_with_env
if "%1"=="health" goto health_check
if "%1"=="logs" goto show_logs
if "%1"=="stop" goto stop_service
if "%1"=="restart" goto restart_service
if "%1"=="help" goto show_help
if "%1"=="-h" goto show_help
if "%1"=="--help" goto show_help

echo [ERROR] 未知命令: %1
goto show_help

:check
echo [INFO] 检查系统依赖...
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker 未安装，请先安装 Docker Desktop
    exit /b 1
)

docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Compose 未安装，请先安装 Docker Compose
    exit /b 1
)

echo [SUCCESS] 系统依赖检查通过

echo [INFO] 检查环境变量配置...
if not exist ".env" (
    echo [WARNING] .env 文件不存在，从模板创建...
    if exist "server\env.example" (
        copy "server\env.example" ".env" >nul
        echo [WARNING] 请编辑 .env 文件并设置正确的环境变量
        echo [WARNING] 特别注意设置以下变量:
        echo [WARNING]   - TELEGRAM_BOT_TOKEN
        echo [WARNING]   - JWT_SECRET
        echo [WARNING]   - ENCRYPTION_KEY
        pause
    ) else (
        echo [ERROR] 找不到环境变量模板文件
        exit /b 1
    )
)

echo [SUCCESS] 环境变量检查通过
goto :eof

:generate_keys
echo [INFO] 生成安全密钥...
echo.
echo 请使用以下命令生成安全密钥:
echo.
echo PowerShell:
echo   $jwt = [System.Web.Security.Membership]::GeneratePassword(64, 0)
echo   $enc = -join ((1..32) ^| ForEach {'{0:X2}' -f (Get-Random -Max 256)})
echo   Write-Host "JWT_SECRET=$jwt"
echo   Write-Host "ENCRYPTION_KEY=$enc"
echo.
echo 或者访问在线生成器:
echo   https://www.random.org/strings/
echo.
goto :eof

:backup
if exist "data" (
    echo [INFO] 备份现有数据...
    set "backup_dir=backup\%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
    set "backup_dir=!backup_dir: =0!"
    mkdir "!backup_dir!" 2>nul
    xcopy "data" "!backup_dir!\data" /E /I /Q >nul
    echo [SUCCESS] 数据已备份到 !backup_dir!
) else (
    echo [INFO] 没有找到现有数据目录
)
goto :eof

:deploy_with_env
if "%2"=="prod" goto deploy_prod
if "%2"=="production" goto deploy_prod
goto deploy_dev

:deploy_dev
echo [INFO] 开始部署 Docker Manager (开发环境)...
call :stop_containers
call :build_and_start "docker-compose.yml"
goto :eof

:deploy_prod
echo [INFO] 开始部署 Docker Manager (生产环境)...
call :stop_containers
call :build_and_start "docker-compose.prod.yml"
goto :eof

:stop_containers
echo [INFO] 停止现有容器...
docker-compose down 2>nul
goto :eof

:build_and_start
echo [INFO] 构建和启动容器...
if "%3"=="--clean" (
    echo [INFO] 清理旧镜像...
    docker system prune -f
)

docker-compose -f %1 up -d --build
if errorlevel 1 (
    echo [ERROR] 部署失败
    docker-compose -f %1 logs
    exit /b 1
)

echo [INFO] 等待服务启动...
timeout /t 10 /nobreak >nul

docker-compose -f %1 ps | findstr "Up" >nul
if errorlevel 1 (
    echo [ERROR] 服务启动失败
    docker-compose -f %1 logs
    exit /b 1
) else (
    echo [SUCCESS] Docker Manager 部署成功!
    echo [INFO] 访问地址: http://localhost:3000
    echo.
    echo [INFO] 最近的日志:
    docker-compose -f %1 logs --tail=20
)
goto :eof

:health_check
echo [INFO] 执行健康检查...
set /a attempts=0
set /a max_attempts=30

:health_loop
set /a attempts+=1
curl -f http://localhost:3000/health >nul 2>&1
if not errorlevel 1 (
    echo [SUCCESS] 健康检查通过
    goto :eof
)

if !attempts! geq !max_attempts! (
    echo [ERROR] 健康检查失败
    exit /b 1
)

echo [INFO] 等待服务启动... (!attempts!/!max_attempts!)
timeout /t 2 /nobreak >nul
goto health_loop

:show_logs
docker-compose logs -f
goto :eof

:stop_service
echo [INFO] 停止服务...
docker-compose down
echo [SUCCESS] 服务已停止
goto :eof

:restart_service
echo [INFO] 重启服务...
docker-compose restart
echo [SUCCESS] 服务已重启
goto :eof

:show_help
echo Docker Manager 部署脚本 (Windows)
echo.
echo 用法: %0 [命令] [选项]
echo.
echo 命令:
echo   deploy [dev^|prod] [--clean]  部署应用
echo   check                        检查系统依赖和环境
echo   backup                       备份数据
echo   keys                         生成安全密钥说明
echo   health                       健康检查
echo   logs                         查看日志
echo   stop                         停止服务
echo   restart                      重启服务
echo   help                         显示帮助
echo.
echo 选项:
echo   --clean                      清理旧镜像
echo.
echo 示例:
echo   %0                           部署开发环境
echo   %0 deploy prod               部署生产环境
echo   %0 check                     检查环境
echo.
goto :eof