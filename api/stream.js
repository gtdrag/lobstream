export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const sourcesFilter = searchParams.get('sources')?.split(',').filter(Boolean) || [];
  const topicsFilter = searchParams.get('topics')?.split(',').filter(Boolean) || [];
  const lastEventId = req.headers.get('Last-Event-ID');
  const after = lastEventId || searchParams.get('after') || '0-0';

  const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!REDIS_URL || !REDIS_TOKEN) {
    return new Response('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN', { status: 500 });
  }

  const encoder = new TextEncoder();
  let lastId = after;
  const startTime = Date.now();
  const MAX_DURATION = 25000;
  let lastHeartbeat = Date.now();
  const isFreshConnection = !lastEventId && after === '0-0';

  async function redisCommand(command) {
    const res = await fetch(REDIS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Redis request failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    return data.result;
  }

  function parseEntry(entry) {
    const id = entry[0];
    const fields = entry[1];
    if (!id || !Array.isArray(fields)) return null;

    const msg = {};
    for (let i = 0; i < fields.length; i += 2) {
      msg[fields[i]] = fields[i + 1];
    }

    if (sourcesFilter.length && !sourcesFilter.includes(msg.source)) return null;
    if (topicsFilter.length) {
      const msgTopics = (msg.topics || '').split(',').filter(Boolean);
      if (!topicsFilter.some((t) => msgTopics.includes(t))) return null;
    }

    return { id, msg };
  }

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      function enqueue(chunk) {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            closed = true;
          }
        }
      }

      function close() {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }

      enqueue('event: connected\ndata: {"status":"ok"}\n\n');

      // On fresh connections, backfill the most recent 30 posts so the page
      // is never empty — regardless of how old they are.
      if (isFreshConnection) {
        try {
          const recent = await redisCommand([
            'XREVRANGE',
            'lobstream:firehose',
            '+',
            '-',
            'COUNT',
            '30',
          ]);

          if (recent && Array.isArray(recent) && recent.length > 0) {
            // XREVRANGE returns newest-first; reverse so client gets oldest-first
            const entries = recent.reverse();
            for (const entry of entries) {
              const parsed = parseEntry(entry);
              if (!parsed) continue;

              enqueue(
                `id: ${parsed.id}\n` +
                `event: post\n` +
                `data: ${JSON.stringify(parsed.msg)}\n\n`
              );
              lastId = parsed.id;
            }
          }
        } catch (err) {
          const safeMessage = (err.message || 'unknown error').replace(/"/g, '\\"');
          enqueue(`event: error\ndata: {"message":"${safeMessage}"}\n\n`);
        }
      }

      // Continue polling for new posts
      const poll = async () => {
        if (closed || Date.now() - startTime > MAX_DURATION) {
          close();
          return;
        }

        try {
          const rangeStart = lastId === '0-0'
            ? String(Date.now() - 120_000)
            : '(' + lastId;
          const result = await redisCommand([
            'XRANGE',
            'lobstream:firehose',
            rangeStart,
            '+',
            'COUNT',
            '20',
          ]);

          if (result && Array.isArray(result) && result.length > 0) {
            for (const entry of result) {
              const parsed = parseEntry(entry);
              if (!parsed) {
                lastId = entry[0];
                continue;
              }

              enqueue(
                `id: ${parsed.id}\n` +
                `event: post\n` +
                `data: ${JSON.stringify(parsed.msg)}\n\n`
              );
              lastId = parsed.id;
            }
          }

          if (Date.now() - lastHeartbeat > 10000) {
            enqueue(`event: heartbeat\ndata: {"ts":${Date.now()}}\n\n`);
            lastHeartbeat = Date.now();
          }
        } catch (err) {
          const safeMessage = (err.message || 'unknown error').replace(/"/g, '\\"');
          enqueue(`event: error\ndata: {"message":"${safeMessage}"}\n\n`);
        }

        if (!closed && Date.now() - startTime < MAX_DURATION) {
          setTimeout(poll, 8000);
        } else {
          close();
        }
      };

      poll();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
