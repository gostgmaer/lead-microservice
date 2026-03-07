const mongoose = require('mongoose');
const config = require('./setting');
const logger = require('../middleware/logger');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  try {
    await mongoose.connect(config.db.uri, {
      maxPoolSize: 20,          // max concurrent connections per process
      minPoolSize: 5,           // keep warm connections ready
      maxIdleTimeMS: 30000,     // close idle connections after 30s
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,   // ops must complete within 45s
      heartbeatFrequencyMS: 10000,
      connectTimeoutMS: 10000,
    });
    isConnected = true;
    logger.info('[DB] MongoDB connected');
  } catch (err) {
    logger.error('[DB] Connection failed:', err.message);
    process.exit(1);
  }
}

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  logger.warn('[DB] MongoDB disconnected');
});

module.exports = { connectDB };
