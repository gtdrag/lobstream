import { startHealthServer } from './lib/health.js';
import { redis } from './lib/redis.js';
import { start as startAiBatch, stop as stopAiBatch } from './lib/ai-batch.js';

// Source connectors
import { startMastodon } from './sources/mastodon.js';
import { startFourchan } from './sources/fourchan.js';
import { startReddit } from './sources/reddit.js';
import { startLobsters } from './sources/lobsters.js';
import { startGithub } from './sources/github.js';

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

  // Start AI batch processor (Tier 2)
  startAiBatch();

  // Start sources
  sources.push(startMastodon());
  sources.push(startFourchan());
  sources.push(startReddit());
  sources.push(startLobsters());
  sources.push(startGithub());

  console.log(`Lobstream relay running with ${sources.length} sources`);
}

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down...');
  stopAiBatch();
  for (const source of sources) {
    if (source && source.stop) source.stop();
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
