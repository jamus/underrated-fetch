/// <reference types="node" />
/**
 * Example: Express server with Redis-backed caching using createCachedFetch.
 *
 * This example shows how to use createCachedFetch with a Redis store
 * for a minimal Express server — ideal as a gateway for mobile apps.
 *
 * Setup:
 * 1. npm install express redis dotenv
 * 2. Copy examples/.env.example to examples/.env and add your Redis connection string
 * 3. npx tsx examples/redis-store.ts
 * 4. Visit http://localhost:3000/launch/2baf1b13-6159-4640-864d-7959f9bfe978
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '.env') });

import express from 'express';
import { createClient } from 'redis';
import { createCachedFetch } from '../src/index.js';
import type { CacheStore, CacheEntry } from '../src/types.js';

// --- Redis Store Implementation ---

function createRedisStore<T>(redisClient: ReturnType<typeof createClient>, prefix = 'cache:'): CacheStore<T> {
  return {
    async get(key: string): Promise<CacheEntry<T> | undefined> {
      const data = await redisClient.get(`${prefix}${key}`);
      if (!data) return undefined;
      return JSON.parse(data) as CacheEntry<T>;
    },

    async set(key: string, entry: CacheEntry<T>): Promise<void> {
      const ttlSeconds = Math.ceil((entry.expiresAt - Date.now()) / 1000);
      if (ttlSeconds > 0) {
        await redisClient.setEx(`${prefix}${key}`, ttlSeconds, JSON.stringify(entry));
      }
    },

    async delete(key: string): Promise<void> {
      await redisClient.del(`${prefix}${key}`);
    },

    async clear(): Promise<void> {
      // Note: This clears all keys with the prefix. For production, consider
      // using Redis SCAN to be more selective, or use a separate Redis database.
      const keys = await redisClient.keys(`${prefix}*`);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    },

    async has(key: string): Promise<boolean> {
      const result = await redisClient.exists(`${prefix}${key}`);
      return result === 1;
    },
  };
}

// --- Setup ---

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = createClient({ url: REDIS_URL });

redis.on('error', (err) => {
  console.error('Redis Client Error', err);
  process.exit(1);
});

await redis.connect();

// --- Cached Fetch ---

const cachedFetch = createCachedFetch({
  timeToLive: 5 * 60_000, // 5 minutes
  store: createRedisStore(redis),
  onMissCallback: (key) => console.log(`🚀 Fetching ${key} from API...`),
  onHitCallback: (key) => console.log(`✅ Cache hit: ${key}`),
});

// --- Express Server ---

const app = express();

app.get('/launch/:id', async (req, res) => {
  try {
    const data = await cachedFetch(
      `https://lldev.thespacedevs.com/2.2.0/launch/${req.params.id}/`
    );
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
  console.log('Try: http://localhost:3000/launch/2baf1b13-6159-4640-864d-7959f9bfe978');
});

