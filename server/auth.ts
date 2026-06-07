import { join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";

let API_TOKEN: string;

// 生成或读取 API Token
function getOrGenerateToken(): string {
  const token = process.env.TOKEN;
  if (token && token !== "xxx") {
    console.log(`[AUTH] 使用现有 Token: ${token.substring(0, 8)}...`);
    return token;
  }

  const newToken = (globalThis as any).crypto.randomUUID() as string;
  const envPath = join(process.cwd(), ".env");

  let envContent = "";
  try {
    envContent = readFileSync(envPath, "utf-8");
  } catch (e) {
    // 文件不存在，使用空内容
  }

  const lines = envContent.split("\n");
  let tokenUpdated = false;
  const updatedLines = lines.map((line) => {
    if (line.startsWith("TOKEN=")) {
      tokenUpdated = true;
      return `TOKEN=${newToken}`;
    }
    return line;
  });

  if (!tokenUpdated) {
    updatedLines.push(`TOKEN=${newToken}`);
  }

  writeFileSync(envPath, updatedLines.join("\n"));
  console.log(`[AUTH] 生成新 Token: ${newToken}`);
  console.log(
    `[AUTH] 请使用 POST /api/auth 验证，body: {"token": "${newToken}"}`,
  );

  return newToken;
}

function initToken(): string {
  API_TOKEN = getOrGenerateToken();
  return API_TOKEN;
}

// 从请求中提取 Cookie 中的 token
function extractTokenFromCookie(req: Request): string | null {
  const cookieHeader = req.headers.get("Cookie");
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").map((c: string) => c.trim());
  const tokenCookie = cookies.find((c: string) => c.startsWith("api_token="));

  if (!tokenCookie) return null;

  return tokenCookie.substring("api_token=".length);
}

// 从请求中提取 Authorization Header 中的 token
function extractTokenFromAuthHeader(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  // 支持 "Bearer token" 格式
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1] ?? null;

  // 直接使用 header 值
  return authHeader;
}

// 从请求中提取 token（支持 Cookie 和 Authorization Header）
function extractToken(req: Request): string | null {
  return extractTokenFromCookie(req) || extractTokenFromAuthHeader(req);
}

// 验证 token
function isValidToken(providedToken: string | null): boolean {
  if (!providedToken) return false;
  return providedToken === API_TOKEN;
}

// 设置 Cookie 的响应头
function createAuthCookieHeaders(corsHeaders: Record<string, string>) {
  return {
    "Set-Cookie": `api_token=${API_TOKEN}; HttpOnly; Path=/; SameSite=Lax${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`,
    "Content-Type": "application/json",
    ...corsHeaders,
  };
}

export {
  initToken,
  extractTokenFromCookie,
  extractTokenFromAuthHeader,
  extractToken,
  isValidToken,
  createAuthCookieHeaders,
};
