import { apiCall } from '../lib/axiosCall.js';
import config from '../config/setting.js';
import logger from '../utils/logger.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId = req.headers["x-tenant-id"] || null;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const result = await apiCall(
      `${config.auth.serviceUrl}/api/auth/token/verify`,
      { method: "POST" },
      { headers: { Authorization: authHeader, ...(tenantId ? { "X-Tenant-Id": tenantId } : {}) } }
    );

    if (result.error || result.data?.valid !== true) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    const data = result.data;
    req.user = {
      id: data.id,
      email: data.email || "",
      role: data.role,
      roles: data.roles || [data.role],
      permissions: data.permissions || [],
      tenantId: data.tenantId || tenantId,
      sessionId: data.sessionId,
    };
    next();
  } catch (err) {
    logger.error('Authentication service error:', err);
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