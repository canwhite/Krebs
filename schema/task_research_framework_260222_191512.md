# Task: 调研框架结构和技术点

**任务ID**: task_research_framework_260222_191512
**创建时间**: 2026-02-22 19:15:12
**状态**: 进行中
**目标**: 为小白用户详细讲解 Krebs 框架的主要结构和每个核心技术点

## 最终目标
生成一份面向小白的框架结构和技术点详解文档，包含：
1. 框架整体架构
2. 每个模块的核心职责
3. 每个技术点的详细解释
4. 技术点之间的关系和协作方式

## 拆解步骤

### 1. 读取核心文件了解项目结构
- [ ] 读取 package.json 了解依赖
- [ ] 读取 tsconfig.json 了解 TypeScript 配置
- [ ] 浏览 src/ 目录结构

### 2. 分析核心架构层次
- [ ] 理解依赖层次关系（types → shared → provider/storage → agent → gateway）
- [ ] 分析每个层次的职责
- [ ] 理解模块间的依赖关系

### 3. 详细讲解每个技术点
- [ ] TypeScript & Node.js (基础运行时)
- [ ] Provider 模式 (策略模式)
- [ ] Storage 层 (Session + Memory)
- [ ] Scheduler (Lane 队列系统)
- [ ] Agent 核心 (LLM 处理 + 工具调用)
- [ ] Skills 系统 (技能框架)
- [ ] Gateway (HTTP/WebSocket 服务)
- [ ] Docker 部署 (容器化)

### 4. 整理成易懂的文档
- [ ] 使用通俗的语言解释技术概念
- [ ] 提供代码示例
- [ ] 添加架构图和流程图

## 当前进度

### 正在进行
已完成总纲部分并创建报告文档

### 已完成
- ✅ 读取 production.md 了解项目定位
- ✅ 读取 package.json 了解技术栈
- ✅ 分析 src/ 目录结构
- ✅ 理解核心架构层次
- ✅ 创建 DEEP_DIVE_REPORT.md 文档
- ✅ 完成总纲部分（0.1-0.6章）

## 下一步行动
逐步拓展第一部分：项目概览（第1-3章）

## 技术点清单

### 基础技术
- **TypeScript**: JavaScript 的超集，添加静态类型
- **Node.js**: JavaScript 运行时环境
- **Vitest**: 测试框架

### 核心依赖
- **Anthropic SDK**: Claude AI 模型接口
- **OpenAI SDK**: GPT 模型接口
- **better-sqlite3**: SQLite 数据库
- **sqlite-vec**: 向量搜索扩展
- **chokidar**: 文件监听

### 设计模式
- **策略模式** (Provider)
- **依赖注入** (AgentDeps)
- **Facade 模式** (SkillsManager)
- **工厂模式** (Provider Factory)

## 输出格式
- 使用 Markdown 格式
- 包含代码示例
- 使用图表说明架构
- 面向小白用户，语言通俗易懂
