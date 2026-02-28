# Task: Docker 容器 API Key 验证机制

**任务ID**: task_api_key_validation_260227_133348
**创建时间**: 2026-02-27
**状态**: 进行中
**目标**: 修复 Docker 容器启动时的 API Key 验证逻辑，确保至少有一个有效的 API Key 才能启动服务

## 最终目标
实现严格的 API Key 验证机制：当 `ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 或 `DEEPSEEK_API_KEY` 都为空时，容器应该停止运行并显示明确的错误消息。

## 拆解步骤

### 1. 分析现有代码
- [x] 检查 Docker 配置文件（docker-compose.yml, Dockerfile）
- [x] 检查环境变量加载逻辑（src/index.ts）
- [x] 确认当前验证逻辑位置（src/index.ts:122）

### 2. 修改启动验证逻辑
- [ ] 在 `src/index.ts` 的 `startServer` 函数中添加 API Key 验证
- [ ] 当所有三个 API Key 都为空时，抛出错误并停止容器
- [ ] 提供清晰的错误消息，告知用户需要配置至少一个 API Key

### 3. 测试验证
- [ ] 测试没有任何 API Key 的情况（应该失败）
- [ ] 测试只有一个 API Key 的情况（应该成功）
- [ ] 测试有多个 API Key 的情况（应该成功）

## 当前进度
### 正在进行: 修改启动验证逻辑
当前代码在第 122 行只是警告未配置 API Key，但仍然继续启动服务。需要修改为在没有有效 API Key 时抛出错误。

## 下一步行动
1. 修改 `src/index.ts` 文件，添加严格的 API Key 验证逻辑
2. 重新构建 Docker 镜像测试
3. 验证各种场景下的行为
