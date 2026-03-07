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

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 'No token provided', 401);
    }

    const result = await apiCall(
      `${config.auth.serviceUrl}/user/auth/verify/session`,
      { method: 'POST' },
      { headers: { Authorization: authHeader } }
    );

    if (result.error || result.data?.statusCode !== 200) {
      return errorResponse(res, 'Invalid or expired token', 401);
    }

    req.user = result.data.user ?? result.data.result;
    next();
  } catch (err) {
    return errorResponse(res, 'Authentication service unavailable', 401);
  }
};

module.exports = authMiddleware;
