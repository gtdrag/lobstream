import { Redis } from '@upstash/redis';

const STREAM_KEY = 'lobstream:firehose';
const MAX_STREAM_LENGTH = 500;

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function addMessage({ source, text, author, topics = [], confidence = 0 }) {
  const fields = {
    source,
    text: text || '',
    author: author || 'anonymous',
    ts: Date.now().toString(),
    topics: topics.join(','),
    confidence: confidence.toString(),
  };

  await redis.xadd(STREAM_KEY, '*', fields, { MAXLEN: MAX_STREAM_LENGTH, approximateMaxLen: true });
}

export async function ping() {
  return redis.ping();
}
