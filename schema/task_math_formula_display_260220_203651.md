# Task: 修复数学公式显示卡死问题

**任务ID**: task_math_formula_display_260220_203651
**创建时间**: 2026-02-20
**状态**: 进行中
**目标**: 修复Agent在处理数学公式时进入无限循环导致卡死的问题

## 最终目标
定位并修复Agent在处理包含LaTeX数学公式的markdown内容时出现的无限循环问题,确保能正常渲染和显示数学公式。

## 拆解步骤

### 1. 问题诊断 (正在进行)
- [ ] 1.1 分析日志,识别问题模式
- [ ] 1.2 检查相关代码文件
- [ ] 1.3 确定根本原因

### 2. 修复方案
- [ ] 2.1 设计修复方案
- [ ] 2.2 实施代码修改
- [ ] 2.3 测试修复效果

### 3. 验证
- [ ] 3.1 功能测试
- [ ] 3.2 回归测试

## 当前进度

### 正在进行: 设计修复方案

#### 问题根因总结

通过深入分析代码和日志,确认了以下问题:

**核心问题: LLM陷入工具调用无限循环**

从日志可以看到:
1. 用户输入包含LaTeX数学公式的markdown内容
2. Agent开始连续调用write_file工具(24次迭代)
3. 每次工具调用返回成功后,LLM没有生成最终文本回复
4. 而是继续尝试工具调用,形成无限循环
5. 直到上下文超长触发压缩机制

**根因分析:**

1. **系统提示词缺失关键指导** (src/agent/core/system-prompt.ts:529-544)
   - Tool Calling Guidelines中提到"Stop when done"
   - 但没有明确说明何时任务算"完成"
   - 对于"显示公式"这类简单展示任务,LLM可能误解为需要"保存到文件"

2. **工具调用结果缺乏终止信号**
   - write_file工具返回`{success: true}`
   - 但没有明确告知LLM"任务已完成,请生成最终回复"
   - LLM可能认为还需要继续操作

3. **循环终止条件过于宽松**
   - while循环只检查`iteration < maxIterations`
   - 没有检测"连续无效工具调用"的情况
   - 例如:连续N次相同/相似的工具调用应该提前终止

#### 修复方案设计

**方案1: 增强系统提示词 (优先级: 高, 风险: 低)**

在system-prompt.ts的buildToolCallingGuidance函数中添加明确指导:

```typescript
function buildToolCallingGuidance(toolConfig?: ToolConfig): string {
  const maxIterations = toolConfig?.maxIterations ?? 10;

  return `## Tool Calling Guidelines

1. **Choose the right tool**: Carefully select the most appropriate tool for each task
2. **Provide accurate parameters**: Ensure all required parameters are provided with correct values
3. **Iterate if needed**: You can make multiple tool calls to accomplish complex tasks
4. **Maximum iterations**: You can make up to ${maxIterations} tool calls per user message
5. **Stop when done**: Don't make unnecessary tool calls - stop when the task is complete
6. **Handle errors gracefully**: If a tool call fails, try to understand the error and adjust your approach
7. **Be efficient**: Combine related operations when possible to minimize tool calls

**IMPORTANT - When to stop tool calling:**
- For content display/formatting tasks (e.g., "display these formulas"):
  → First check if tools are needed
  → If the content is already in the user message, just format and display it directly
  → Only use tools if you need to read/write files
- After a successful tool operation:
  → If the task is complete, generate your final text response immediately
  → DO NOT make additional tool calls unless the user explicitly asks for more operations
- Remember: Your goal is to HELP the user, not to maximize tool usage
`;
}
```

**方案2: 添加循环终止检测 (优先级: 中, 风险: 中)**

在agent.ts的工具调用循环中添加检测逻辑:

```typescript
// 检测连续无效工具调用
let consecutiveToolCalls = 0;
let lastToolCallName = "";

while (iteration < this.maxIterations) {
  // ... existing code ...

  if (response.toolCalls && response.toolCalls.length > 0) {
    // 检测是否是重复的工具调用
    const currentToolNames = response.toolCalls.map(tc => tc.name).sort().join(",");
    if (currentToolNames === lastToolCallName) {
      consecutiveToolCalls++;
      if (consecutiveToolCalls > 3) {
        console.warn(`[Agent] Detected ${consecutiveToolCalls} consecutive identical tool calls, forcing termination`);
        // 强制生成最终回复
        break;
      }
    } else {
      consecutiveToolCalls = 0;
      lastToolCallName = currentToolNames;
    }

    // ... rest of tool execution code ...
  } else {
    // 没有工具调用,生成最终回复
    consecutiveToolCalls = 0;
    // ... existing code ...
  }
}
```

**方案3: 改进工具返回消息 (优先级: 低, 风险: 低)**

在builtin.ts的工具返回中添加更明确的提示:

```typescript
// write_file工具
return {
  success: true,
  message: "File written successfully. Your task is complete - please provide a text response to the user."
};
```

#### 最终实施方案

**已实施: 方案1 - 增强系统提示词** ✅

修改文件: `src/agent/core/system-prompt.ts`

在 `buildToolCallingGuidance` 函数中添加了明确的指导:
- 明确说明何时需要停止工具调用
- 针对"显示/格式化内容"类任务提供具体指导
- 强调不要重复调用相同工具
- 提醒LLM目标是帮助用户,而非最大化工具使用

**未实施:**
- ❌ 方案2 (循环终止检测) - 用户选择不修改Agent核心代码
- ❌ 方案3 (改进工具返回) - 未实施

## 修复总结

**问题根因:**
用户输入包含LaTeX数学公式的内容时,LLM陷入工具调用无限循环,连续24次迭代尝试写入文件,无法生成最终回复。

**修复方案:**
通过增强系统提示词,明确指导LLM:
1. 对于内容显示/格式化任务,首先检查是否真的需要工具
2. 如果内容已提供,直接格式化和显示,无需调用工具
3. 成功的工具操作后立即生成最终回复,不要继续调用工具
4. 避免重复的工具调用

**预期效果:**
- LLM在接收到"显示公式"类请求时,会直接渲染markdown内容,而不是尝试写入文件
- 即使使用工具,也会在成功后立即停止,不再陷入无限循环
- 不影响正常的多步骤任务

## 测试建议

建议测试场景:
1. 输入包含LaTeX数学公式的内容,验证能正常显示
2. 要求保存公式到文件,验证能正确调用write_file工具一次
3. 其他展示类任务(如"显示这段代码"),验证不会陷入工具循环
