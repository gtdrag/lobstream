import { startHealthServer } from './lib/health.js';
import { redis } from './lib/redis.js';

// Source connectors
import { startMastodon } from './sources/mastodon.js';
import { startFourchan } from './sources/fourchan.js';

const sources = [];

async function start() {
  console.log('Lobstream relay starting...');

  // Start health check server
  startHealthServer();

  // Test Redis connection
  try {
    await redis.ping();
    console.log('Redis connected');
  } catch (err) {
    console.error('Redis connection failed:', err.message);
    process.exit(1);
  }

  // Start sources
  sources.push(startMastodon());
  sources.push(startFourchan());

  console.log(`Lobstream relay running with ${sources.length} sources`);
}

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down...');
  for (const source of sources) {
    if (source && source.stop) source.stop();
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
