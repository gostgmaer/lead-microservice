import { body } from 'express-validator';

// gmail_remove_subaddress/gmail_remove_dots default to true, which would
// silently collapse kishor+124@gmail.com to kishor@gmail.com — breaking the
// +tag convention used for dev/staging test signups (same options already
// used by user-authentication-microservice's validators).
const EMAIL_NORMALIZE_OPTIONS = {
  gmail_remove_subaddress: false,
  gmail_remove_dots: false,
  gmail_convert_googlemaildotcom: false,
};

export const subscribeValidation = [
  body('email')
    .isEmail()
    .normalizeEmail(EMAIL_NORMALIZE_OPTIONS)
    .withMessage('Please provide a valid email address')
];

export const unsubscribeValidation = [
  body('email')
    .isEmail()
    .normalizeEmail(EMAIL_NORMALIZE_OPTIONS)
    .withMessage('Please provide a valid email address')
];