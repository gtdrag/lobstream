// Supabase persistence layer — best-effort writes, never crash the relay.
// If SUPABASE_URL or SUPABASE_SERVICE_KEY are missing, all operations no-op.

import { createClient } from '@supabase/supabase-js';

let supabase = null;

export function initDb() {
  console.log('[db] initDb() called');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  console.log(`[db] SUPABASE_URL=${url ? 'set (' + url.slice(0, 30) + '...)' : 'MISSING'}, SUPABASE_SERVICE_KEY=${key ? 'set (' + key.length + ' chars)' : 'MISSING'}`);

  if (!url || !key) {
    console.warn('[db] SUPABASE_URL or SUPABASE_SERVICE_KEY not set — running without database persistence');
    return;
  }

  supabase = createClient(url, key);
  console.log('[db] Supabase client initialized');
}

export function isAvailable() {
  return supabase !== null;
}

export async function persistPost({
  moltbookId, title, content, displayText, authorName, authorId,
  submoltName, submoltId, submoltDisplay, imageUrl,
  upvotes, downvotes, commentCount, moltbookCreatedAt,
  topics, confidence, source,
}) {
  if (!supabase) { console.log('[db] persistPost skipped — no client'); return; }
  console.log(`[db] persisting post ${moltbookId}`);

  const { error } = await supabase
    .from('posts')
    .upsert({
      moltbook_id: moltbookId,
      title: title || null,
      content: content || null,
      display_text: displayText,
      author_name: authorName || 'unknown-agent',
      author_id: authorId || null,
      submolt_name: submoltName || null,
      submolt_id: submoltId || null,
      submolt_display: submoltDisplay || null,
      image_url: imageUrl || null,
      upvotes: upvotes || 0,
      downvotes: downvotes || 0,
      comment_count: commentCount || 0,
      moltbook_created_at: moltbookCreatedAt || null,
      topics: topics || [],
      confidence: confidence || 0,
      source: source || 'moltbook',
    }, { onConflict: 'moltbook_id' });

  if (error) throw new Error(error.message);
}

export async function upsertAgent({ moltbookId, name }) {
  if (!supabase || !name) return;

  const { error } = await supabase
    .from('agents')
    .upsert({
      moltbook_id: moltbookId || null,
      name,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'name', ignoreDuplicates: false });

  if (error) throw new Error(error.message);
}

export async function upsertSubmolt({ moltbookId, name, displayName }) {
  if (!supabase || !name) return;

  const { error } = await supabase
    .from('submolts')
    .upsert({
      moltbook_id: moltbookId || null,
      name,
      display_name: displayName || null,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'name', ignoreDuplicates: false });

  if (error) throw new Error(error.message);
}

// --- Phase 2: Agent enrichment queries ---

export async function getStaleAgents(limit = 5) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('agents')
    .select('name, moltbook_id')
    .or('profile_fetched_at.is.null,profile_fetched_at.lt.' + new Date(Date.now() - 86400000).toISOString())
    .order('last_seen_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[db] getStaleAgents error:', error.message);
    return [];
  }
  return data || [];
}

export async function getAgentRecentPostId(agentName) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('posts')
    .select('moltbook_id')
    .eq('author_name', agentName)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.moltbook_id;
}

export async function enrichAgentProfile(agentName, {
  moltbookId, description, karma, followerCount, followingCount,
  ownerXHandle, ownerXName, ownerXVerified,
}) {
  if (!supabase) return;

  const updates = {
    profile_fetched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (moltbookId != null) updates.moltbook_id = moltbookId;
  if (description != null) updates.description = description;
  if (karma != null) updates.karma = karma;
  if (followerCount != null) updates.follower_count = followerCount;
  if (followingCount != null) updates.following_count = followingCount;
  if (ownerXHandle != null) updates.owner_x_handle = ownerXHandle;
  if (ownerXName != null) updates.owner_x_name = ownerXName;
  if (ownerXVerified != null) updates.owner_x_verified = ownerXVerified;

  const { error } = await supabase
    .from('agents')
    .update(updates)
    .eq('name', agentName);

  if (error) throw new Error(error.message);
}
