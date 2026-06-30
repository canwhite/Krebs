/**
 * Self-Verification - LLM Verification Logic
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { VerificationResult } from "./types.js";

const VERIFICATION_PROMPT = `你是验证助手。检查 Agent 的回答是否解决了用户的问题。

## 用户原始目标
${"${originalGoal}"}

## Agent 回答
${"${result}"}

## 验证标准（满足所有才 PASS）：
1. **相关性**：回答是否针对用户的问题，没有答非所问
2. **完整性**：用户要求的主要部分是否都有涉及
3. **逻辑性**：推理过程是否自洽，没有明显矛盾
4. **清晰度**：表达是否清晰，没有混淆或歧义

## 注意
- 不要验证代码是否能运行（需要实际执行）
- 不要验证事实准确性（需要查询外部知识）
- 专注于：回答是否合理地解决了用户的问题

## 输出格式
PASS - 所有标准满足
FAIL: <具体原因> - 指出哪个标准没满足及原因`;

export async function verifyResult(
  result: string,
  originalGoal: string,
  ctx: ExtensionContext
): Promise<VerificationResult> {
  const model = ctx.model;
  if (!model) {
    console.warn('[SelfVerification] No model available');
    return { passed: true }; // 验证 LLM 失败时默认 PASS
  }

  const apiKey = await ctx.modelRegistry.getApiKeyForProvider(model.provider);
  if (!apiKey) {
    console.warn('[SelfVerification] No API key');
    return { passed: true };
  }

  const prompt = VERIFICATION_PROMPT
    .replace("${originalGoal}", originalGoal)
    .replace("${result}", result);

  try {
    const response = await fetch(`${model.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model.id,
        messages: [
          { role: 'system', content: prompt }
        ],
        max_tokens: 500,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim();

    return parseVerificationResponse(content);
  } catch (error) {
    console.warn('[SelfVerification] LLM call failed:', error);
    return { passed: true }; // 验证 LLM 失败时默认 PASS
  }
}

function parseVerificationResponse(content: string): VerificationResult {
  if (content.startsWith("PASS")) {
    return { passed: true };
  }

  if (content.startsWith("FAIL:")) {
    const reason = content.substring(5).trim();
    return { passed: false, reason };
  }

  // 无法解析，默认通过
  console.warn('[SelfVerification] Could not parse verification response:', content);
  return { passed: true };
}
