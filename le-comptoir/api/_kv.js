// api/_kv.js
// Wrapper compatible @vercel/kv qui utilise directement l'URL Redis
// de la variable KV_REST_API_REDIS_URL (nouveau format Vercel)

import { createClient } from 'redis';

let client = null;
let connecting = null;

async function getClient() {
  if (client && client.isOpen) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    const url = process.env.KV_REST_API_REDIS_URL
             || process.env.KV_REST_API_REDIS_REDIS_URL
             || process.env.STORAGE_URL
             || process.env.REDIS_URL
             || process.env.KV_URL;
    if (!url) throw new Error('KV_REST_API_REDIS_URL non définie');
    const c = createClient({ url, socket: { tls: url.startsWith('rediss://') } });
    c.on('error', (err) => console.error('Redis error:', err));
    await c.connect();
    client = c;
    connecting = null;
    return c;
  })();

  return connecting;
}

export const kv = {
  async get(key) {
    const c = await getClient();
    const v = await c.get(key);
    if (v === null || v === undefined) return null;
    // @vercel/kv désérialise automatiquement le JSON
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  },

  async set(key, value, options = {}) {
    const c = await getClient();
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    const args = [key, serialized];
    if (options.ex) args.push({ EX: options.ex });
    else if (options.px) args.push({ PX: options.px });
    return c.set(...args);
  },

  async del(key) {
    const c = await getClient();
    return c.del(key);
  },

  async lpush(key, ...values) {
    const c = await getClient();
    const serialized = values.map(v => typeof v === 'string' ? v : JSON.stringify(v));
    return c.lPush(key, serialized);
  },

  async rpush(key, ...values) {
    const c = await getClient();
    const serialized = values.map(v => typeof v === 'string' ? v : JSON.stringify(v));
    return c.rPush(key, serialized);
  },

  async lrange(key, start, stop) {
    const c = await getClient();
    const values = await c.lRange(key, start, stop);
    // Ne pas désérialiser les ids, ils sont stockés tels quels par lpush
    return values;
  },

  async llen(key) {
    const c = await getClient();
    return c.lLen(key);
  },

  async lrem(key, count, value) {
    const c = await getClient();
    const v = typeof value === 'string' ? value : JSON.stringify(value);
    return c.lRem(key, count, v);
  },

  async keys(pattern) {
    const c = await getClient();
    return c.keys(pattern);
  },

  async exists(key) {
    const c = await getClient();
    return c.exists(key);
  },

  async expire(key, seconds) {
    const c = await getClient();
    return c.expire(key, seconds);
  },
};
