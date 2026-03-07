/**
 * Express application setup
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');

const config = require('./src/config/setting');
const { notFound, globalErrorHandler } = require('./src/middleware/errorHandler');
const leadRoutes = require('./src/routes/leads');

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

// ─── Static files (uploads) ───────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/leads', leadRoutes);

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
app.use(globalErrorHandler);

module.exports = app;
