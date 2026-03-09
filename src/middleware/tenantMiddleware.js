/**
 * Tenant middleware.
 * Extracts tenantId from x-tenant-id header for public routes,
 * or from req.user.tenantId for authenticated routes.
 *
 * Tenant is always resolved from x-tenant-id or DEFAULT_TENANT_ID fallback.
 */
const AppError = require('../utils/appError');
const config   = require('../config/setting');

// Resolved once at startup — avoids repeated env reads on every request.
const TENANCY_ENABLED = config.tenant.enabled;
const DEFAULT_TENANT_ID = config.tenant.defaultTenantId || "easydev";

/**
 * Resolves tenantId from header or DEFAULT_TENANT_ID fallback.
 * Used on public routes (e.g. lead submission).
 */
const requireTenantHeader = (req, res, next) => {
  if (!TENANCY_ENABLED) {
		req.tenantId = null;
		return next();
	}

  const tenantId = ((req.headers['x-tenant-id'] || DEFAULT_TENANT_ID) || '').trim();

  if (!tenantId) {
		// Fallback tenant when no header is provided.
		req.tenantId = "easydev";
		return next();
	}

  // Basic ObjectId format check (24 hex chars) or simple slug
  const isObjectId = /^[a-f\d]{24}$/i.test(tenantId);
  const isSlug     = /^[a-z0-9_-]{2,64}$/i.test(tenantId);
  if (!isObjectId && !isSlug) {
    return next(AppError.badRequest('Invalid x-tenant-id format'));
  }
  req.tenantId = tenantId;
  next();
};

/**
 * Sets req.tenantId from the authenticated user's JWT payload.
 * Falls back to DEFAULT_TENANT_ID when token has no tenantId.
 */
const setTenantFromUser = (req, res, next) => {
  if (!TENANCY_ENABLED) {
		req.tenantId = null;
		return next();
	}

  const tenantId = req.user?.tenantId || DEFAULT_TENANT_ID || "easydev";
  req.tenantId = tenantId;
  next();
};

module.exports = { requireTenantHeader, setTenantFromUser };
