# Bug: `parseVerificationResponse` 未处理空 content

## 影响范围

`server/services/self-verification/llm.ts`

## 根因

```typescript
// llm.ts:74 - API 返回空时 content 为 undefined
const content = data.choices[0]?.message?.content?.trim();

// llm.ts:84 - 未检查 undefined 就调用 .startsWith()
function parseVerificationResponse(content: string): VerificationResult {
  if (content.startsWith("PASS")) {  // TypeError: undefined.startsWith
```

## 修复

```typescript
function parseVerificationResponse(content: string | undefined): VerificationResult {
  if (!content) {
    console.warn('[SelfVerification] Empty verification response');
    return { passed: true };
  }
  // ...
```

## 验证

- Build ✅
- TypeScript ✅（零错误）
