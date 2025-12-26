import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isExpired, createEntry } from '../src/underrated-fetch.js';

describe('expiration utilities', () => {
  describe('createEntry', () => {
    it('should create an entry with correct timestamps', () => {
      const before = Date.now();
      const entry = createEntry('test-value', 1000);
      const after = Date.now();

      assert.strictEqual(entry.value, 'test-value');
      assert.ok(entry.createdAt >= before && entry.createdAt <= after);
      assert.ok(entry.expiresAt >= before + 1000 && entry.expiresAt <= after + 1000);
      assert.strictEqual(entry.expiresAt - entry.createdAt, 1000);
    });

    it('should work with different value types', () => {
      const objEntry = createEntry({ foo: 'bar' }, 5000);
      assert.deepStrictEqual(objEntry.value, { foo: 'bar' });

      const numEntry = createEntry(42, 5000);
      assert.strictEqual(numEntry.value, 42);

      const nullEntry = createEntry(null, 5000);
      assert.strictEqual(nullEntry.value, null);
    });
  });

  describe('isExpired', () => {
    it('should return false for non-expired entry', () => {
      const entry = createEntry('value', 10000); // 10 seconds
      assert.strictEqual(isExpired(entry), false);
    });

    it('should return true for expired entry', () => {
      const now = Date.now();
      const entry = {
        value: 'old',
        createdAt: now - 2000,
        expiresAt: now - 1000, // Expired 1 second ago
      };
      assert.strictEqual(isExpired(entry), true);
    });

    it('should return true for entry that expires exactly now', async () => {
      const now = Date.now();
      const entry = {
        value: 'edge',
        createdAt: now - 1000,
        expiresAt: now, // Expires exactly now
      };
      // Wait a tiny bit to ensure we're past expiresAt
      await new Promise(resolve => setTimeout(resolve, 1));
      assert.strictEqual(isExpired(entry), true);
    });
  });
});

