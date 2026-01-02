# 🐶 underrated-fetch

![CI](https://github.com/jamus/orbitq-app/actions/workflows/ci.yml/badge.svg)


Simple caching for outbound requests to avoiding hitting rate limits on REST APIs.
**JSON responses only**

## Scope

For APIs that have rate limits, redundant requests waste quota and add latency.

`underrated-fetch` caches API responses with configurable TTL (Time to Live), reducing redundant outbound calls.

> ☝️ This is an in-process cache — it does not share state across multiple servers or client apps. Designed run this on a centralised gateway that all clients call.


## Installation

```bash
npm install underrated-fetch
```

## Quick Start

```typescript
import { createCachedFetch } from 'underrated-fetch';

const cachedFetch = createCachedFetch({ timeToLive: 60_000 });

// Use like regular fetch — cache key is auto-generated from URL
const user = await cachedFetch('https://api.example.com/users/123');
const same = await cachedFetch('https://api.example.com/users/123'); // Cache hit
```

Cache keys are automatically derived from the URL path:
- `https://api.example.com/users/123` → `/users/123`
- `https://api.example.com/search?q=test` → `/search?q=test`

## API

### `createCachedFetch<T>(options): CachedFetch`

```typescript
import { createCachedFetch } from 'underrated-fetch';

const cachedFetch = createCachedFetch({
  timeToLive: 60_000,                    // Required: default TTL in milliseconds
  store: customStore,                    // Optional: custom cache store
  memoryStoreOptions: { maxSize: 5000 }, // Optional: configure default memory store (ignored if store is provided)
  shouldCache: (data) => true,           // Optional: validate before caching
  onHitCallback: (key) => {},            // Optional: called on cache hit
  onMissCallback: (key) => {},           // Optional: called on cache miss
});

// Default TTL
const data = await cachedFetch('https://api.example.com/data');

// Override TTL per request
const fresh = await cachedFetch('https://api.example.com/live', { timeToLive: 5_000 });
```

### `CacheStore<T>` Interface

Implement this interface for custom storage backends (Redis, databases, etc.):

```typescript
interface CacheStore<T> {
  get(key: string): Promise<CacheEntry<T> | undefined>;
  set(key: string, entry: CacheEntry<T>): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
}
```

### `createMemoryStore<T>(options?): CacheStore<T>`

Built-in in-memory store with LRU (Least Recently Used) eviction. Defaults to `maxSize: 1000` if not specified:

```typescript
import { createMemoryStore } from 'underrated-fetch';

const store = createMemoryStore({
  maxSize: 1000,  // Maximum entries before LRU eviction (default: 1000)
  onEvictCallback: (key, entry) => console.log(`Evicted: ${key}`),
});
```

**Note:** When using `createCachedFetch`, you can configure the memory store via `memoryStoreOptions` instead of creating a store manually.

## Examples

### Per-request TTL

```typescript
const cachedFetch = createCachedFetch({ timeToLive: 5 * 60_000 }); // Default 5 min

await cachedFetch('https://api.example.com/launch/123');                    // 5 min
await cachedFetch('https://api.example.com/upcoming', { timeToLive: 10_000 }); // 10 sec
```

### Conditional caching

```typescript
const cachedFetch = createCachedFetch({
  timeToLive: 60_000,
  shouldCache: (data) => data.status === 'success',
});
```

### Observability

```typescript
const cachedFetch = createCachedFetch({
  timeToLive: 60_000,
  onHitCallback: (key) => metrics.increment('cache.hit'),
  onMissCallback: (key) => metrics.increment('cache.miss'),
});
```

### Configure memory store

Configure the default in-memory store without creating a custom store:

```typescript
const cachedFetch = createCachedFetch({
  timeToLive: 60_000,
  memoryStoreOptions: {
    maxSize: 5000,  // Override default maxSize (default: 1000)
    onEvictCallback: (key, entry) => {
      console.log(`Evicted: ${key}`);
    },
  },
});
```

### Custom store

Implement the `CacheStore<T>` interface for custom storage backends:

```typescript
import type { CacheStore, CacheEntry } from 'underrated-fetch';

const myStore: CacheStore<MyData> = {
  async get(key: string): Promise<CacheEntry<MyData> | undefined> {
    // Your implementation (Redis, database, etc.)
  },
  async set(key: string, entry: CacheEntry<MyData>): Promise<void> {
    // Your implementation
  },
  async delete(key: string): Promise<void> {
    // Your implementation
  },
  async clear(): Promise<void> {
    // Your implementation
  },
  async has(key: string): Promise<boolean> {
    // Your implementation
  },
};

const cachedFetch = createCachedFetch({
  timeToLive: 60_000,
  store: myStore,
});
```

See [`examples/redis-store.ts`](./examples/redis-store.ts) for a more complete Redis implementation.

## Security

⚠️ **Cached data is not encrypted.** Do not cache:
- Authentication tokens or API keys
- Passwords or credentials  
- Personally identifiable information (PII)

| Risk | Mitigation |
|------|------------|
| Memory exhaustion | Set `maxSize` on memory stores |
| Cache poisoning | Validate with `shouldCache` |

## Requirements

- Node.js 18+
- ES2020+ environment

## Credits

Inspired by [The Space Devs API](https://thespacedevs.com/) (Launch Library). Thank you for providing a great free API for space launch data.

## Licence

MIT
