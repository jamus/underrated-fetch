import type { CacheStore, CacheEntry, MemoryStoreOptions } from './types.js';
import { createMemoryStore } from './memory-store.js';

/**
 * Check if a cache entry has expired.
 * Uses Date.now() for maximum platform compatibility.
 */
export function isExpired<T>(entry: CacheEntry<T>): boolean {
  return Date.now() > entry.expiresAt;
}

/**
 * Create a cache entry with time to live.
 */
export function createEntry<T>(value: T, timeToLive: number): CacheEntry<T> {
  const now = Date.now();
  return {
    value,
    createdAt: now,
    expiresAt: now + timeToLive,
  };
}

/**
 * Validates that a timeToLive value is a positive finite number.
 * @throws {Error} If the value is invalid
 */
function validateTimeToLive(value: number, context = 'timeToLive'): void {
  if (typeof value !== 'number' || value <= 0 || !Number.isFinite(value)) {
    throw new Error(`${context} must be a positive finite number`);
  }
}

/**
 * Options for createCachedFetch().
 * 
 * @template T - The type of the JSON response data (defaults to `unknown`)
 */
export interface CachedFetchOptions<T = unknown> {
  /** Default time to live in milliseconds */
  timeToLive: number;

  /** Custom cache store. Defaults to in-memory Map */
  store?: CacheStore<T>;

  /** Options for the default memory store (ignored if store is provided) */
  memoryStoreOptions?: MemoryStoreOptions<T>;

  /** Determine if a response should be cached (receives parsed JSON) */
  shouldCache?: (data: T) => boolean;

  /** Called on cache hit */
  onHitCallback?: (key: string) => void;

  /** Called on cache miss */
  onMissCallback?: (key: string) => void;
}

/**
 * Per-request options for cachedFetch.
 * Extends the standard fetch RequestInit options with an optional timeToLive override.
 */
export interface FetchOptions extends RequestInit {
  /** Override the default TTL for this request (in milliseconds) */
  timeToLive?: number;
}

/**
 * Creates a cached fetch function that automatically caches responses by URL path.
 * 
 * @template T - The type of the JSON response data (defaults to `unknown`)
 * @param options - Configuration options for the cached fetch
 * @returns A fetch-like function that returns the parsed JSON response of type T
 * 
 * @example
 * ```typescript
 * const cachedFetch = createCachedFetch({ timeToLive: 60_000 });
 *
 * // Use like regular fetch - key is auto-generated from URL path
 * const data = await cachedFetch('https://api.example.com/launch/abc-123');
 * // Cache key: '/launch/abc-123'
 *
 * // Override TTL for a specific request
 * const fresh = await cachedFetch('https://api.example.com/upcoming', { timeToLive: 10_000 });
 * ```
 */
export function createCachedFetch<T = unknown>(
  options: CachedFetchOptions<T>
): (url: string, init?: FetchOptions) => Promise<T> {
  const {
    timeToLive: defaultTimeToLive,
    store: providedStore,
    memoryStoreOptions,
    shouldCache,
    onHitCallback,
    onMissCallback,
  } = options;

  validateTimeToLive(defaultTimeToLive);

  const store: CacheStore<T> = providedStore ?? createMemoryStore<T>(memoryStoreOptions);

  // Map to track in-flight requests for deduplication
  const inFlightRequests = new Map<string, Promise<T>>();

  /**
   * Generate cache key from URL.
   * Uses pathname + search params (excludes domain).
   */
  function generateKey(url: string): string {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  }

  /**
   * Parse JSON response with error handling for non-JSON responses.
   */
  async function parseJSON(response: Response): Promise<T> {
    try {
      return await response.json() as T;
    } catch (error) {
      const contentType = response.headers.get('content-type') || 'unknown';
      throw new Error(
        `Failed to parse JSON response. Content-Type: ${contentType}. ` +
        `This package only supports JSON responses. ` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get a valid (non-expired) cache entry.
   */
  async function getValidEntry(key: string): Promise<CacheEntry<T> | undefined> {
    const entry = await store.get(key);
    if (!entry) return undefined;
    if (isExpired(entry)) {
      await store.delete(key);
      return undefined;
    }
    return entry;
  }

  /**
   * The cached fetch function.
   */
  async function cachedFetch(url: string, init?: FetchOptions): Promise<T> {
    // Extract timeToLive from init, use default if not provided
    const { timeToLive: requestTimeToLive, ...fetchInit } = init ?? {};
    const timeToLive = requestTimeToLive ?? defaultTimeToLive;

    // Validate per-request TTL if provided
    if (requestTimeToLive !== undefined) {
      validateTimeToLive(requestTimeToLive);
    }

    // Only cache GET requests
    const method = fetchInit.method?.toUpperCase() ?? 'GET';
    if (method !== 'GET') {
      const response = await fetch(url, fetchInit);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return parseJSON(response);
    }

    const key = generateKey(url);

    // Check cache
    const entry = await getValidEntry(key);
    if (entry) {
      if (onHitCallback) {
        onHitCallback(key);
      }
      return entry.value;
    }

    // Check if there's already an in-flight request for this key
    const inFlightPromise = inFlightRequests.get(key);
    if (inFlightPromise) {
      return inFlightPromise;
    }

    // Cache miss - create new fetch request
    if (onMissCallback) {
      onMissCallback(key);
    }

    // Create the fetch promise and store it in the in-flight map
    const fetchPromise = (async (): Promise<T> => {
      try {
        const response = await fetch(url, fetchInit);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await parseJSON(response);

        // Check if result should be cached
        const shouldCacheResult = shouldCache ? shouldCache(data) : true;
        if (shouldCacheResult) {
          await store.set(key, createEntry(data, timeToLive));
        }

        return data;
      } finally {
        // Clean up in-flight map entry after completion (success or failure)
        inFlightRequests.delete(key);
      }
    })();

    // Store the promise in the in-flight map
    inFlightRequests.set(key, fetchPromise);

    return fetchPromise;
  }

  return cachedFetch;
}

