/**
 * Goal Constraint System - LLM Goal Extraction
 *
 * Uses LLM to extract core goals and key metrics from conversation messages.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CoreGoal, KeyMetric } from "./types.js";
import { STOP_WORDS } from "./types.js";
import { extractGoalKeywords } from "./embedding.js";

const GOAL_EXTRACTION_PROMPT = `从以下对话中提取核心目标和关键指标。

请以JSON格式返回：
{
  "goals": ["目标1", "目标2", ...],
  "metrics": [{"name": "指标名", "value": "指标值"}, ...]
}

要求：
- goals: 识别用户真正想要完成的任务（最多5个）
- metrics: 识别可量化的指标（如文件数、错误数、代码行数等）
- 用中文回答
- 只返回JSON，不要其他内容`;

export async function extractGoalsWithLLM(
  messages: AgentMessage[],
  ctx: ExtensionContext
): Promise<{ goals: CoreGoal[]; metrics: KeyMetric[] }> {
  const model = ctx.model;
  if (!model) {
    console.warn('[GoalConstraint] No model available, using heuristics');
    return extractWithHeuristics(messages);
  }

  const apiKey = await ctx.modelRegistry.getApiKeyForProvider(model.provider);
  if (!apiKey) {
    console.warn('[GoalConstraint] No API key, using heuristics');
    return extractWithHeuristics(messages);
  }

  const userMsgs = messages
    .filter(m => m.role === "user")
    .map(m => typeof m.content === "string" ? m.content : "")
    .filter(Boolean)
    .join("\n---\n");

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
          { role: 'system', content: GOAL_EXTRACTION_PROMPT },
          { role: 'user', content: `对话内容：\n${userMsgs}` }
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

    return parseLLMResponse(content, messages);
  } catch (error) {
    console.warn('[GoalConstraint] LLM call failed, using heuristics:', error);
    return extractWithHeuristics(messages);
  }
}

async function parseLLMResponse(
  content: string,
  originalMessages: AgentMessage[]
): Promise<{ goals: CoreGoal[]; metrics: KeyMetric[] }> {
  try {
    // Try to extract JSON (may have markdown code blocks)
    const jsonMatch = content.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || [null, content];
    const jsonStr = jsonMatch[1] || content;
    const parsed = JSON.parse(jsonStr);

    // Get keywords for all goals in parallel
    const goalPromises = (parsed.goals || []).slice(0, 5).map(async (text: string, i: number) => {
      const { keywords } = await extractGoalKeywords(text);
      return {
        id: `goal_${Date.now()}_${i}`,
        text: text.substring(0, 200),
        keywords,
        priority: 1,
        createdAt: Date.now()
      };
    });

    const goals = await Promise.all(goalPromises);

    const metrics: KeyMetric[] = (parsed.metrics || []).slice(0, 10).map((m: any) => ({
      name: m.name || '',
      value: m.value || '',
      context: ''
    }));

    return { goals, metrics };
  } catch (error) {
    console.warn('[GoalConstraint] Failed to parse LLM response, using heuristics');
    return extractWithHeuristics(originalMessages);
  }
}

/**
 * Fallback heuristics-based goal extraction
 */
export async function extractWithHeuristics(
  messages: AgentMessage[]
): Promise<{ goals: CoreGoal[]; metrics: KeyMetric[] }> {
  const userMsgs = messages.filter(m => m.role === "user");
  const goals: CoreGoal[] = [];
  const seen = new Set<string>();

  for (const msg of userMsgs) {
    const text = typeof msg.content === "string" ? msg.content : "";
    const { keywords } = extractGoalKeywords(text);
    const key = keywords.slice(0, 3).join(",");

    if (key && !seen.has(key) && goals.length < 5) {
      seen.add(key);
      goals.push({
        id: `goal_${Date.now()}_${goals.length}`,
        text: text.substring(0, 200),
        keywords,
        priority: 1,
        createdAt: Date.now()
      });
    }
  }

  return { goals, metrics: [] };
}
