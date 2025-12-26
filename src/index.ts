// Main API
export { createCachedFetch } from './underrated-fetch.js';

// Stores
export { createMemoryStore } from './memory-store.js';

// Types (re-export for consumers)
export type {
  CacheEntry,
  CacheStore,
  MemoryStoreOptions,
} from './types.js';

export type { CachedFetchOptions, FetchOptions } from './underrated-fetch.js';

// Utilities (for custom store implementations)
export { isExpired, createEntry } from './underrated-fetch.js';
