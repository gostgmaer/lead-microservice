/**
 * Rate limiter middleware — Redis-backed when REDIS_URL is set, in-memory fallback otherwise.
 *
 * Redis strategy: sliding window counter using INCR + PEXPIRE.
 * - Horizontally safe: all instances share the same Redis counter per key.
 * - Fallback: if Redis is unavailable or unconfigured, the in-memory Map is used
 *   transparently — no crashes, no silent pass-through.
 *
 * Usage:
 *   const { rateLimit } = require('../middleware/rateLimit');
 *   const limiter = rateLimit({ maxAttempts: 10, windowMs: 15 * 60 * 1000, action: 'lead_submit' });
 *   router.post('/submit', limiter, handler);
 */

const config = require('../config/setting');
const logger = require('./logger');

// ── Redis client (lazy, optional) ─────────────────────────────────────────────
let redis = null;

if (config.redis && config.redis.enabled && config.redis.url) {
  try {
    const Redis = require('ioredis');
    redis = new Redis(config.redis.url, {
      enableOfflineQueue: false,   // don't buffer commands when disconnected
      maxRetriesPerRequest: 1,     // fail fast — fall back to in-memory
      lazyConnect: true,
    });
    redis.connect().catch((err) => {
      logger.warn(`[rateLimit] Redis connect failed, using in-memory fallback: ${err.message}`);
      redis = null;
    });
    redis.on('error', (err) => {
      logger.warn(`[rateLimit] Redis error, switching to in-memory: ${err.message}`);
      redis = null;
    });
  } catch (err) {
    logger.warn(`[rateLimit] ioredis not available, using in-memory: ${err.message}`);
    redis = null;
  }
}

// ── In-memory fallback store ──────────────────────────────────────────────────
const memStore = new Map();

// Purge expired in-memory entries every 5 minutes to avoid memory leak
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of memStore) {
    if (now > v.resetAt) memStore.delete(k);
  }
}, 5 * 60 * 1000).unref(); // .unref() so this timer doesn't block process exit

// ── Redis counter helper ──────────────────────────────────────────────────────
async function redisIncr(key, windowMs) {
  const count = await redis.incr(key);
  if (count === 1) {
    // First request in this window — set the TTL
    await redis.pexpire(key, windowMs);
  }
  const ttlMs = await redis.pttl(key);
  return { count, resetAt: Date.now() + (ttlMs > 0 ? ttlMs : windowMs) };
}

// ── In-memory counter helper ──────────────────────────────────────────────────
function memIncr(key, windowMs) {
  const now = Date.now();
  const record = memStore.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }
  record.count += 1;
  memStore.set(key, record);
  return record;
}

// ── Middleware factory ─────────────────────────────────────────────────────────
const rateLimit = (options = {}) => {
  const cfg = {
    maxAttempts: 100,
    windowMs: 15 * 60 * 1000,
    action: 'general',
    errorMessage: 'Too many requests, please try again later',
    statusCode: 429,
    keyGenerator: (req) => `rl:${options.action || 'general'}:${req.ip}`,
    ...options,
  };

  return async (req, res, next) => {
    const key = cfg.keyGenerator(req);
    let count, resetAt;

    try {
      if (redis) {
        ({ count, resetAt } = await redisIncr(key, cfg.windowMs));
      } else {
        ({ count, resetAt } = memIncr(key, cfg.windowMs));
      }
    } catch (err) {
      // Redis blip — fall back to in-memory for this request
      logger.warn(`[rateLimit] Redis op failed, falling back: ${err.message}`);
      ({ count, resetAt } = memIncr(key, cfg.windowMs));
    }

    res.set({
      'X-RateLimit-Limit': cfg.maxAttempts,
      'X-RateLimit-Remaining': Math.max(0, cfg.maxAttempts - count),
      'X-RateLimit-Reset': new Date(resetAt).toISOString(),
    });

    if (count > cfg.maxAttempts) {
      return res.status(cfg.statusCode).json({
        success: false,
        message: cfg.errorMessage,
        retryAfter: resetAt - Date.now(),
      });
    }

    next();
  };
};

module.exports = { rateLimit };
