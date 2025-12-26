import type { CacheStore, CacheEntry, MemoryStoreOptions } from '../types.js';

/**
 * Creates an in-memory cache store with LRU eviction.
 */
export function createMemoryStore<T>(
  options: MemoryStoreOptions<T> = {}
): CacheStore<T> {
  const { maxSize, onEvictCallback } = options;

  if (maxSize !== undefined && (typeof maxSize !== 'number' || maxSize <= 0 || !Number.isInteger(maxSize))) {
    throw new Error('maxSize must be a positive integer');
  }

  const effectiveMaxSize = maxSize ?? 1000; // Default max size

  const cache = new Map<string, CacheEntry<T>>();
  const accessOrder: string[] = []; // For LRU tracking

  function updateAccessOrder(key: string): void {
    const index = accessOrder.indexOf(key);
    if (index > -1) {
      accessOrder.splice(index, 1);
    }
    accessOrder.push(key);
  }

  function evictLeastRecentlyUsed(): void {
    if (accessOrder.length === 0) return;
    
    const lruKey = accessOrder.shift()!;
    const evictedEntry = cache.get(lruKey);
    cache.delete(lruKey);
    
    if (evictedEntry && onEvictCallback) {
      onEvictCallback(lruKey, evictedEntry);
    }
  }

  return {
    async get(key: string): Promise<CacheEntry<T> | undefined> {
      const entry = cache.get(key);
      if (entry) {
        updateAccessOrder(key);
      }
      return entry;
    },

    async set(key: string, entry: CacheEntry<T>): Promise<void> {
      // If key already exists, just update
      if (cache.has(key)) {
        cache.set(key, entry);
        updateAccessOrder(key);
        return;
      }

      // Evict if at capacity
      while (cache.size >= effectiveMaxSize) {
        evictLeastRecentlyUsed();
      }

      cache.set(key, entry);
      updateAccessOrder(key);
    },

    async delete(key: string): Promise<void> {
      cache.delete(key);
      const index = accessOrder.indexOf(key);
      if (index > -1) {
        accessOrder.splice(index, 1);
      }
    },

    async clear(): Promise<void> {
      cache.clear();
      accessOrder.length = 0;
    },

    async has(key: string): Promise<boolean> {
      return cache.has(key);
    },
  };
}

