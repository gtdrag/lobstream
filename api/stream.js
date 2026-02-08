export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const sourcesFilter = searchParams.get('sources')?.split(',').filter(Boolean) || [];
  const topicsFilter = searchParams.get('topics')?.split(',').filter(Boolean) || [];
  // On reconnect, EventSource sends Last-Event-ID header automatically.
  // Use it to resume from where we left off instead of re-reading everything.
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

      // Send initial connected event
      enqueue('event: connected\ndata: {"status":"ok"}\n\n');

      const poll = async () => {
        if (closed || Date.now() - startTime > MAX_DURATION) {
          close();
          return;
        }

        try {
          // Use "(" prefix for exclusive start — Upstash REST API supports
          // the same XRANGE syntax as Redis: "(" before the ID means exclusive.
          // For the initial "0-0" start, use "-" to read from the very beginning.
          const rangeStart = lastId === '0-0' ? '-' : '(' + lastId;
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
              // Upstash REST API returns stream entries as [id, [field, value, ...]]
              const id = entry[0];
              const fields = entry[1];

              if (!id || !Array.isArray(fields)) continue;

              // Parse fields array into object
              const msg = {};
              for (let i = 0; i < fields.length; i += 2) {
                msg[fields[i]] = fields[i + 1];
              }

              // Apply source filter
              if (sourcesFilter.length && !sourcesFilter.includes(msg.source)) {
                lastId = id;
                continue;
              }

              // Apply topic filter
              if (topicsFilter.length) {
                const msgTopics = (msg.topics || '').split(',').filter(Boolean);
                if (!topicsFilter.some((t) => msgTopics.includes(t))) {
                  lastId = id;
                  continue;
                }
              }

              const event =
                `id: ${id}\n` +
                `event: post\n` +
                `data: ${JSON.stringify(msg)}\n\n`;
              enqueue(event);
              lastId = id;
            }
          }

          // Heartbeat every 10 seconds to keep the connection alive
          if (Date.now() - lastHeartbeat > 10000) {
            enqueue(`event: heartbeat\ndata: {"ts":${Date.now()}}\n\n`);
            lastHeartbeat = Date.now();
          }
        } catch (err) {
          const safeMessage = (err.message || 'unknown error').replace(/"/g, '\\"');
          enqueue(`event: error\ndata: {"message":"${safeMessage}"}\n\n`);
        }

        if (!closed && Date.now() - startTime < MAX_DURATION) {
          setTimeout(poll, 1500);
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
