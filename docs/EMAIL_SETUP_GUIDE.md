# 邮件服务配置指南

本指南将帮助您配置 Docker Manager 的邮件发送功能，支持各种常见的邮件服务商。

## 🚀 快速开始

### 1. 基本配置

在 `.env` 文件中添加以下配置：

```bash
# SMTP 服务器配置
SMTP_HOST=your_smtp_server
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@example.com
SMTP_PASS=your_password_or_auth_code
SMTP_FROM=Docker Manager <your_email@example.com>
```

### 2. 重要注意事项

- **发件人地址匹配**: `SMTP_FROM` 中的邮箱地址必须与 `SMTP_USER` 匹配或为其授权地址
- **授权码 vs 密码**: 大多数邮件服务商需要使用授权码而不是登录密码
- **端口和安全设置**: 不同端口对应不同的安全协议

## 📧 常见邮件服务商配置

### 163 邮箱 (推荐)

```bash
SMTP_HOST=smtp.163.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@163.com
SMTP_PASS=your_authorization_code
SMTP_FROM=Docker Manager <your_email@163.com>
```

**设置步骤:**
1. 登录 163 邮箱
2. 进入 `设置` → `POP3/SMTP/IMAP`
3. 开启 `SMTP 服务`
4. 生成授权码并使用该授权码作为密码

### QQ 邮箱

```bash
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@qq.com
SMTP_PASS=your_authorization_code
SMTP_FROM=Docker Manager <your_email@qq.com>
```

**设置步骤:**
1. 登录 QQ 邮箱
2. 进入 `设置` → `账户`
3. 开启 `SMTP 服务`
4. 生成授权码并使用该授权码作为密码

### Gmail

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=Docker Manager <your_email@gmail.com>
```

**设置步骤:**
1. 启用两步验证
2. 生成应用专用密码
3. 使用应用专用密码而不是账户密码

### Outlook/Hotmail

```bash
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@outlook.com
SMTP_PASS=your_password
SMTP_FROM=Docker Manager <your_email@outlook.com>
```

### 企业邮箱 (阿里云)

```bash
SMTP_HOST=smtp.mxhichina.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@yourdomain.com
SMTP_PASS=your_password
SMTP_FROM=Docker Manager <your_email@yourdomain.com>
```

## 🔧 端口和安全设置说明

| 端口 | 安全协议 | SMTP_SECURE | 说明 |
|------|----------|-------------|------|
| 25   | 无加密   | false       | 传统端口，多数ISP已屏蔽 |
| 587  | STARTTLS | false       | 推荐的TLS端口 |
| 465  | SSL/TLS  | true        | 传统的SSL端口 |

## 🧪 测试配置

### 1. 使用测试脚本

```bash
# 测试 SMTP 连接和发送
node scripts/simple-smtp-test.js

# 发送到指定邮箱
node scripts/simple-smtp-test.js test@example.com
```

### 2. 使用诊断工具

```bash
# 全面诊断邮件配置
node scripts/diagnose-email.js
```

## ❌ 常见错误及解决方案

### 1. 认证失败 (EAUTH)

**错误信息**: `Invalid login: 535 Error: authentication failed`

**解决方案**:
- 检查用户名和密码是否正确
- 确认是否使用授权码而不是登录密码
- 验证邮箱服务商是否已开启SMTP服务

### 2. 发件人地址错误 (EENVELOPE)

**错误信息**: `Mail from must equal authorized user`

**解决方案**:
- 确保 `SMTP_FROM` 中的邮箱地址与 `SMTP_USER` 匹配
- 使用格式: `Docker Manager <your_email@example.com>`

### 3. 连接失败 (ECONNECTION)

**错误信息**: `Connection timeout` 或 `Connection refused`

**解决方案**:
- 检查 SMTP 服务器地址和端口
- 确认网络连接正常
- 检查防火墙设置

### 4. SSL/TLS 错误

**错误信息**: `SSL/TLS connection error`

**解决方案**:
- 检查端口和 `SMTP_SECURE` 设置是否匹配
- 尝试不同的端口组合 (587/false 或 465/true)

## 🔒 安全最佳实践

### 1. 使用授权码

- **不要使用主账户密码**
- 为 SMTP 生成专用的授权码
- 定期更换授权码

### 2. 环境变量保护

- 不要在代码中硬编码密码
- 使用 `.env` 文件存储敏感信息
- 确保 `.env` 文件不被提交到版本控制

### 3. 访问控制

- 限制邮件发送频率
- 监控邮件发送日志
- 设置合理的收件人限制

## 🐳 Docker 部署注意事项

### 1. 环境变量传递

在 `docker-compose.yml` 中正确设置环境变量：

```yaml
environment:
  SMTP_HOST: ${SMTP_HOST}
  SMTP_PORT: ${SMTP_PORT}
  SMTP_SECURE: ${SMTP_SECURE}
  SMTP_USER: ${SMTP_USER}
  SMTP_PASS: ${SMTP_PASS}
  SMTP_FROM: ${SMTP_FROM}
```

### 2. 网络访问

确保容器可以访问外部 SMTP 服务器：

```yaml
networks:
  - default
```

## 📊 监控和日志

### 1. 查看邮件发送日志

```bash
# 查看容器日志
docker-compose logs -f docker-manager

# 过滤邮件相关日志
docker-compose logs docker-manager | grep -i smtp
```

### 2. 邮件发送状态

系统会记录以下信息：
- 邮件发送成功/失败状态
- 收件人信息
- 错误详情和建议

## 🆘 故障排除

### 1. 逐步诊断

1. **检查配置**: 运行 `node scripts/diagnose-email.js`
2. **测试连接**: 运行 `node scripts/simple-smtp-test.js`
3. **查看日志**: 检查应用日志中的错误信息
4. **验证邮箱**: 使用邮件客户端测试相同配置

### 2. 常见问题检查清单

- [ ] SMTP 服务是否已开启
- [ ] 用户名是否为完整邮箱地址
- [ ] 是否使用授权码而不是登录密码
- [ ] 发件人地址是否与认证用户匹配
- [ ] 端口和安全设置是否正确
- [ ] 网络连接是否正常
- [ ] 防火墙是否允许 SMTP 端口

## 📞 获取帮助

如果仍然遇到问题，请：

1. 运行诊断工具收集详细信息
2. 查看应用日志获取错误详情
3. 参考邮件服务商的官方文档
4. 在项目 Issues 中报告问题

---

**提示**: 配置完成后，建议发送一封测试邮件验证功能是否正常工作。