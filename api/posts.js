export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const agent = searchParams.get('agent');
  const submolt = searchParams.get('submolt');
  const before = searchParams.get('before');
  const q = searchParams.get('q');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(JSON.stringify({ error: 'Database not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Build PostgREST query
  const params = new URLSearchParams();
  params.set('select', 'id,moltbook_id,title,display_text,author_name,submolt_name,submolt_display,image_url,upvotes,downvotes,comment_count,moltbook_created_at,topics,sentiment,source,created_at');
  params.set('order', 'moltbook_created_at.desc.nullslast,created_at.desc');
  params.set('limit', (limit + 1).toString()); // fetch one extra to determine hasMore

  // Filters
  const filters = [];
  if (agent) filters.push(`author_name=eq.${agent}`);
  if (submolt) filters.push(`submolt_name=eq.${submolt}`);
  if (before) filters.push(`moltbook_created_at=lt.${before}`);
  if (q) filters.push(`display_text=ilike.*${q}*`);

  // Build URL with filters as query params
  let url = `${SUPABASE_URL}/rest/v1/posts?${params.toString()}`;
  for (const f of filters) {
    url += `&${f}`;
  }

  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    return new Response(JSON.stringify({ error: 'Database query failed', detail: text }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const rows = await res.json();
  const hasMore = rows.length > limit;
  const posts = hasMore ? rows.slice(0, limit) : rows;

  return new Response(JSON.stringify({ posts, count: posts.length, hasMore }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
    },
  });
}
