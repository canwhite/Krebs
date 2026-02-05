我觉得应该更好的是openclaw-cn-ds会根据一系列的操作给出结果，我想要的动作之后的完善结果，这点openclaw-cn-ds是如何调度的，你先
分析下，然后看我们有怎样的改造区间

  文档位置：docs/openclaw-scheduling-mechanism-analysis.md

  ---
  🎯 核心发现

  openclaw-cn-ds 的"秘诀"

  它之所以能"根据一系列操作给出结果"，关键在于：

  1️⃣ 工具调用循环（最核心）

  while (true) {
    const result = await llm_call(messages, tools);

    // 检查是否有工具调用
    const toolCalls = extractToolCalls(result);
    if (toolCalls.length === 0) break;  // 没有 → 结束

    // 执行工具
    const toolResults = await executeTools(toolCalls);

    // 工具结果加回历史 → 下一轮 LLM 调用
    messages.push({ role: "user", content: toolResults });
  }

  // LLM 根据所有工具结果给出最终答案
  return finalText;

  Krebs 现状：只调用一次 LLM，无法支持多步工具调用。

  ---
  2️⃣ 智能错误恢复

  - 上下文溢出 → 自动压缩历史
  - 认证失败 → 切换 Auth Profile
  - 模型错误 → Model Fallback（降级到备用模型）

  Krebs 现状：只有基础错误处理。

  ---
  3️⃣ 结果 Payload 系统

  - 工具结果和文本分离
  - 支持流式分块输出
  - 回复指令（@reply、@final）

  Krebs 现状：简单字符串拼接。

  ---
  💡 建议的改造优先级

  🔴 第一优先级：工具调用循环

  这是多步推理的基础，建议立即实施。

  🟡 第二优先级：上下文压缩 + Payload 系统

  长期运行的保障。

  🟢 第三优先级：Model Fallback 等增强功能

  锦上添花。
