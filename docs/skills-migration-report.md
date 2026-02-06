# Skills 迁移报告

**日期**: 2026-02-06
**来源**: openclaw-cn-ds
**目标**: Krebs skills/bundled

---

## 迁移概述

从 openclaw-cn-ds 项目迁移了 3 个高质量技能到 Krebs 系统，使 Krebs 的技能库从 3 个扩展到 6 个。

---

## 已迁移的技能

### 1. Summarize（内容摘要）

**功能**: 从 URL、播客和本地文件中总结或提取文本/转录内容

**特点**:
- 支持网页文章摘要
- YouTube 视频转录和总结
- PDF 文档处理
- 多种 LLM 模型支持（OpenAI, Anthropic, Gemini）

**使用场景**:
- 快速了解文章要点
- 提取 YouTube 视频内容
- 批量处理文档

**文件**: `skills/bundled/summarize/SKILL.md`

**依赖**:
```bash
brew install steipete/tap/summarize
```

---

### 2. Tmux（终端复用）

**功能**: 通过发送按键和抓取窗格输出来远程控制 tmux 会话

**特点**:
- 创建交互式 TTY 会话
- 并行运行多个任务
- 监控和捕获输出
- 独立 socket 管理

**使用场景**:
- 运行需要交互式终端的程序
- 并行执行多个长期任务
- 管理 REPL 会话（Python, Node 等）
- 监控命令执行状态

**文件**: `skills/bundled/tmux/SKILL.md`

**依赖**:
```bash
brew install tmux
```

**示例**:
```bash
# 创建独立会话
SOCKET="/tmp/krebs-tmux/krebs.sock"
tmux -S "$SOCKET" new-session -d -s mysession

# 发送命令
tmux -S "$SOCKET" send-keys -t mysession 'npm test' Enter

# 捕获输出
tmux -S "$SOCKET" capture-pane -p -t mysession -S -100
```

---

### 3. Notion（笔记管理）

**功能**: 通过 Notion API 创建和管理页面、数据库和区块

**特点**:
- 搜索页面和数据库
- 创建和更新页面
- 追加块内容
- 数据库查询和条目管理

**使用场景**:
- 快速创建笔记页面
- 搜索现有内容
- 管理任务数据库
- 批量创建文档

**文件**: `skills/bundled/notion/SKILL.md`

**依赖**:
- Notion API 集成（需要 NOTION_API_KEY）

**示例**:
```bash
# 搜索页面
curl -X POST "https://api.notion.com/v1/search" \
  -H "Authorization: Bearer $NOTION_KEY" \
  -d '{"query": "关键词"}'

# 创建页面
curl -X POST "https://api.notion.com/v1/pages" \
  -H "Authorization: Bearer $NOTION_KEY" \
  -d '{"parent": {"page_id": "..."}, "properties": {...}}'
```

---

## 迁移过程

### 1. 分析源技能

- openclaw-cn-ds 共有 52 个技能
- 筛选出通用性高、文档完善的技能
- 优先选择开发者和生产力相关技能

### 2. 格式转换

将 openclaw-cn-ds 的格式转换为 Krebs 格式：

**openclaw-cn-ds 格式**:
```yaml
---
metadata: {"clawdbot":{"emoji":"🧾","requires":{...}}}
---
```

**Krebs 格式**:
```yaml
---
metadata: '{"krebs":{"emoji":"🧾","category":"Productivity",...}}'
install:
  - kind: "brew"
    formula: "..."
---
```

### 3. 内容优化

- 简化过长的说明
- 保留核心用法和示例
- 添加中文翻译（适合中文用户）
- 补充最佳实践和注意事项

---

## 当前 Krebs 技能列表

| # | 技能名称 | 描述 | 来源 | 状态 |
|---|---------|------|------|------|
| 1 | Filesystem | 文件系统操作 | 原有 | ✅ |
| 2 | GitHub | GitHub 交互 | 原有 | ✅ |
| 3 | WebSearch | 网络搜索 | 原有 | ✅ |
| 4 | **Summarize** | 内容摘要 | openclaw | ✅ 新增 |
| 5 | **Tmux** | 终端复用 | openclaw | ✅ 新增 |
| 6 | **Notion** | Notion 集成 | openclaw | ✅ 新增 |

---

## 测试结果

### 编译测试
```bash
npm run build
✅ 编译成功，无错误
```

### 加载测试
```
[SkillsLoader] Loaded 6 skills from /Users/zack/Desktop/Krebs/skills/bundled
[SkillsManager] Loaded 6 skills (version 1)
✅ 所有 6 个技能成功加载
```

### API 测试
```bash
curl http://localhost:3000/api/skills
✅ 返回所有 6 个技能的完整信息
```

---

## 待迁移的候选技能

openclaw-cn-ds 中还有以下值得考虑的技能：

1. **Obsidian** - 本地笔记管理
2. **Session Logs** - 会话日志分析
3. **Model Usage** - 模型使用统计
4. **Gemini** - Google Gemini 集成
5. **OpenAI Whisper** - 语音转文字

这些技能可以根据实际需求逐步迁移。

---

## 技能质量对比

| 维度 | openclaw-cn-ds | Krebs (迁移后) |
|------|----------------|----------------|
| **文档完善度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **示例代码** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **中文支持** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **依赖管理** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **实用性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 改进建议

### 1. Metadata 解析优化

当前所有技能的 category 显示为 "general"，emoji 为 "⚡"，应该从 metadata 中正确解析：

```typescript
// 应该解析 Krebs 特定的 metadata
metadata: '{"krebs":{"emoji":"🧾","category":"Productivity"}}'
```

### 2. 技能图标展示

在前端界面中，应该显示技能的自定义 emoji 而不是统一的 ⚡。

### 3. 技能分类

按 category 对技能进行分组显示：
- Development: GitHub, Tmux
- Productivity: Notion, Summarize
- Utilities: Filesystem, WebSearch

### 4. 依赖检测

在技能详情页面显示依赖安装状态：
```typescript
// 检查命令是否可用
which summarize  // 检查 summarize 命令
which tmux       // 检查 tmux 命令
```

---

## 总结

✅ **成功迁移 3 个高质量技能**
✅ **技能库从 3 个扩展到 6 个**
✅ **所有技能成功加载和测试**
✅ **文档完善，包含中文说明**

**下一步**:
1. 优化 metadata 解析逻辑
2. 添加更多实用技能
3. 完善前端技能管理界面
4. 添加依赖安装状态检测
