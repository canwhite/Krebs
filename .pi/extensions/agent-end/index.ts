import type { ExtensionAPI } from "@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts";

export default function (api: ExtensionAPI) {
  api.on("agent_end", async (event, ctx) => {
    // TODO: 实现 agent_end 逻辑
  });
}
