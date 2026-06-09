/**
 * Before Agent Confirm Extension
 *
 * 在 Agent 开始前执行自定义逻辑的扩展框架。
 *
 * 后续扩展点：
 * 1. 人工确认：需要 Krebs 支持 WebSocket 确认协议
 * 2. 上下文修改：修改 event.prompt 或 event.systemPrompt
 * 3. 日志记录：接入监控系统
 * 4. 白名单/黑名单：检查 prompt 是否允许执行
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts";

export default function (api: ExtensionAPI) {
  api.on("before_agent_start", async (event, ctx) => {
    // 日志记录（可在调试时打开）
    // console.log("[BeforeAgentConfirm] ========== BEFORE AGENT START ==========");
    // console.log("[BeforeAgentConfirm] Prompt:", event.prompt);
    // console.log("[BeforeAgentConfirm] System Prompt:", event.systemPrompt);
    // console.log("[BeforeAgentConfirm] Has UI:", ctx.hasUI);

    // 返回值可选：
    // - { message: {...} }: 添加额外消息
    // - { systemPrompt: "..." }: 替换 system prompt
    // - 无返回值: 继续执行
  });
}
