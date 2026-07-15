import { config } from '../config/index.js';

/**
 * Guards service-to-service /internal routes with a shared API key —
 * these are called by IAM's user-archive cascade, never by a user JWT.
 * Fails closed: no configured key means every internal route rejects,
 * matching this platform's convention elsewhere (see ApiKeyGuard in
 * job-agent-service / the AI Communication backend) rather than the
 * fail-open pattern notification-service was flagged for.
 */
export const requireInternalApiKey = (req, res, next) => {
  const expected = config.internal.apiKey;
  const provided = req.headers['x-api-key'];
  if (!expected || !provided || provided !== expected) {
    return res.status(401).json({ success: false, message: 'Invalid or missing internal API key' });
  }
  next();
};
