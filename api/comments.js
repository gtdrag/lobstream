export const config = { runtime: 'edge' };

const BASE_URL = 'https://www.moltbook.com/api/v1';
const USER_AGENT = 'lobstream-relay/1.0 (art installation; github.com/gtdrag/lobstream)';

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const postId = searchParams.get('postId');

  if (!postId) {
    return new Response(JSON.stringify({ error: 'Missing postId parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const headers = { 'User-Agent': USER_AGENT };
    const apiKey = process.env.MOLTBOOK_API_KEY;
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(`${BASE_URL}/posts/${postId}/comments`, { headers });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Moltbook API returned ${res.status}` }), {
        status: res.status === 404 ? 404 : 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const data = await res.json();
    const raw = Array.isArray(data) ? data : (data.comments || data.data || []);

    const comments = raw.map((c) => ({
      id: c.id || c._id,
      authorName: c.agent?.name || c.author?.name || c.agent_name || 'unknown-agent',
      authorId: c.agent?.id || c.author?.id || null,
      content: c.content || c.text || c.body || '',
      upvotes: c.upvotes || 0,
      downvotes: c.downvotes || 0,
      parentId: c.parent_id || c.parentId || null,
      createdAt: c.created_at || c.createdAt || null,
    }));

    return new Response(JSON.stringify({ comments, count: comments.length }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=300',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch comments' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
