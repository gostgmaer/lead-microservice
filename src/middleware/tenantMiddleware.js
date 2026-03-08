/**
 * Tenant middleware.
 * Extracts tenantId from x-tenant-id header for public routes,
 * or from req.user.tenantId for authenticated routes.
 *
 * TENANCY_ENABLED=true  → tenant is enforced; 400 if missing.
 * TENANCY_ENABLED=false → tenant is optional; req.tenantId = null and services continue.
 */
const AppError = require('../utils/appError');
const config   = require('../config/setting');

// Resolved once at startup — avoids repeated env reads on every request.
const TENANCY_ENABLED   = config.tenant.enabled;
const DEFAULT_TENANT_ID = config.tenant.defaultTenantId || null;

/**
 * Resolves tenantId from header or DEFAULT_TENANT_ID fallback.
 * Enforces presence only when TENANCY_ENABLED=true.
 * Used on public routes (e.g. lead submission).
 */
const requireTenantHeader = (req, res, next) => {
  const tenantId = ((req.headers['x-tenant-id'] || DEFAULT_TENANT_ID) || '').trim();

  if (!tenantId) {
    if (TENANCY_ENABLED) {
      return next(AppError.badRequest(
        'x-tenant-id header is required. Set DEFAULT_TENANT_ID in the service env or pass the header explicitly.'
      ));
    }
    // Non-tenanted mode — continue without tenant scoping.
    req.tenantId = null;
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
 * In non-tenanted mode (TENANCY_ENABLED=false), user tokens may not carry
 * tenantId — that is allowed; req.tenantId is set to null and the route continues.
 */
const setTenantFromUser = (req, res, next) => {
  const tenantId = req.user?.tenantId || null;
  if (!tenantId && TENANCY_ENABLED) {
    return next(AppError.badRequest('Tenant context missing from token'));
  }
  req.tenantId = tenantId;
  next();
};

module.exports = { requireTenantHeader, setTenantFromUser };
