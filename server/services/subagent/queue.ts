/**
 * 高效队列实现（O(1) 入队出队）
 * 使用 Map + 双向链表实现
 */

import type { AgentRecord } from "./types.js";

export class AgentQueue {
  private byId = new Map<string, AgentRecord>();
  private head: string | null = null;
  private tail: string | null = null;

  enqueue(id: string, record: AgentRecord): void {
    this.byId.set(id, record);
    if (this.tail !== null) {
      const tailRecord = this.byId.get(this.tail);
      if (tailRecord) {
        (tailRecord as any)._next = id;
      }
    }
    (record as any)._next = null;
    if (this.head === null) {
      this.head = id;
    }
    this.tail = id;
  }

  dequeue(): AgentRecord | undefined {
    if (this.head === null) return undefined;
    const id = this.head;
    const record = this.byId.get(id);
    if (record) {
      this.byId.delete(id);
      this.head = (record as any)._next ?? null;
      if (this.head === null) {
        this.tail = null;
      }
    }
    return record;
  }

  remove(id: string): boolean {
    const record = this.byId.get(id);
    if (!record) return false;

    const next = (record as any)._next;
    const prev = (record as any)._prev;

    if (prev !== undefined && prev !== null) {
      const prevRecord = this.byId.get(prev);
      if (prevRecord) {
        (prevRecord as any)._next = next;
      }
    } else {
      this.head = next;
    }

    if (next !== null) {
      const nextRecord = this.byId.get(next);
      if (nextRecord) {
        (nextRecord as any)._prev = prev;
      }
    } else {
      this.tail = prev ?? null;
    }

    this.byId.delete(id);
    return true;
  }

  get(id: string): AgentRecord | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get size(): number {
    return this.byId.size;
  }

  values(): Generator<AgentRecord, void, unknown> {
    return (function* (this: AgentQueue) {
      let current = this.head;
      while (current !== null) {
        const record = this.byId.get(current);
        if (record) yield record;
        current = (record as any)._next ?? null;
      }
    }.call(this));
  }
}
