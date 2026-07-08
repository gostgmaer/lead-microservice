import axios from 'axios';
import fs from 'fs';
import path from 'path';
import logger from '../middleware/logger.js';
import config from '../config/setting.js';
import { createFileServiceHmac } from './gatewayHmac.js';

const fileServiceConfigured = Boolean(
  config.fileUpload?.serviceUrl && config.fileUpload?.gatewayHmacSecret
);

if (fileServiceConfigured) {
  logger.info("Microservice Storage: uploads routed to file-upload microservice.");
} else {
  logger.warn(
    "Microservice Storage: file-upload service not configured. Falling back to local filesystem (dev only)."
  );
}

/**
 * Uploads a buffer to the file-upload microservice (returns its public URL).
 */
async function uploadViaFileService(buffer, fileName, mimeType, req) {
  const base = String(config.fileUpload.serviceUrl).replace(/\/+$/, "");
  const url = `${base}/api/files/upload`;

  const userId = req?.user?.id || "anonymous";
  const userEmail = req?.user?.email || "";
  const userRole = req?.user?.role || "anonymous";
  const tenantId = req?.user?.tenantId || req?.tenantId || "easydev";

  const hmac = createFileServiceHmac({
    userId,
    userEmail,
    userRole,
    secret: config.fileUpload.gatewayHmacSecret,
  });

  const form = new FormData();
  form.append("files", new Blob([buffer], { type: mimeType }), fileName);
  form.append("category", "lead-attachment");

  const headers = {
    "x-user-id": userId,
    "x-user-email": userEmail,
    "x-user-role": userRole,
    ...(tenantId ? { "x-tenant-id": tenantId } : {}),
    ...(hmac ? { "X-Gateway-HMAC": hmac } : {}),
  };

  let res;
  try {
    res = await axios.post(url, form, {
      headers,
      timeout: 30000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  } catch (err) {
    const status = err?.response?.status;
    const detail = err?.response?.data?.message || err?.response?.data?.error || err.message;
    throw new Error(`File upload service request failed${status ? ` (HTTP ${status})` : ""}: ${detail}`);
  }

  const payload = res?.data;
  const data = payload?.data ?? payload;
  const item = Array.isArray(data) ? data[0] : data;
  const publicUrl = item?.url || item?.publicUrl || item?.location;
  if (!publicUrl) {
    throw new Error("File upload service did not return a public URL for the uploaded proposal.");
  }
  return publicUrl;
}

/**
 * Uploads a buffer and returns a publicly reachable URL.
 */
export async function uploadFile(buffer, fileName, mimeType, req) {
  if (fileServiceConfigured) {
    return uploadViaFileService(buffer, fileName, mimeType, req);
  }

  // Local filesystem fallback is dev-only convenience. In production this
  // would silently write to ephemeral/per-instance disk and hand back a URL
  // that 404s the moment the request completes (or on the next deploy) —
  // exactly the "client can't open the proposal link" failure this is meant
  // to prevent — so fail loudly instead of generating a broken shareable URL.
  if (config.app.env === "production") {
    throw new Error(
      "File upload service is not configured (FILE_UPLOAD_SERVICE_URL / FILE_UPLOAD_HMAC_SECRET) — " +
      "refusing to fall back to local disk storage in production, since the resulting URL would not be shareable."
    );
  }

  const uploadsDir = path.resolve(process.cwd(), "uploads", "proposals");
  const outputPath = path.join(uploadsDir, fileName);

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, buffer);

  const protocol = req.protocol || "http";
  const host = req.get("host") || `localhost:${config.app.port}`;
  return `${protocol}://${host}/uploads/proposals/${fileName}`;
}
