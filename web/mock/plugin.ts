import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { createDb } from './db.ts';
import type { Db, Json } from './db.ts';

/** Dev-only mock of the console API (`npm run dev:mock`). Realistic fixtures, in-memory state. */
export function mockApi(): Plugin {
  const db = createDb();
  return {
    name: 'monethical-mock-api',
    configureServer(server) {
      server.middlewares.use('/api', (req, res, next) => {
        void handle(db, req, res).catch(next);
      });
    },
  };
}

interface Reply {
  status?: number;
  body?: Json | string;
  type?: string;
  headers?: Record<string, string>;
}

const readBody = (req: IncomingMessage): Promise<Json> =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (c: Buffer) => (raw += c.toString('utf8')));
    req.on('end', () => {
      try {
        resolve(raw ? (JSON.parse(raw) as Json) : {});
      } catch {
        resolve({});
      }
    });
  });

async function handle(db: Db, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://mock');
  const body = await readBody(req);
  await new Promise((r) => setTimeout(r, 120)); // feel the loading states
  let reply: Reply;
  try {
    reply = db.route(req.method ?? 'GET', url.pathname.replace(/^\/v1/, ''), url.searchParams, body);
  } catch (e) {
    const err = e as { status?: number; code?: string; message?: string; details?: Json };
    reply = {
      status: err.status ?? 500,
      body: { error: { code: err.code ?? 'internal_error', message: err.message ?? 'Mock error', ...(err.details ? { details: err.details } : {}) } },
    };
  }
  const status = reply.status ?? 200;
  const isText = typeof reply.body === 'string';
  res.statusCode = status;
  res.setHeader('Content-Type', reply.type ?? (isText ? 'text/plain' : 'application/json'));
  for (const [k, v] of Object.entries(reply.headers ?? {})) res.setHeader(k, v);
  res.end(status === 204 || reply.body === undefined ? undefined : isText ? (reply.body as string) : JSON.stringify(reply.body));
}
