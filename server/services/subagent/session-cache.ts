/**
 * Session/Extension 缓存
 * 避免每次 spawn 都执行 full loader.reload()
 */

import type { CachedExtensions } from "./types.js";

export class ExtensionCache {
  private cache = new Map<string, CachedExtensions>();
  private TTL = 60_000; // 1分钟缓存

  async getOrReload(
    cwd: string,
    loader: { reload(): Promise<any> },
    force?: boolean
  ): Promise<CachedExtensions["data"]> {
    const cached = this.cache.get(cwd);
    if (cached && !force && Date.now() - cached.timestamp < this.TTL) {
      return cached.data;
    }
    // 重新加载
    const data = await loader.reload();
    this.cache.set(cwd, { data, timestamp: Date.now() });
    return data;
  }

  clear(): void {
    this.cache.clear();
  }
}
