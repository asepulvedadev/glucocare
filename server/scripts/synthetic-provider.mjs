import { createServer } from 'node:http';

const port = Number(process.env.SYNTHETIC_PROVIDER_PORT ?? 18085);
const providerMessageId = process.env.SYNTHETIC_PROVIDER_MESSAGE_ID ?? 'synthetic-provider-message';

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  if (request.method !== 'POST' || request.url !== '/emails') {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not_found' }));
    return;
  }
  request.resume();
  request.on('end', () => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ id: providerMessageId }));
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`synthetic-provider=ready port=${port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
