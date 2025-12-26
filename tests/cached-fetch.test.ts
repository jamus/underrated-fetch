import { describe, it, mock } from 'node:test';
import * as assert from 'node:assert';
import { createCachedFetch } from '../src/underrated-fetch.js';
import { createMemoryStore } from '../src/memory-store.js';

// Mock fetch globally for tests
const originalFetch = globalThis.fetch;

function mockFetch(responses: Record<string, unknown>) {
  let callCount = 0;
  const calls: string[] = [];

  globalThis.fetch = mock.fn(async (url: string | URL | Request) => {
    const urlString = url.toString();
    calls.push(urlString);
    callCount++;

    const pathname = new URL(urlString).pathname;
    const data = responses[pathname] ?? { error: 'not found' };

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => data,
    } as unknown as Response;
  }) as typeof fetch;

  return {
    getCallCount: () => callCount,
    getCalls: () => calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

describe('createCachedFetch', () => {
  describe('basic caching', () => {
    it('should cache GET requests by URL path', async () => {
      const mockData = { id: '123', name: 'Test Launch' };
      const fetchMock = mockFetch({ '/launch/123': mockData });

      try {
        const cachedFetch = createCachedFetch({ timeToLive: 60_000 });

        const result1 = await cachedFetch('https://api.example.com/launch/123');
        const result2 = await cachedFetch('https://api.example.com/launch/123');

        assert.deepStrictEqual(result1, mockData);
        assert.deepStrictEqual(result2, mockData);
        assert.strictEqual(fetchMock.getCallCount(), 1); // Only one fetch
      } finally {
        fetchMock.restore();
      }
    });

    it('should use different cache entries for different URLs', async () => {
      const fetchMock = mockFetch({
        '/launch/1': { id: '1' },
        '/launch/2': { id: '2' },
      });

      try {
        const cachedFetch = createCachedFetch({ timeToLive: 60_000 });

        await cachedFetch('https://api.example.com/launch/1');
        await cachedFetch('https://api.example.com/launch/2');
        await cachedFetch('https://api.example.com/launch/1');

        assert.strictEqual(fetchMock.getCallCount(), 2);
      } finally {
        fetchMock.restore();
      }
    });

    it('should include query params in cache key', async () => {
      const fetchMock = mockFetch({
        '/search': { results: ['a', 'b'] },
      });

      try {
        const cachedFetch = createCachedFetch({ timeToLive: 60_000 });

        await cachedFetch('https://api.example.com/search?q=rocket');
        await cachedFetch('https://api.example.com/search?q=satellite');
        await cachedFetch('https://api.example.com/search?q=rocket');

        assert.strictEqual(fetchMock.getCallCount(), 2);
      } finally {
        fetchMock.restore();
      }
    });
  });

  describe('cache key generation', () => {
    it('should generate key from pathname', async () => {
      const keys: string[] = [];
      const fetchMock = mockFetch({ '/launch/abc': { id: 'abc' } });

      try {
        const cachedFetch = createCachedFetch({
          timeToLive: 60_000,
          onMissCallback: (key) => keys.push(key),
        });

        await cachedFetch('https://api.example.com/launch/abc');

        assert.strictEqual(keys[0], '/launch/abc');
      } finally {
        fetchMock.restore();
      }
    });

    it('should include search params in key', async () => {
      const keys: string[] = [];
      const fetchMock = mockFetch({ '/search': { results: [] } });

      try {
        const cachedFetch = createCachedFetch({
          timeToLive: 60_000,
          onMissCallback: (key) => keys.push(key),
        });

        await cachedFetch('https://api.example.com/search?q=test&page=1');

        assert.strictEqual(keys[0], '/search?q=test&page=1');
      } finally {
        fetchMock.restore();
      }
    });
  });

  describe('TTL expiration', () => {
    it('should fetch fresh data after expiration', async () => {
      const fetchMock = mockFetch({ '/data': { value: 'test' } });

      try {
        const cachedFetch = createCachedFetch({ timeToLive: 50 });

        await cachedFetch('https://api.example.com/data');
        assert.strictEqual(fetchMock.getCallCount(), 1);

        await new Promise(resolve => setTimeout(resolve, 70));

        await cachedFetch('https://api.example.com/data');
        assert.strictEqual(fetchMock.getCallCount(), 2);
      } finally {
        fetchMock.restore();
      }
    });
  });

  describe('shouldCache option', () => {
    it('should only cache results that pass shouldCache', async () => {
      let callNum = 0;
      globalThis.fetch = mock.fn(async () => {
        callNum++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: callNum > 1, data: callNum }),
        } as unknown as Response;
      }) as typeof fetch;

      try {
        const cachedFetch = createCachedFetch<{ success: boolean; data: number }>({
          timeToLive: 60_000,
          shouldCache: (result) => result.success,
        });

        const r1 = await cachedFetch('https://api.example.com/data');
        const r2 = await cachedFetch('https://api.example.com/data');
        const r3 = await cachedFetch('https://api.example.com/data');

        assert.strictEqual(r1.success, false);
        assert.strictEqual(r2.success, true);
        assert.strictEqual(r3.success, true);
        assert.strictEqual(r3.data, 2); // Cached from r2
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('callbacks', () => {
    it('should call onHitCallback on cache hit', async () => {
      const hits: string[] = [];
      const fetchMock = mockFetch({ '/data': { value: 'test' } });

      try {
        const cachedFetch = createCachedFetch({
          timeToLive: 60_000,
          onHitCallback: (key) => hits.push(key),
        });

        await cachedFetch('https://api.example.com/data');
        await cachedFetch('https://api.example.com/data');
        await cachedFetch('https://api.example.com/data');

        assert.strictEqual(hits.length, 2);
        assert.strictEqual(hits[0], '/data');
      } finally {
        fetchMock.restore();
      }
    });

    it('should call onMissCallback on cache miss', async () => {
      const misses: string[] = [];
      const fetchMock = mockFetch({
        '/a': { id: 'a' },
        '/b': { id: 'b' },
      });

      try {
        const cachedFetch = createCachedFetch({
          timeToLive: 60_000,
          onMissCallback: (key) => misses.push(key),
        });

        await cachedFetch('https://api.example.com/a');
        await cachedFetch('https://api.example.com/b');
        await cachedFetch('https://api.example.com/a');

        assert.deepStrictEqual(misses, ['/a', '/b']);
      } finally {
        fetchMock.restore();
      }
    });
  });

  describe('custom store', () => {
    it('should use provided custom store', async () => {
      const store = createMemoryStore<{ id: string }>({ maxSize: 1 });
      const fetchMock = mockFetch({
        '/a': { id: 'a' },
        '/b': { id: 'b' },
      });

      try {
        const cachedFetch = createCachedFetch({
          timeToLive: 60_000,
          store,
        });

        await cachedFetch('https://api.example.com/a');
        await cachedFetch('https://api.example.com/b'); // Evicts /a

        // /a should be fetched again
        await cachedFetch('https://api.example.com/a');

        assert.strictEqual(fetchMock.getCallCount(), 3);
      } finally {
        fetchMock.restore();
      }
    });
  });

  describe('validation', () => {
    it('should throw for invalid timeToLive', () => {
      assert.throws(
        () => createCachedFetch({ timeToLive: 0 }),
        { message: 'timeToLive must be a positive finite number' }
      );

      assert.throws(
        () => createCachedFetch({ timeToLive: -1 }),
        { message: 'timeToLive must be a positive finite number' }
      );

      assert.throws(
        () => createCachedFetch({ timeToLive: Infinity }),
        { message: 'timeToLive must be a positive finite number' }
      );
    });
  });

  describe('per-request timeToLive override', () => {
    it('should use per-request TTL when provided', async () => {
      const fetchMock = mockFetch({ '/data': { value: 'test' } });

      try {
        const cachedFetch = createCachedFetch({ timeToLive: 60_000 }); // Default 60s

        // First request with short TTL
        await cachedFetch('https://api.example.com/data', { timeToLive: 50 });
        assert.strictEqual(fetchMock.getCallCount(), 1);

        // Should still be cached
        await cachedFetch('https://api.example.com/data');
        assert.strictEqual(fetchMock.getCallCount(), 1);

        // Wait for short TTL to expire
        await new Promise(resolve => setTimeout(resolve, 70));

        // Should fetch again (short TTL expired)
        await cachedFetch('https://api.example.com/data');
        assert.strictEqual(fetchMock.getCallCount(), 2);
      } finally {
        fetchMock.restore();
      }
    });

    it('should use default TTL when per-request TTL not provided', async () => {
      const fetchMock = mockFetch({ '/data': { value: 'test' } });

      try {
        const cachedFetch = createCachedFetch({ timeToLive: 100 });

        await cachedFetch('https://api.example.com/data');
        assert.strictEqual(fetchMock.getCallCount(), 1);

        // Wait less than default TTL
        await new Promise(resolve => setTimeout(resolve, 50));

        // Should still be cached
        await cachedFetch('https://api.example.com/data');
        assert.strictEqual(fetchMock.getCallCount(), 1);
      } finally {
        fetchMock.restore();
      }
    });

    it('should throw for invalid per-request TTL', async () => {
      const fetchMock = mockFetch({ '/data': { value: 'test' } });

      try {
        const cachedFetch = createCachedFetch({ timeToLive: 60_000 });

        await assert.rejects(
          cachedFetch('https://api.example.com/data', { timeToLive: -1 }),
          { message: 'timeToLive must be a positive finite number' }
        );
      } finally {
        fetchMock.restore();
      }
    });
  });

  describe('non-JSON response handling', () => {
    it('should throw helpful error for text responses', async () => {
      globalThis.fetch = mock.fn(async () => {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'content-type': 'text/plain' }),
          json: async () => {
            throw new Error('Unexpected token');
          },
        } as unknown as Response;
      }) as typeof fetch;

      try {
        const cachedFetch = createCachedFetch({ timeToLive: 60_000 });

        await assert.rejects(
          cachedFetch('https://api.example.com/text'),
          (error: Error) => {
            assert.ok(error.message.includes('Failed to parse JSON response'));
            assert.ok(error.message.includes('Content-Type: text/plain'));
            assert.ok(error.message.includes('only supports JSON responses'));
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should throw helpful error for HTML responses', async () => {
      globalThis.fetch = mock.fn(async () => {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'content-type': 'text/html' }),
          json: async () => {
            throw new Error('Unexpected token');
          },
        } as unknown as Response;
      }) as typeof fetch;

      try {
        const cachedFetch = createCachedFetch({ timeToLive: 60_000 });

        await assert.rejects(
          cachedFetch('https://api.example.com/page'),
          (error: Error) => {
            assert.ok(error.message.includes('Failed to parse JSON response'));
            assert.ok(error.message.includes('Content-Type: text/html'));
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should throw helpful error for non-GET requests with non-JSON', async () => {
      globalThis.fetch = mock.fn(async () => {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'content-type': 'text/xml' }),
          json: async () => {
            throw new Error('Unexpected token');
          },
        } as unknown as Response;
      }) as typeof fetch;

      try {
        const cachedFetch = createCachedFetch({ timeToLive: 60_000 });

        await assert.rejects(
          cachedFetch('https://api.example.com/data', { method: 'POST' }),
          (error: Error) => {
            assert.ok(error.message.includes('Failed to parse JSON response'));
            assert.ok(error.message.includes('Content-Type: text/xml'));
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should handle missing content-type header', async () => {
      globalThis.fetch = mock.fn(async () => {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          json: async () => {
            throw new Error('Unexpected token');
          },
        } as unknown as Response;
      }) as typeof fetch;

      try {
        const cachedFetch = createCachedFetch({ timeToLive: 60_000 });

        await assert.rejects(
          cachedFetch('https://api.example.com/data'),
          (error: Error) => {
            assert.ok(error.message.includes('Content-Type: unknown'));
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

