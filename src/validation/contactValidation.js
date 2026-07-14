import { body, query, validationResult } from 'express-validator';
import { sendError } from '../utils/responseHelper.js';
import { STATUS_ENUM, CONTACT_METHOD_ENUM } from '../models/Contact.js';

// gmail_remove_subaddress/gmail_remove_dots default to true, which would
// silently collapse kishor+124@gmail.com to kishor@gmail.com — breaking the
// +tag convention used for dev/staging test signups (same options already
// used by user-authentication-microservice's and leadValidation's validators).
const EMAIL_NORMALIZE_OPTIONS = {
  gmail_remove_subaddress: false,
  gmail_remove_dots: false,
  gmail_convert_googlemaildotcom: false,
};

export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, {
      message: 'Validation failed',
      statusCode: 422,
      details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      code: 'VALIDATION_ERROR',
    });
  }
  next();
};

export const validateSubmitContact = [
  body('name').trim().notEmpty().isLength({ max: 100 }).withMessage('Name is required (max 100 chars)'),
  body('email').trim().isEmail().normalizeEmail(EMAIL_NORMALIZE_OPTIONS).withMessage('Valid email is required'),
  body('phone').optional({ checkFalsy: true }).trim(),
  body('companyName').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('message').trim().notEmpty().isLength({ max: 2000 }).withMessage('Message is required (max 2000 chars)'),
  body('preferredContactMethod').optional().isIn(CONTACT_METHOD_ENUM).withMessage('Invalid contact method'),
  body('newsletterOptIn').optional().isBoolean(),
  body('privacyConsent')
    .notEmpty().withMessage('Privacy consent is required')
    .custom((v) => v === true || v === 'true')
    .withMessage('Privacy consent must be explicitly accepted (true)'),
  handleValidationErrors,
];

export const validateUpdateStatus = [
  body('status').trim().notEmpty().isIn(STATUS_ENUM).withMessage('Invalid status value'),
  body('note').optional().trim().isLength({ max: 2000 }),
  handleValidationErrors,
];

export const validateListQuery = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('status').optional().isIn(STATUS_ENUM),
  query('sort').optional().isIn(['createdAt', 'updatedAt', 'status']),
  query('order').optional().isIn(['asc', 'desc']),
  handleValidationErrors,
];
