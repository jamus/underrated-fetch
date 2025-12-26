import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createMemoryStore } from '../src/memory-store.js';
import type { CacheEntry } from '../src/types.js';

function makeEntry<T>(value: T, timeToLiveMs: number = 60000): CacheEntry<T> {
  const now = Date.now();
  return {
    value,
    createdAt: now,
    expiresAt: now + timeToLiveMs,
  };
}

describe('createMemoryStore', () => {
  describe('basic operations', () => {
    it('should store and retrieve entries', async () => {
      const store = createMemoryStore<string>();
      const entry = makeEntry('hello');

      await store.set('key1', entry);
      const retrieved = await store.get('key1');

      assert.deepStrictEqual(retrieved, entry);
    });

    it('should return undefined for missing keys', async () => {
      const store = createMemoryStore<string>();
      assert.strictEqual(await store.get('nonexistent'), undefined);
    });

    it('should correctly report has()', async () => {
      const store = createMemoryStore<string>();

      assert.strictEqual(await store.has('key1'), false);

      await store.set('key1', makeEntry('value'));
      assert.strictEqual(await store.has('key1'), true);
    });

    it('should delete only the specified entry', async () => {
      const store = createMemoryStore<string>();
      await store.set('key1', makeEntry('value1'));
      await store.set('key2', makeEntry('value2'));
      await store.set('key3', makeEntry('value3'));

      await store.delete('key2');

      assert.strictEqual(await store.has('key1'), true);
      assert.strictEqual(await store.has('key2'), false);
      assert.strictEqual(await store.has('key3'), true);
      assert.strictEqual(await store.get('key2'), undefined);
    });

    it('should clear all entries', async () => {
      const store = createMemoryStore<string>();
      await store.set('key1', makeEntry('value1'));
      await store.set('key2', makeEntry('value2'));
      await store.set('key3', makeEntry('value3'));

      await store.clear();

      assert.strictEqual(await store.has('key1'), false);
      assert.strictEqual(await store.has('key2'), false);
      assert.strictEqual(await store.has('key3'), false);
    });

    it('should handle deleting non-existent keys gracefully', async () => {
      const store = createMemoryStore<string>();
      // Should not throw
      await store.delete('nonexistent');
    });
  });

  describe('LRU eviction with maxSize', () => {
    it('should evict oldest entry when maxSize is exceeded', async () => {
      const store = createMemoryStore<string>({ maxSize: 2 });

      await store.set('key1', makeEntry('value1'));
      await store.set('key2', makeEntry('value2'));
      await store.set('key3', makeEntry('value3')); // Should evict key1

      assert.strictEqual(await store.has('key1'), false);
      assert.strictEqual(await store.has('key2'), true);
      assert.strictEqual(await store.has('key3'), true);
    });

    it('should update access order on get()', async () => {
      const store = createMemoryStore<string>({ maxSize: 2 });

      await store.set('key1', makeEntry('value1'));
      await store.set('key2', makeEntry('value2'));

      // Access key1, making it more recent
      await store.get('key1');

      // Add key3 - should evict key2 (now least recently used)
      await store.set('key3', makeEntry('value3'));

      assert.strictEqual(await store.has('key1'), true); // Recently accessed
      assert.strictEqual(await store.has('key2'), false); // Evicted
      assert.strictEqual(await store.has('key3'), true); // Just added
    });

    it('should update access order on set() of existing key', async () => {
      const store = createMemoryStore<string>({ maxSize: 2 });

      await store.set('key1', makeEntry('value1'));
      await store.set('key2', makeEntry('value2'));

      // Update key1, making it most recent
      await store.set('key1', makeEntry('updated1'));

      // Add key3 - should evict key2
      await store.set('key3', makeEntry('value3'));

      assert.strictEqual(await store.has('key1'), true);
      assert.strictEqual(await store.has('key2'), false);
      assert.strictEqual(await store.has('key3'), true);
    });

    it('should call onEvictCallback when evicting', async () => {
      const evicted: Array<{ key: string; entry: CacheEntry<string> }> = [];

      const store = createMemoryStore<string>({
        maxSize: 2,
        onEvictCallback: (key, entry) => evicted.push({ key, entry }),
      });

      const entry1 = makeEntry('value1');
      await store.set('key1', entry1);
      await store.set('key2', makeEntry('value2'));
      await store.set('key3', makeEntry('value3')); // Evicts key1

      assert.strictEqual(evicted.length, 1);
      assert.strictEqual(evicted[0].key, 'key1');
      assert.deepStrictEqual(evicted[0].entry, entry1);
    });

    it('should handle maxSize of 1', async () => {
      const store = createMemoryStore<string>({ maxSize: 1 });

      await store.set('key1', makeEntry('value1'));
      assert.strictEqual(await store.has('key1'), true);

      await store.set('key2', makeEntry('value2'));
      assert.strictEqual(await store.has('key1'), false);
      assert.strictEqual(await store.has('key2'), true);
    });
  });

  describe('without maxSize', () => {
    it('should not limit entries when maxSize is not set', async () => {
      const store = createMemoryStore<string>();

      // Add many entries
      for (let i = 0; i < 100; i++) {
        await store.set(`key${i}`, makeEntry(`value${i}`));
      }

      // All entries should still exist
      for (let i = 0; i < 100; i++) {
        assert.strictEqual(await store.has(`key${i}`), true);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle various value types', async () => {
      const store = createMemoryStore<unknown>();

      await store.set('null', makeEntry(null));
      await store.set('undefined', makeEntry(undefined));
      await store.set('number', makeEntry(42));
      await store.set('object', makeEntry({ nested: { value: true } }));
      await store.set('array', makeEntry([1, 2, 3]));

      assert.strictEqual((await store.get('null'))?.value, null);
      assert.strictEqual((await store.get('undefined'))?.value, undefined);
      assert.strictEqual((await store.get('number'))?.value, 42);
      assert.deepStrictEqual((await store.get('object'))?.value, { nested: { value: true } });
      assert.deepStrictEqual((await store.get('array'))?.value, [1, 2, 3]);
    });

    it('should handle empty string keys', async () => {
      const store = createMemoryStore<string>();
      await store.set('', makeEntry('empty-key-value'));

      assert.strictEqual((await store.get(''))?.value, 'empty-key-value');
      assert.strictEqual(await store.has(''), true);
    });
  });
});

