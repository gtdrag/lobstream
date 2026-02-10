export const config = { runtime: 'edge' };

export default async function handler(req) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(JSON.stringify({ error: 'Database not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };

  // Fetch posts (author + submolt pairs) and agents in parallel
  const [postsRes, agentsRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/posts?select=author_name,submolt_name&limit=5000`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/agents?select=name,karma,follower_count,description,post_count&limit=1000`, { headers }),
  ]);

  if (!postsRes.ok || !agentsRes.ok) {
    const detail = !postsRes.ok ? await postsRes.text() : await agentsRes.text();
    return new Response(JSON.stringify({ error: 'Database query failed', detail }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const posts = await postsRes.json();
  const agents = await agentsRes.json();

  // Build agent lookup
  const agentMap = new Map();
  for (const a of agents) {
    agentMap.set(a.name, a);
  }

  // Deduplicate agent-submolt pairs and track submolt memberships
  const agentSubmolts = new Map(); // agent -> Set of submolts
  for (const p of posts) {
    if (!p.author_name || !p.submolt_name) continue;
    if (!agentSubmolts.has(p.author_name)) {
      agentSubmolts.set(p.author_name, new Set());
    }
    agentSubmolts.get(p.author_name).add(p.submolt_name);
  }

  // Build submolt -> agents index
  const submoltAgents = new Map(); // submolt -> Set of agents
  for (const [agent, submolts] of agentSubmolts) {
    for (const s of submolts) {
      if (!submoltAgents.has(s)) {
        submoltAgents.set(s, new Set());
      }
      submoltAgents.get(s).add(agent);
    }
  }

  // Compute co-submolt edges
  const edgeKey = (a, b) => a < b ? `${a}|||${b}` : `${b}|||${a}`;
  const edgeMap = new Map(); // key -> { source, target, weight, submolts }

  for (const [submolt, agentSet] of submoltAgents) {
    const agentList = [...agentSet];
    for (let i = 0; i < agentList.length; i++) {
      for (let j = i + 1; j < agentList.length; j++) {
        const key = edgeKey(agentList[i], agentList[j]);
        if (!edgeMap.has(key)) {
          edgeMap.set(key, {
            source: agentList[i],
            target: agentList[j],
            weight: 0,
            submolts: [],
          });
        }
        const edge = edgeMap.get(key);
        edge.weight++;
        edge.submolts.push(`m/${submolt}`);
      }
    }
  }

  // Build nodes — only include agents that appear in at least one edge
  const connectedAgents = new Set();
  for (const edge of edgeMap.values()) {
    connectedAgents.add(edge.source);
    connectedAgents.add(edge.target);
  }

  const nodes = [];
  for (const name of connectedAgents) {
    const a = agentMap.get(name);
    const submolts = agentSubmolts.get(name);
    const topSubmolt = submolts ? [...submolts][0] : null;
    nodes.push({
      id: name,
      karma: a?.karma || 0,
      postCount: a?.post_count || 0,
      followerCount: a?.follower_count || 0,
      description: a?.description || '',
      topSubmolt: topSubmolt,
    });
  }

  const links = [...edgeMap.values()];

  return new Response(JSON.stringify({
    nodes,
    links,
    meta: { nodeCount: nodes.length, linkCount: links.length },
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
