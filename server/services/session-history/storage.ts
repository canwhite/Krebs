/**
 * Session History RAG - Storage & Content Extraction
 */

import { readFileSync } from 'fs';

/**
 * Read file line by line (synchronous, for Bun environment)
 */
export function readFileLineByLine(filePath: string): string[] {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return content.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Truncate text to sentence boundary
 */
export function truncateToSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  const truncated = text.slice(0, maxChars);
  const lastPeriod = Math.max(
    truncated.lastIndexOf('。'),
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('?'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('\n')
  );

  if (lastPeriod > maxChars * 0.5) {
    return truncated.slice(0, lastPeriod + 1);
  }
  return truncated.trim() + '...';
}

/**
 * Extract assistant text content from session JSONL file.
 * Skips tool_call content, only extracts role: "assistant" text messages.
 */
export async function extractAssistantContent(
  filePath: string,
  maxChars: number = 1000
): Promise<string> {
  const lines = readFileLineByLine(filePath);
  const contents: string[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.type !== 'message') continue;
    if (entry.message?.role !== 'assistant') continue;

    // Extract text content only, skip tool_call
    const content = entry.message.content;
    if (typeof content === 'string') {
      contents.push(content);
    } else if (Array.isArray(content)) {
      const text = content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');
      if (text) contents.push(text);
    }
  }

  const full = contents.join('\n\n');
  return truncateToSentence(full, maxChars);
}
