import http from 'node:http';

const PORT = parseInt(process.env.PORT, 10) || 3001;

let server;

function buildResponse() {
  return {
    status: 'ok',
    uptime: process.uptime(),
    sources: [],
  };
}

export function startHealthServer() {
  server = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
      const body = JSON.stringify(buildResponse());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    }
  });

  server.listen(PORT, () => {
    console.log(`Health server listening on port ${PORT}`);
  });

  return server;
}

export function stopHealthServer() {
  if (server) {
    server.close();
  }
}
