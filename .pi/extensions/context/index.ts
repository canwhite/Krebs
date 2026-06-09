import type { ExtensionAPI } from "@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts";

export default function (api: ExtensionAPI) {
  api.on("context", async (event, ctx) => {
    // TODO: 实现 context 逻辑
  });
}
