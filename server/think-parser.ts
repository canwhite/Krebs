// ==================== Think Tag Parser ====================
/**
 * 从 text_delta 中提取 think 标签内容和普通内容
 *
 * 返回：{ textDelta: string, thinkDelta?: string }
 * - textDelta: 过滤掉 think 标签后的普通内容
 * - thinkDelta: think 标签内的内容（如果有）
 */
interface ParsedDelta {
  textDelta: string;
  thinkDelta?: string;
}

interface ThinkParserState {
  isInThinkTag: boolean;
  pendingContent: string;
  currentThinkContent: string;
}

const thinkParserStates = new Map<any, ThinkParserState>();

function parseThinkTagsFromDelta(
  delta: string,
  ws: any,
): ParsedDelta {
  // 获取或初始化该连接的解析状态
  let state = thinkParserStates.get(ws);
  if (!state) {
    state = {
      isInThinkTag: false,
      pendingContent: "",
      currentThinkContent: ""
    };
    thinkParserStates.set(ws, state);
  }

  // 将新的增量添加到缓存
  state.pendingContent += delta;

  const result: ParsedDelta = { textDelta: "" };
  let remaining = state.pendingContent;

  // 处理所有可能的标签
  while (remaining.length > 0) {
    if (state.isInThinkTag) {
      // 在 think 标签内，查找结束标签 </think>
      const endTagIndex = remaining.indexOf("</think>");

      if (endTagIndex !== -1) {
        // 找到结束标签
        const thinkContent = remaining.substring(0, endTagIndex);
        result.thinkDelta = thinkContent; // 只发送最后一段增量，不发送累积内容

        // 重置状态
        remaining = remaining.substring(endTagIndex + "</think>".length);
        state.isInThinkTag = false;
        state.currentThinkContent = "";
      } else {
        // 仍在标签内，流式发送增量内容
        result.thinkDelta = remaining; // 发送增量而非累积内容
        state.currentThinkContent += remaining;
        state.pendingContent = "";
        return result;
      }
    } else {
      // 在标签外，查找开始标签 <think
      const startTagIndex = remaining.indexOf("<think");

      if (startTagIndex !== -1) {
        // 添加开始标签之前的内容作为普通文本
        result.textDelta += remaining.substring(0, startTagIndex);

        // 查找开始标签的结束位置 ">"
        const tagEndIndex = remaining.indexOf(">", startTagIndex);
        if (tagEndIndex !== -1) {
          remaining = remaining.substring(tagEndIndex + 1);
          state.isInThinkTag = true;
        } else {
          // 不完整的开始标签，保留到下次处理
          state.pendingContent = remaining.substring(0, startTagIndex);
          return result;
        }
      } else {
        // 没有找到标签，所有内容都是普通文本
        result.textDelta += remaining;
        remaining = "";
      }
    }
  }

  // 更新缓存
  state.pendingContent = remaining;
  return result;
}

// 在 WebSocket 关闭时清理状态
function cleanupThinkParserState(ws: any) {
  thinkParserStates.delete(ws);
}

export { parseThinkTagsFromDelta, cleanupThinkParserState };
export type { ParsedDelta, ThinkParserState };
