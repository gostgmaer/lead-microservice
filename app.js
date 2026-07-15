/**
 * Express application setup
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import path from 'path';

import { randomUUID } from 'crypto';

import config from './src/config/setting.js';
import { notFound, errorHandler } from './src/middleware/errorHandler.js';
import { connectDB } from './src/config/db.js';
import logger from './src/middleware/logger.js';
import leadRoutes from './src/routes/leads.js';
import contactRoutes from './src/routes/contact.js';
import newsletterRoutes from './src/routes/newsletter.js';
import uploadRoutes from './src/routes/upload.js';
import calculatorRoutes from './src/routes/calculator.js';
import internalRoutes from './src/routes/internal.js';

// server.js (traditional/local start) also calls connectDB() and exits on
// failure. On Vercel, app.js is the actual serverless entry point (default
// export below) — server.js is never executed — so the connection must be
// established here too. connectDB() is idempotent (guarded by isConnected),
// so this is a no-op on warm invocations. Failure must NOT crash the
// process (a shared serverless container would take down concurrent
// requests); routes fall back to reporting a degraded health check instead.
connectDB().catch((err) => {
  logger.error('[app] Initial database connection failed', err);
});

const app = express();

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet());
app.set('trust proxy', 1);

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: config.cors.origins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id'],
}));

// ─── Compression ────────────────────────────────────────────────────────────
app.use(compression());

// ─── Logging ─────────────────────────────────────────────────────────────────
if (config.app.env !== 'test') {
  app.use(morgan('combined'));
}

// ─── Request timeout (30 s) ───────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    if (!res.headersSent) {
      res.status(503).json({ success: false, message: 'Request timeout — please retry' });
    }
  });
  next();
});

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Request ID + Response envelope ─────────────────────────────────────────────
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  const _json = res.json.bind(res);
  res.json = function (body) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (body !== null && body !== undefined && typeof body === 'object' && !Array.isArray(body)) {
      body.timestamp  = new Date().toISOString();
      body.requestId  = req.requestId;
      body.statusCode = res.statusCode;
      body.status     = res.statusCode < 400 ? 'success' : 'error';
    }
    return _json(_cleanResponse(body));
  };
  next();
});

// ─── Static files (uploads) ───────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/leads', leadRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/calculator', calculatorRoutes);
app.use('/internal', internalRoutes);

// ─── Root health check ────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    service: config.app.name,
    version: config.app.version,
    status: 'running',
    timestamp: new Date().toISOString(),
  });
});

// ─── 404 & Error Handler ──────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;

// ─── Response transform ───────────────────────────────────────────────────────
function _cleanResponse(val) {
  if (val === null || val === undefined) return undefined;
  if (typeof val !== 'object') return val;
  if (val instanceof Date) return val;
  if (Buffer.isBuffer(val)) return val;
  if (Array.isArray(val)) return val.map(_cleanResponse).filter(v => v !== undefined);
  const src = typeof val.toJSON === 'function' ? val.toJSON() : val;
  if (typeof src !== 'object' || src === null) return src;
  const out = {};
  for (const key of Object.keys(src)) {
    if (key === '__v' || key === '_id' || key === 'id' ||
        key === 'isDeleted' || key === 'deletedAt' ||
        key === 'created_by' || key === 'updated_by' || key === 'deleted_by') continue;
    const v = _cleanResponse(src[key]);
    if (v !== undefined) out[key] = v;
  }
  const rawId = src.id !== undefined ? src.id : src._id;
  if (rawId !== undefined) out.id = String(rawId);
  return out;
}
