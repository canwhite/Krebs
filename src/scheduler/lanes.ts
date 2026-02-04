/**
 * Lane 调度系统 - 并发控制
 * 参考 krebs-ds 的设计，实现命令队列和并发控制
 */

import { createLogger } from "../shared/logger.js";

const log = createLogger("Lane");

export enum CommandLane {
  Main = "main",
  Cron = "cron",
  Agent = "agent",
  Nested = "nested",
}

export interface QueueEntry {
  task: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  enqueuedAt: number;
  warnAfterMs: number;
}

export interface LaneState {
  lane: string;
  queue: QueueEntry[];
  active: number;
  maxConcurrent: number;
  draining: boolean;
}

class LaneManager {
  private lanes = new Map<string, LaneState>();

  getLaneState(lane: string): LaneState {
    const existing = this.lanes.get(lane);
    if (existing) return existing;

    const created: LaneState = {
      lane,
      queue: [],
      active: 0,
      maxConcurrent: 1,
      draining: false,
    };
    this.lanes.set(lane, created);
    return created;
  }

  setConcurrency(lane: string, maxConcurrent: number): void {
    const cleaned = lane.trim() || CommandLane.Main;
    const state = this.getLaneState(cleaned);
    state.maxConcurrent = Math.max(1, Math.floor(maxConcurrent));
    this.drainLane(cleaned);
  }

  private drainLane(lane: string): void {
    const state = this.getLaneState(lane);
    if (state.draining) return;
    state.draining = true;

    const pump = () => {
      while (state.active < state.maxConcurrent && state.queue.length > 0) {
        const entry = state.queue.shift() as QueueEntry;
        const waitedMs = Date.now() - entry.enqueuedAt;

        if (waitedMs >= entry.warnAfterMs) {
          log.warn(`[${lane}] Wait exceeded: ${waitedMs}ms, queued: ${state.queue.length}`);
        }

        state.active += 1;
        void (async () => {
          const startTime = Date.now();
          try {
            const result = await entry.task();
            state.active -= 1;
            log.debug(`[${lane}] Task done: ${Date.now() - startTime}ms, active: ${state.active}, queued: ${state.queue.length}`);
            pump();
            entry.resolve(result);
          } catch (err) {
            state.active -= 1;
            log.error(`[${lane}] Task error: ${Date.now() - startTime}ms, error: ${String(err)}`);
            pump();
            entry.reject(err);
          }
        })();
      }
      state.draining = false;
    };

    pump();
  }

  enqueue<T>(
    lane: string,
    task: () => Promise<T>,
    opts?: {
      warnAfterMs?: number;
    },
  ): Promise<T> {
    const cleaned = lane.trim() || CommandLane.Main;
    const warnAfterMs = opts?.warnAfterMs ?? 2000;
    const state = this.getLaneState(cleaned);

    return new Promise<T>((resolve, reject) => {
      state.queue.push({
        task: () => task(),
        resolve: (value) => resolve(value as T),
        reject,
        enqueuedAt: Date.now(),
        warnAfterMs,
      });
      log.debug(`[${cleaned}] Enqueued: ${state.queue.length + state.active}`);
      this.drainLane(cleaned);
    });
  }

  getQueueSize(lane: string = CommandLane.Main): number {
    const resolved = lane.trim() || CommandLane.Main;
    const state = this.lanes.get(resolved);
    if (!state) return 0;
    return state.queue.length + state.active;
  }

  clearLane(lane: string = CommandLane.Main): number {
    const cleaned = lane.trim() || CommandLane.Main;
    const state = this.lanes.get(cleaned);
    if (!state) return 0;
    const removed = state.queue.length;
    state.queue.length = 0;
    return removed;
  }
}

// 单例
export const laneManager = new LaneManager();

// 便捷函数
export function enqueueInLane<T>(
  lane: string,
  task: () => Promise<T>,
  opts?: {
    warnAfterMs?: number;
  },
): Promise<T> {
  return laneManager.enqueue(lane, task, opts);
}

export function enqueue<T>(
  task: () => Promise<T>,
  opts?: {
    warnAfterMs?: number;
  },
): Promise<T> {
  return enqueueInLane(CommandLane.Main, task, opts);
}

export function setConcurrency(lane: string, maxConcurrent: number): void {
  laneManager.setConcurrency(lane, maxConcurrent);
}

export function getQueueSize(lane?: string): number {
  return laneManager.getQueueSize(lane);
}
