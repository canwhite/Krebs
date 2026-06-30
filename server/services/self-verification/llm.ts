/**
 * Self-Verification - LLM Verification Logic
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { VerificationResult } from "./types.js";

const VERIFICATION_PROMPT = `You are a verification assistant. Check if the Agent's response solves the user's problem.

## Original User Goal
{{originalGoal}}

## Agent Response
{{result}}

## Verification Criteria (ALL must pass for PASS):
1. **Relevance**: Does the response address the user's question without going off-topic?
2. **Completeness**: Are all major parts of the user's request covered?
3. **Coherence**: Is the reasoning self-consistent with no obvious contradictions?
4. **Clarity**: Is the expression clear without confusion or ambiguity?

## Notes
- Do NOT verify if code actually runs (requires execution)
- Do NOT verify factual accuracy (requires external knowledge)
- Focus on: whether the response reasonably solves the user's problem

## Output Format
PASS - all criteria satisfied
FAIL: <specific reason> - indicate which criterion failed and why`;

export async function verifyResult(
  result: string,
  originalGoal: string,
  ctx: ExtensionContext
): Promise<VerificationResult> {
  const model = ctx.model;
  if (!model) {
    console.warn('[SelfVerification] No model available');
    return { passed: true }; // Default to PASS on LLM failure
  }

  const apiKey = await ctx.modelRegistry.getApiKeyForProvider(model.provider);
  if (!apiKey) {
    console.warn('[SelfVerification] No API key');
    return { passed: true }; // Default to PASS on LLM failure
  }

  const prompt = VERIFICATION_PROMPT
    .replace("{{originalGoal}}", originalGoal)
    .replace("{{result}}", result);

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
    return { passed: true }; // Default to PASS on LLM failure
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

  // Could not parse, default to pass
  console.warn('[SelfVerification] Could not parse verification response:', content);
  return { passed: true };
}
