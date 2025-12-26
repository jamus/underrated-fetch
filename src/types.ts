/**
 * A cached entry stored in the cache store.
 */
export interface CacheEntry<T> {
  /** The cached value */
  value: T;
  /** Unix timestamp (ms) when entry was created */
  createdAt: number;
  /** Unix timestamp (ms) when entry expires */
  expiresAt: number;
}

/**
 * Cache storage interface.
 * Implement this to provide custom storage backends (Redis, databases, etc.).
 */
export interface CacheStore<T> {
  /** Retrieve an entry by key (returns undefined if not found) */
  get(key: string): Promise<CacheEntry<T> | undefined>;
  /** Store an entry */
  set(key: string, entry: CacheEntry<T>): Promise<void>;
  /** Remove an entry by key */
  delete(key: string): Promise<void>;
  /** Remove all entries */
  clear(): Promise<void>;
  /** Check if key exists (does not check expiration) */
  has(key: string): Promise<boolean>;
}

/**
 * Options for the in-memory store.
 */
export interface MemoryStoreOptions<T> {
  /** Maximum number of entries (LRU eviction when exceeded) */
  maxSize?: number;

  /** Called when an entry is evicted */
  onEvictCallback?: (key: string, entry: CacheEntry<T>) => void;
}
