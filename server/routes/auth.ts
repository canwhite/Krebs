import { isValidToken, createAuthCookieHeaders } from "../auth.js";
import { corsHeaders } from "./index.js";

async function handleInternalAuth(): Promise<Response> {
  return Response.json(
    { success: true, message: "自动认证成功" },
    { headers: createAuthCookieHeaders(corsHeaders) },
  );
}

async function handleExternalAuth(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { token?: string };
    const providedToken = body.token;

    if (isValidToken(providedToken || null)) {
      return Response.json(
        { success: true, message: "认证成功" },
        { headers: createAuthCookieHeaders(corsHeaders) },
      );
    } else {
      return Response.json(
        { success: false, message: "Token 无效" },
        { status: 401, headers: corsHeaders },
      );
    }
  } catch (e) {
    return Response.json(
      { success: false, message: "请求格式错误" },
      { status: 400, headers: corsHeaders },
    );
  }
}

export { handleInternalAuth, handleExternalAuth };
