import mongoose from "mongoose";
import config from "./setting.js";
import logger from "../middleware/logger.js";

let isConnected = false;
let connectionPromise = null;

async function connectDB() {
  if (isConnected) {
    return mongoose.connection;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  let uri = config.db.uri;

  // Append database name if missing
  const hasDbName = /\/[^/?]+(\?|$)/.test(uri.split("?")[0]);

  if (!hasDbName) {
    const dbName = process.env.MONGODB_NAME || "easydev_lead";
    const [base, query] = uri.split("?");

    uri = base.replace(/\/$/, "") + `/${dbName}` + (query ? `?${query}` : "");

    logger.warn(`[DB] No database specified in URI. Using "${dbName}".`);
  }

  connectionPromise = mongoose
    .connect(uri, {
      maxPoolSize: 20,
      minPoolSize: 5,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      heartbeatFrequencyMS: 10000,
      connectTimeoutMS: 10000,
      bufferCommands: false,
    })
    .then((m) => {
      isConnected = true;
      logger.info(`[DB] Connected to ${m.connection.name}`);
      return m.connection;
    })
    .catch((err) => {
      connectionPromise = null;
      logger.error("[DB] Connection failed:", err.message);
      throw err;
    });

  return connectionPromise;
}

mongoose.connection.on("disconnected", () => {
  isConnected = false;
  connectionPromise = null;
  logger.warn("[DB] MongoDB disconnected");
});

mongoose.connection.on("error", (err) => {
  logger.error("[DB] MongoDB error:", err.message);
});

export { connectDB };
