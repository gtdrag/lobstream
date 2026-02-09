export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name');

  if (!name) {
    return new Response(JSON.stringify({ error: 'Missing ?name= parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(JSON.stringify({ error: 'Database not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const params = new URLSearchParams();
  params.set('select', 'name,description,karma,follower_count,following_count,owner_x_handle,owner_x_name,owner_x_verified,post_count,first_seen_at,last_seen_at');
  params.set('name', `eq.${name}`);
  params.set('limit', '1');

  const url = `${SUPABASE_URL}/rest/v1/agents?${params.toString()}`;

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
  const agent = rows.length > 0 ? rows[0] : null;

  return new Response(JSON.stringify({ agent }), {
    status: agent ? 200 : 404,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  });
}
