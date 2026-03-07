/**
 * Standard API response helpers
 */

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

const sendSuccess = (res, { data = null, message = 'Success', statusCode = HTTP_STATUS.OK, meta = null } = {}) => {
  const response = { success: true, statusCode, message };
  if (data !== null) response.data = data;
  if (meta !== null) response.meta = meta;
  return res.status(statusCode).json(response);
};

const sendCreated = (res, { data = null, message = 'Created successfully', meta = null } = {}) =>
  sendSuccess(res, { data, message, statusCode: HTTP_STATUS.CREATED, meta });

const sendPaginated = (res, { data, message = 'Success' } = {}) =>
  res.status(HTTP_STATUS.OK).json({ success: true, statusCode: HTTP_STATUS.OK, message, ...data });

const sendError = (res, { message = 'An error occurred', statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, errors = null, code = null } = {}) => {
  const response = { success: false, statusCode, message };
  if (errors) response.errors = errors;
  if (code) response.code = code;
  return res.status(statusCode).json(response);
};

const errorResponse = (res, message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR) =>
  sendError(res, { message, statusCode });

module.exports = { sendSuccess, sendCreated, sendPaginated, sendError, errorResponse, HTTP_STATUS };
