# Task: 修复 Docker 构建网络超时问题

**任务ID**: task_docker_network_260206_095036
**创建时间**: 2026-02-06
**状态**: 进行中

## 最终目标
解决 Docker 构建时无法连接到 Docker Hub 的网络超时问题，使 `docker compose up --build` 能够成功构建镜像。

## 错误信息
```
ERROR [krebs-ui internal] load metadata for docker.io/library/nginx:alpine
ERROR [krebs-gateway internal] load metadata for docker.io/library/node:22-alpine

failed to solve: DeadlineExceeded: DeadlineExceeded: failed to fetch anonymous token:
Get "https://auth.docker.io/token?scope=repository%3Alibrary%2Fnginx%3Apull&service=registry.docker.io":
dial tcp [2a03:2880:f127:283:face:b00c:0:25de]:443: i/o timeout
```

## 问题分析
1. **网络超时**: 无法连接到 Docker Hub (docker.io)
2. **IPv6 问题**: 错误显示尝试连接 IPv6 地址 `[2a03:2880:f127:283:face:b00c:0:25de]:443`
3. **影响镜像**: nginx:alpine 和 node:22-alpine

## 拆解步骤

### 1. 诊断网络问题
- [ ] 1.1 检查当前网络连接状态
- [ ] 1.2 测试能否访问 Docker Hub
- [ ] 1.3 检查 Docker 配置
- [ ] 1.4 检查系统代理设置

### 2. 提供解决方案
- [ ] 2.1 方案1: 配置 Docker 镜像加速器（推荐）
- [ ] 2.2 方案2: 切换到 IPv4
- [ ] 2.3 方案3: 使用代理
- [ ] 2.4 方案4: 预先拉取镜像

### 3. 验证修复
- [ ] 3.1 测试 Docker 连接
- [ ] 3.2 重新构建镜像
- [ ] 3.3 验证服务启动

## 当前进度

### 正在进行
诊断网络问题并提供解决方案

## 下一步行动
1. 检查网络连接和 Docker 配置
2. 提供多个解决方案供用户选择
