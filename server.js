/**
 * Server entry point
 * Connects to DB, starts scheduler, and starts the HTTP server.
 */

import 'dotenv/config';
import app from './app.js';
import { connectDB } from './src/config/db.js';
import { startScheduler } from './src/services/leadSchedulerService.js';
import logger from './src/middleware/logger.js';
import config from './src/config/setting.js';

const PORT = config.app.port;

async function start() {
  await connectDB();

  const server = app.listen(PORT, () => {
    logger.info(`[server] Lead Microservice running on port ${PORT} (${config.app.env})`);
  });

  startScheduler();

  // ─── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = (signal) => {
    logger.info(`[server] ${signal} received — shutting down`);
    server.close(() => {
      logger.info('[server] HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('[server] Unhandled rejection:', reason);
  });

  process.on('uncaughtException', (err) => {
    logger.error('[server] Uncaught exception:', err);
    process.exit(1);
  });
}

start();
