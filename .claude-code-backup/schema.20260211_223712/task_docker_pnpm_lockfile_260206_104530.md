# Task: 修复 Docker 构建中的 pnpm lockfile 错误

**任务ID**: task_docker_pnpm_lockfile_260206_104530
**创建时间**: 2026-02-06
**状态**: 进行中
**目标**: 修复 Docker 构建时 pnpm install 失败的问题

## 最终目标
解决 Docker 构建过程中的 `ERR_PNPM_OUTDATED_LOCKFILE` 错误，确保 Docker 镜像能够成功构建。

## 错误分析

```
ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date with package.json

5 dependencies were added:
- @types/better-sqlite3@^7.6.13
- tsc-alias@^1.8.16
- @mariozechner/pi-coding-agent@^0.51.5
- better-sqlite3@^12.6.2
- sqlite-vec@^0.1.7-alpha.2
```

**根本原因**: package.json 中添加了新依赖，但 pnpm-lock.yaml 没有同步更新，导致 `--frozen-lockfile` 检查失败。

## 拆解步骤

### 1. 检查 Dockerfile 配置
- [ ] 1.1 检查 Dockerfile 是否正确复制了 pnpm-lock.yaml
- [ ] 1.2 检查 Dockerfile 的 COPY 指令顺序

### 2. 更新 pnpm-lock.yaml
- [ ] 2.1 在本地运行 pnpm install 更新 lockfile
- [ ] 2.2 验证 lockfile 是否包含新增的 5 个依赖

### 3. 测试 Docker 构建
- [ ] 3.1 重新构建 Docker 镜像
- [ ] 3.2 验证构建是否成功

### 4. 验证服务运行
- [ ] 4.1 启动 Docker 容器
- [ ] 4.2 检查服务健康状态

## 当前进度
### 正在进行: 检查 Dockerfile 配置
检查 Dockerfile 中是否正确复制了 package.json 和 pnpm-lock.yaml 文件

## 下一步行动
1. 读取 Dockerfile 检查 COPY 指令
2. 检查 pnpm-lock.yaml 是否存在
3. 决定修复方案（更新 lockfile 或修改 Dockerfile）
