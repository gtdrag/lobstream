import { Redis } from '@upstash/redis';

const STREAM_KEY = 'lobstream:firehose';
const MAX_STREAM_LENGTH = 500;

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function addMessage({ source, text, author, topics = [], confidence = 0, relevance, sentiment, ai_tier, imageUrl, upvotes, downvotes, commentCount, createdAt }) {
  const fields = {
    source,
    text: text || '',
    author: author || 'anonymous',
    ts: Date.now().toString(),
    topics: topics.join(','),
    confidence: confidence.toString(),
  };
  if (relevance != null && relevance !== '') fields.relevance = relevance.toString();
  if (sentiment) fields.sentiment = sentiment;
  if (ai_tier) fields.ai_tier = ai_tier;
  if (imageUrl) fields.imageUrl = imageUrl;
  if (upvotes != null) fields.upvotes = upvotes.toString();
  if (downvotes != null) fields.downvotes = downvotes.toString();
  if (commentCount != null) fields.commentCount = commentCount.toString();
  if (createdAt) fields.createdAt = createdAt;

  await redis.xadd(STREAM_KEY, '*', fields, { MAXLEN: MAX_STREAM_LENGTH, approximateMaxLen: true });
}

export async function ping() {
  return redis.ping();
}
