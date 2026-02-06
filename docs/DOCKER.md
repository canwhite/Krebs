# Krebs Docker 部署指南

本文档介绍如何使用 Docker 和 Docker Compose 部署 Krebs AI Agent 框架。

## 架构概述

Krebs Docker 部署包含两个服务：

1. **Gateway 服务**（后端）
   - 端口：3000（HTTP API）、3001（WebSocket）
   - 功能：AI Agent 核心服务，处理聊天请求、Agent 管理、Session 管理

2. **UI 服务**（前端）
   - 端口：8080（nginx）
   - 功能：Web UI 界面，通过 nginx 代理 API 请求到 Gateway

## 快速开始

### 1. 前置要求

- Docker（>= 20.10）
- Docker Compose（>= 2.0）

### 2. 配置环境变量

创建 `.env` 文件（复制自 `.env.example`）：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置必要的 API Key：

```bash
# DeepSeek API（推荐）
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# 或者使用其他 Provider
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. 启动服务

```bash
# 构建并启动所有服务
docker compose up --build

# 或者后台运行
docker compose up --build -d
```

### 4. 访问服务

- **Web UI**: http://localhost:8080
- **API 文档**: http://localhost:3000/health
- **WebSocket**: ws://localhost:3001

## 命令说明

### 构建镜像

```bash
# 构建所有服务
docker compose build

# 只构建 Gateway
docker compose build gateway

# 只构建 UI
docker compose build ui
```

### 启动服务

```bash
# 启动所有服务（前台运行）
docker compose up

# 启动所有服务（后台运行）
docker compose up -d

# 启动特定服务
docker compose up gateway
```

### 停止服务

```bash
# 停止所有服务
docker compose down

# 停止并删除数据卷
docker compose down -v
```

### 查看日志

```bash
# 查看所有服务日志
docker compose logs

# 查看特定服务日志
docker compose logs gateway
docker compose logs ui

# 实时跟踪日志
docker compose logs -f gateway
```

### 进入容器

```bash
# 进入 Gateway 容器
docker compose exec gateway sh

# 进入 UI 容器
docker compose exec ui sh
```

## 环境变量配置

### Gateway 服务

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | HTTP API 端口 |
| `HOST` | `0.0.0.0` | 服务监听地址 |
| `LOG_LEVEL` | `info` | 日志级别（debug/info/warn/error） |
| `AGENT_NAME` | `krebs` | Agent 名称 |
| `AGENT_MAX_CONCURRENT` | `3` | 最大并发数 |
| `AGENT_DEFAULT_MODEL` | `deepseek-chat` | 默认模型 |
| `AGENT_DEFAULT_PROVIDER` | `deepseek` | 默认 Provider |
| `DEEPSEEK_API_KEY` | - | DeepSeek API Key |
| `ANTHROPIC_API_KEY` | - | Anthropic API Key |
| `OPENAI_API_KEY` | - | OpenAI API Key |

### UI 服务

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `UI_PORT` | `8080` | Web UI 端口 |

## 端口映射

默认端口映射：

| 服务 | 容器端口 | 主机端口 | 说明 |
|------|----------|----------|------|
| gateway | 3000 | 3000 | HTTP API |
| gateway | 3001 | 3001 | WebSocket |
| ui | 80 | 8080 | Web UI |

可以通过修改 `docker-compose.yml` 或环境变量来调整端口映射：

```yaml
services:
  gateway:
    ports:
      - "4000:3000"  # 将主机端口改为 4000
  ui:
    ports:
      - "9000:80"    # 将主机端口改为 9000
```

## 数据持久化

Docker Compose 使用命名数据卷来持久化数据：

- `krebs-data`: 会话数据、记忆数据
- `krebs-workspace`: 工作区文件

### 备份数据

```bash
# 备份数据卷
docker run --rm -v krebs-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/krebs-data-backup.tar.gz -C /data .

# 备份工作区
docker run --rm -v krebs-workspace:/workspace -v $(pwd):/backup \
  alpine tar czf /backup/krebs-workspace-backup.tar.gz -C /workspace .
```

### 恢复数据

```bash
# 恢复数据卷
docker run --rm -v krebs-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/krebs-data-backup.tar.gz -C /data

# 恢复工作区
docker run --rm -v krebs-workspace:/workspace -v $(pwd):/backup \
  alpine tar xzf /backup/krebs-workspace-backup.tar.gz -C /workspace
```

## 健康检查

两个服务都配置了健康检查：

- **Gateway**: 每 30 秒检查一次 `/health` 端点
- **UI**: 每 30 秒检查一次 `/` 端点

查看健康状态：

```bash
docker compose ps
```

## 故障排查

### 1. 端口占用

如果启动失败，提示端口被占用：

```bash
# 查找占用端口的进程
lsof -i :3000
lsof -i :8080

# 终止进程
kill -9 <PID>

# 或修改 docker-compose.yml 中的端口映射
```

### 2. API Key 未配置

如果服务启动但无法正常工作：

```bash
# 检查环境变量
docker compose exec gateway env | grep API_KEY

# 确认 .env 文件配置正确
cat .env
```

### 3. 数据卷权限问题

如果遇到权限错误：

```bash
# 重建数据卷（注意：会删除现有数据）
docker compose down -v
docker compose up --build
```

### 4. 查看详细日志

```bash
# 查看 Gateway 日志
docker compose logs -f gateway

# 查看 UI 日志
docker compose logs -f ui

# 查看所有日志
docker compose logs -f
```

## 生产环境建议

1. **使用 secrets 管理敏感信息**
   ```yaml
   services:
     gateway:
       secrets:
         - deepseek_api_key
   secrets:
     deepseek_api_key:
       file: ./secrets/deepseek_api_key.txt
   ```

2. **限制资源使用**
   ```yaml
   services:
     gateway:
       deploy:
         resources:
           limits:
             cpus: '2'
             memory: 2G
   ```

3. **使用反向代理**
   - 使用 nginx 或 Traefik 作为反向代理
   - 配置 SSL/TLS 证书
   - 实现负载均衡

4. **监控和日志**
   - 集成 Prometheus + Grafana 监控
   - 使用 ELK 或 Loki 收集日志
   - 设置告警规则

5. **安全加固**
   - 使用非 root 用户运行（已配置）
   - 限制网络访问
   - 定期更新镜像
   - 扫描安全漏洞

## 单独构建镜像

如果只需要单独构建某个服务的镜像：

```bash
# 构建 Gateway 镜像
docker build -t krebs-gateway:latest -f Dockerfile .

# 构建 UI 镜像
docker build -t krebs-ui:latest -f ui/Dockerfile ./ui
```

## 开发模式

如果需要在开发模式下运行（挂载本地代码）：

```bash
# 开发模式运行 Gateway（挂载 src 目录）
docker compose -f docker-compose.dev.yml up
```

注意：需要创建 `docker-compose.dev.yml` 配置文件。

## 相关文档

- [生产环境部署](../production.md)
- [项目 README](../README.md)
- [架构文档](../docs/architecture-analysis.md)

## 支持

如有问题，请提交 Issue 或查看项目文档。
