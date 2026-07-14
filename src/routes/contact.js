/**
 * Contact Routes
 *
 * Separate resource from Lead — a contact-page message is a simple inquiry,
 * not a sales lead moving through budget/timeline/proposal stages. Kept on
 * its own model/table/routes so the plain contact form never has to carry
 * lead-pipeline fields again.
 *
 * CRITICAL — Route declaration order: static segments (/stats) MUST be
 * declared BEFORE /:id to prevent Express from treating them as ID lookups.
 *
 * Mounted at: /api/contact
 */
import { Router } from 'express';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { sanitizeInput } from '../middleware/leadSanitization.js';
import { leadRateLimit } from '../middleware/leadRateLimit.js';
import { requireTenantHeader, setTenantFromUser } from '../middleware/tenantMiddleware.js';
import * as ctrl from '../controllers/contactController.js';
import {
  validateSubmitContact,
  validateUpdateStatus,
  validateListQuery,
} from '../validation/contactValidation.js';

const router = Router();

const contactSubmitLimiter = leadRateLimit({ maxAttempts: 10, windowMs: 15 * 60 * 1000, action: 'contact_submit' });

router.use(sanitizeInput);

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ROUTES (no auth)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/submit', contactSubmitLimiter, requireTenantHeader, validateSubmitContact, ctrl.submitContact);

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTED ROUTES (dashboard/admin)
// ─────────────────────────────────────────────────────────────────────────────

router.use(authenticate, setTenantFromUser);

// Permission naming follows the platform-wide module:action convention (see
// lib/permissions.ts's LEAD_* / USER_* blocks on the frontend) — read_all for
// admin listing, plus contact:manage as an explicit umbrella on every route
// since, unlike the frontend's isSatisfied(), this middleware does no
// manage-implies-everything wildcard resolution on its own.
router.get('/stats', requirePermission('contact:read_all', 'contact:manage'), ctrl.getContactStats);
router.get('/', requirePermission('contact:read_all', 'contact:manage'), validateListQuery, ctrl.listContacts);
router.get('/:id', requirePermission('contact:read_all', 'contact:manage'), ctrl.getContactById);
router.patch('/:id/status', requirePermission('contact:update', 'contact:manage'), validateUpdateStatus, ctrl.updateContactStatus);
router.delete('/:id', requirePermission('contact:delete', 'contact:manage'), ctrl.deleteContact);

export default router;
