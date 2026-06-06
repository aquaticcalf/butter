import type { Lock, QueueEntry, StateAdapter } from "chat"

export function createMemoryState(): StateAdapter {
  const locks = new Map<string, Lock>()
  const kv = new Map<string, unknown>()
  const lists = new Map<string, unknown[]>()
  const subscriptions = new Set<string>()

  return {
    async connect() {},
    async disconnect() {},

    async acquireLock(threadId: string, ttlMs: number) {
      const existing = locks.get(threadId)
      if (existing && existing.expiresAt > Date.now()) return null
      const lock: Lock = {
        threadId,
        token: crypto.randomUUID(),
        expiresAt: Date.now() + ttlMs,
      }
      locks.set(threadId, lock)
      return lock
    },

    async extendLock(lock: Lock, ttlMs: number) {
      const existing = locks.get(lock.threadId)
      if (!existing || existing.token !== lock.token) return false
      existing.expiresAt = Date.now() + ttlMs
      return true
    },

    async releaseLock(lock: Lock) {
      const existing = locks.get(lock.threadId)
      if (existing?.token === lock.token) {
        locks.delete(lock.threadId)
      }
    },

    async forceReleaseLock(threadId: string) {
      locks.delete(threadId)
    },

    async set(key: string, value: unknown) {
      kv.set(key, value)
    },

    async get<T>(key: string) {
      return (kv.get(key) ?? null) as T | null
    },

    async delete(key: string) {
      kv.delete(key)
    },

    async setIfNotExists(key: string, value: unknown) {
      if (kv.has(key)) return false
      kv.set(key, value)
      return true
    },

    async appendToList(
      key: string,
      value: unknown,
      options?: { maxLength?: number; ttlMs?: number },
    ) {
      let list = lists.get(key) ?? []
      list.push(value)
      if (options?.maxLength && list.length > options.maxLength) {
        list = list.slice(-options.maxLength)
      }
      lists.set(key, list)
    },

    async getList<T>(key: string) {
      return (lists.get(key) ?? []) as T[]
    },

    async enqueue(threadId: string, entry: QueueEntry, maxSize: number) {
      const key = `queue:${threadId}`
      let queue = lists.get(key) ?? []
      queue.push(entry)
      if (queue.length > maxSize) queue = queue.slice(-maxSize)
      lists.set(key, queue)
      return queue.length
    },

    async dequeue(threadId: string) {
      const key = `queue:${threadId}`
      const queue = lists.get(key) ?? []
      if (queue.length === 0) return null
      const entry = queue.shift()!
      if (queue.length === 0) lists.delete(key)
      else lists.set(key, queue)
      return entry as QueueEntry
    },

    async queueDepth(threadId: string) {
      const key = `queue:${threadId}`
      return (lists.get(key) ?? []).length
    },

    async subscribe(threadId: string) {
      subscriptions.add(threadId)
    },

    async unsubscribe(threadId: string) {
      subscriptions.delete(threadId)
    },

    async isSubscribed(threadId: string) {
      return subscriptions.has(threadId)
    },
  }
}
