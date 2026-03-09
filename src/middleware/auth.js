const { apiCall } = require('../lib/axiosCall');
const { errorResponse } = require('../utils/responseHelper');
const config = require('../config/setting');

/**
 * Auth middleware — validates Bearer token by calling the external auth service.
 * Never validates tokens locally with jwt.verify().
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const tenantId =
			config.tenant.enabled ? (req.headers["x-tenant-id"] || config.tenant.defaultTenantId || "").trim() || null : null;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 'No token provided', 401);
    }

    const result = await apiCall(
			`${config.auth.serviceUrl}/api/auth/token/verify`,
			{ method: "POST" },
			{ headers: { Authorization: authHeader, ...(tenantId ? { "X-Tenant-Id": tenantId } : {}) } },
		);

    if (result.error || result.data?.valid !== true) {
			return errorResponse(res, "Invalid or expired token", 401);
		}

    req.user = {
			id: result.data.id,
			role: result.data.role,
			tenantId: config.tenant.enabled ? result.data.tenantId || tenantId : null,
			sessionId: result.data.sessionId,
		};
    next();
  } catch (err) {
    return errorResponse(res, 'Authentication service unavailable', 401);
  }
};

module.exports = authMiddleware;
