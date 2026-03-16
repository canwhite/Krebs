import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test, { type TestContext } from "node:test";

import {
  findChromeExecutable,
  findExistingChromeDebugPort,
  getFreePort,
  resolveSharedChromeProfileDir,
  waitForChromeDebugPort,
} from "./index.ts";

function useEnv(
  t: TestContext,
  values: Record<string, string | null>,
): void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  t.after(() => {
    for (const [key, value] of previous.entries()) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function startDebugServer(port: number): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    if (req.url === "/json/version") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/demo`,
      }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });

  return server;
}

async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

test("getFreePort honors a fixed environment override and otherwise allocates a TCP port", async (t) => {
  useEnv(t, { TEST_FIXED_PORT: "45678" });
  assert.equal(await getFreePort("TEST_FIXED_PORT"), 45678);

  const dynamicPort = await getFreePort();
  assert.ok(Number.isInteger(dynamicPort));
  assert.ok(dynamicPort > 0);
});

test("findChromeExecutable prefers env overrides and falls back to candidate paths", async (t) => {
  const root = await makeTempDir("baoyu-chrome-bin-");
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const envChrome = path.join(root, "env-chrome");
  const fallbackChrome = path.join(root, "fallback-chrome");
  await fs.writeFile(envChrome, "");
  await fs.writeFile(fallbackChrome, "");

  useEnv(t, { BAOYU_CHROME_PATH: envChrome });
  assert.equal(
    findChromeExecutable({
      envNames: ["BAOYU_CHROME_PATH"],
      candidates: { default: [fallbackChrome] },
    }),
    envChrome,
  );

  useEnv(t, { BAOYU_CHROME_PATH: null });
  assert.equal(
    findChromeExecutable({
      envNames: ["BAOYU_CHROME_PATH"],
      candidates: { default: [fallbackChrome] },
    }),
    fallbackChrome,
  );
});

test("resolveSharedChromeProfileDir supports env overrides, WSL paths, and default suffixes", (t) => {
  useEnv(t, { BAOYU_SHARED_PROFILE: "/tmp/custom-profile" });
  assert.equal(
    resolveSharedChromeProfileDir({
      envNames: ["BAOYU_SHARED_PROFILE"],
      appDataDirName: "demo-app",
      profileDirName: "demo-profile",
    }),
    path.resolve("/tmp/custom-profile"),
  );

  useEnv(t, { BAOYU_SHARED_PROFILE: null });
  assert.equal(
    resolveSharedChromeProfileDir({
      wslWindowsHome: "/mnt/c/Users/demo",
      appDataDirName: "demo-app",
      profileDirName: "demo-profile",
    }),
    path.join("/mnt/c/Users/demo", ".local", "share", "demo-app", "demo-profile"),
  );

  const fallback = resolveSharedChromeProfileDir({
    appDataDirName: "demo-app",
    profileDirName: "demo-profile",
  });
  assert.match(fallback, /demo-app[\\/]demo-profile$/);
});

test("findExistingChromeDebugPort reads DevToolsActivePort and validates it against a live endpoint", async (t) => {
  const root = await makeTempDir("baoyu-cdp-profile-");
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const port = await getFreePort();
  const server = await startDebugServer(port);
  t.after(() => closeServer(server));

  await fs.writeFile(path.join(root, "DevToolsActivePort"), `${port}\n/devtools/browser/demo\n`);

  const found = await findExistingChromeDebugPort({ profileDir: root, timeoutMs: 1000 });
  assert.equal(found, port);
});

test("waitForChromeDebugPort retries until the debug endpoint becomes available", async (t) => {
  const port = await getFreePort();

  const serverPromise = (async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const server = await startDebugServer(port);
    t.after(() => closeServer(server));
  })();

  const websocketUrl = await waitForChromeDebugPort(port, 4000, {
    includeLastError: true,
  });
  await serverPromise;

  assert.equal(websocketUrl, `ws://127.0.0.1:${port}/devtools/browser/demo`);
});
