import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/**
 * 获取当前时间工具
 *
 * 获取当前时间和日期，支持指定时区
 */
export const getCurrentTimeTool: ToolDefinition = {
  name: "get_current_time",
  label: "Get Current Time",
  description: "获取当前时间和日期。当用户询问时间时使用。",
  parameters: Type.Object({
    timezone: Type.Optional(
      Type.String({ description: "时区，例如 'Asia/Shanghai'，默认本地时区" }),
    ),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
    const { timezone } = params as { timezone?: string };
    const now = new Date();
    const result = {
      iso: now.toISOString(),
      locale: now.toLocaleString("zh-CN", {
        timeZone: timezone || undefined,
        dateStyle: "full",
        timeStyle: "long",
      }),
      timestamp: now.getTime(),
    };

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ],
      details: {},
    };
  },
};
