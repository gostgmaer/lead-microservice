/**
 * Tenant middleware.
 * Extracts tenantId from x-tenant-id header for public routes,
 * or from req.user.tenantId for authenticated routes.
 */
const AppError = require('../utils/appError');

/**
 * Validates that x-tenant-id header is present and looks like a valid ObjectId or slug.
 * Used on public routes (e.g. lead submission).
 */
const requireTenantHeader = (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'];
  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    return next(AppError.badRequest('x-tenant-id header is required'));
  }
  // Basic ObjectId format check (24 hex chars) or simple slug
  const isObjectId = /^[a-f\d]{24}$/i.test(tenantId.trim());
  const isSlug = /^[a-z0-9_-]{2,64}$/i.test(tenantId.trim());
  if (!isObjectId && !isSlug) {
    return next(AppError.badRequest('Invalid x-tenant-id format'));
  }
  req.tenantId = tenantId.trim();
  next();
};

/**
 * Sets req.tenantId from authenticated user's tenantId.
 * Assumes authMiddleware has already run.
 */
const setTenantFromUser = (req, res, next) => {
  if (!req.user || !req.user.tenantId) {
    return next(AppError.badRequest('Tenant context missing from token'));
  }
  req.tenantId = req.user.tenantId;
  next();
};

module.exports = { requireTenantHeader, setTenantFromUser };
