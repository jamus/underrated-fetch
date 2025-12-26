/**
 * Demo script to test underrated-fetch in action.
 * Run with: npx tsx demo.ts
 *
 * Uses the Launch Library development API:
 * https://lldev.thespacedevs.com
 *
 * The development endpoint has stale and limited data
 * but is not subject to any rate limits.
 */

import { createCachedFetch } from './src/index.js';

const LAUNCH_LIBRARY_DEV_API = 'https://lldev.thespacedevs.com/2.2.0';

// Type for Launch Library API response
interface Launch {
  name: string;
  status: {
    name: string;
  };
}

// Create cached fetch with 3 second TTL
const cachedFetch = createCachedFetch<Launch>({
  timeToLive: 3000,
  onHitCallback: (key) => console.log(`  ✅ Cache HIT: ${key}`),
  onMissCallback: (key) => console.log(`  ❌ Cache MISS: ${key}`),
});

async function main() {
  console.log('\n=== underrated-fetch Demo (Launch Library API) ===\n');
  console.log(`Using: ${LAUNCH_LIBRARY_DEV_API}\n`);

  // NOTE: These will likely need updating
  // they must be real launch IDs from the Launch Library API.
  // You can find valid IDs by calling: https://lldev.thespacedevs.com/2.2.0/launch/?limit=5
  const LAUNCH_URL_1 = `${LAUNCH_LIBRARY_DEV_API}/launch/2baf1b13-6159-4640-864d-7959f9bfe978/`;
  const LAUNCH_URL_2 = `${LAUNCH_LIBRARY_DEV_API}/launch/b4777dca-7194-4f97-a6c2-addbb7bb4381/`;

  try {
    // Test 1: First call (cache miss)
    console.log('1. First call for launch:');
    const launch1 = await cachedFetch(LAUNCH_URL_1);
    console.log(`   Result: ${launch1.name}`);
    console.log(`   Status: ${launch1.status.name}\n`);

    // Test 2: Second call (cache hit - should be instant)
    console.log('2. Second call for same launch (should be instant):');
    const startTime = Date.now();
    const launch2 = await cachedFetch(LAUNCH_URL_1);
    const elapsed = Date.now() - startTime;
    console.log(`   Result: ${launch2.name}`);
    console.log(`   Time: ${elapsed}ms (cached)\n`);

    // Test 3: Different launch (cache miss)
    console.log('3. Call for different launch:');
    const launch3 = await cachedFetch(LAUNCH_URL_2);
    console.log(`   Result: ${launch3.name}\n`);

    // Test 4: Same launch again (cache hit)
    console.log('4. Same launch again (cache hit):');
    await cachedFetch(LAUNCH_URL_2);
    console.log('');

    // Test 5: Wait for expiration
    console.log('5. Waiting 4 seconds for cache to expire...');
    await new Promise(resolve => setTimeout(resolve, 4000));

    // Test 6: Call again after expiration (cache miss)
    console.log('\n6. Call after expiration (fresh API call):');
    const launch4 = await cachedFetch(LAUNCH_URL_1);
    console.log(`   Result: ${launch4.name}\n`);

    console.log('=== Demo Complete ===\n');

  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
