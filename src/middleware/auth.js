import jwt from 'jsonwebtoken';
import config from '../config/setting.js';
import logger from '../utils/logger.js';

// Verify an IAM-issued access token locally — RS256 with IAM's public key,
// falling back to the shared HS256 secret during the platform's transition
// off symmetric signing (same dual-verify convention as the gateway's
// config/jwt.js). Expiry/not-before from RS256 are authoritative and never
// retried as HS256.
function verifyAccessToken(token) {
  const opts = {};
  if (config.auth.jwtIssuer) opts.issuer = config.auth.jwtIssuer;
  if (config.auth.jwtAudience) opts.audience = config.auth.jwtAudience;

  if (config.auth.jwtPublicKey) {
    try {
      return jwt.verify(token, config.auth.jwtPublicKey, { ...opts, algorithms: ['RS256'] });
    } catch (err) {
      if (err?.name === 'TokenExpiredError' || err?.name === 'NotBeforeError' || !config.auth.jwtHsSecret) {
        throw err;
      }
    }
  }
  if (!config.auth.jwtHsSecret) {
    const err = new Error('No JWT verification key configured (set JWT_PUBLIC_KEY or JWT_SECRET)');
    err.name = 'JsonWebTokenError';
    throw err;
  }
  return jwt.verify(token, config.auth.jwtHsSecret, { ...opts, algorithms: ['HS256'] });
}

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers["x-tenant-id"] || null;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    let decoded;
    try {
      decoded = verifyAccessToken(authHeader.slice('Bearer '.length).trim());
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    const roles = decoded.roles || (decoded.role ? [decoded.role] : []);
    req.user = {
      id: decoded.sub || decoded.id,
      email: decoded.email || "",
      role: decoded.role || roles[0],
      roles,
      permissions: decoded.permissions || [],
      tenantId: decoded.tenantId || decoded.tenantSlug || tenantId,
      sessionId: decoded.sessionId,
    };
    next();
  } catch (err) {
    logger.error('Authentication error:', err);
    return res.status(401).json({ success: false, message: 'Authentication service unavailable' });
  }
};

export const requirePermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Access denied. Authentication required' });
    }
    const held = new Set(Array.isArray(req.user.permissions) ? req.user.permissions : []);
    const allowed = permissions.some((p) => held.has(p));
    if (!allowed) {
      return res.status(403).json({ success: false, message: `Access denied. Required permission: ${permissions.join(' or ')}` });
    }
    next();
  };
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Access denied. Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: `Access denied. Required role: ${roles.join(' or ')}` });
    }
    next();
  };
};