/**
 * Lead Routes
 *
 * CRITICAL — Route declaration order:
 * All static path segments (/stats, /export, /search, etc.) MUST be declared BEFORE /:id
 * to prevent Express from treating them as ID lookups.
 *
 * Mount at: /api/leads
 */

const express = require('express');
const router = express.Router();

// ─── Middleware ───────────────────────────────────────────────────────────────
const authMiddleware = require('../middleware/auth');
const adminAccess = require('../middleware/adminAccess');
const activityLogger = require('../middleware/activityLogger');
const { sanitizeInput } = require('../middleware/sanitization');
const { rateLimit } = require('../middleware/rateLimit');
const { setTenantFromUser, requireTenantHeader } = require('../middleware/tenantMiddleware');
const { csvUpload, handleUploadErrors } = require('../middleware/leadUpload');

// ─── Controllers ──────────────────────────────────────────────────────────────
const ctrl = require('../controller/leads/controller');
const proposalCtrl = require('../controller/leads/proposalController');
const contractCtrl = require('../controller/leads/contractController');
const attachCtrl = require('../controller/leads/attachmentController');
const importExportCtrl = require('../controller/leads/importExportController');

// ─── Validators ───────────────────────────────────────────────────────────────
const v = require('../validator/leads');

// ─── Rate limiters ────────────────────────────────────────────────────────────
const leadSubmitLimiter = rateLimit({ maxAttempts: 10, windowMs: 15 * 60 * 1000, action: 'lead_submit' });
const leadContactLimiter = rateLimit({ maxAttempts: 5, windowMs: 60 * 60 * 1000, action: 'lead_contact' });

// ─── Global middleware for all routes ────────────────────────────────────────
router.use(sanitizeInput);
router.use(activityLogger({ skipSuccessfulGET: true }));

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ROUTES (no auth)
// ─────────────────────────────────────────────────────────────────────────────

// Health check
router.get('/health', ctrl.healthCheck);

// Public lead submission
router.post('/submit', leadSubmitLimiter, requireTenantHeader, v.validateSubmitLead, ctrl.submitLead);

// Proposal view tracking — PUBLIC (called from email link, no auth required)
// MUST be declared before router.use(authMiddleware) below
router.get('/:id/proposal/view/:version', proposalCtrl.trackProposalView);

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATED — STATIC COLLECTION ROUTES (MUST be before /:id)
// ─────────────────────────────────────────────────────────────────────────────

router.use(authMiddleware, setTenantFromUser);

// Stats & analytics
router.get('/stats', ctrl.getStats);
router.get('/proposals/stats', proposalCtrl.getProposalStats);
router.get('/proposals/expiring', proposalCtrl.getExpiringProposals);

// Listing & search
router.get('/', v.validateListQuery, ctrl.listLeads);
router.get('/export', ctrl.exportLeads);
router.get('/search', ctrl.searchLeads);
router.get('/follow-up', ctrl.getFollowUpLeads);

// Bulk operations
router.post('/bulk-update', v.validateBulkUpdate, ctrl.bulkUpdate);
router.post('/bulk-delete', v.validateBulkUpdate, ctrl.bulkDelete);

// CSV import
router.post('/import', csvUpload.single('file'), handleUploadErrors, importExportCtrl.importLeads);

// ─── ADMIN-ONLY static routes (before /:id) ──────────────────────────────────
router.get('/spam', adminAccess, ctrl.listSpam);
router.post('/proposals/expire-check', adminAccess, proposalCtrl.manualExpireCheck);

// ─────────────────────────────────────────────────────────────────────────────
// PARAM ROUTES — /:id (after all static routes)
// ─────────────────────────────────────────────────────────────────────────────

// Core CRUD
router.get('/:id', ctrl.getLeadById);
router.patch('/:id', v.validateUpdateLead, ctrl.updateLead);
router.delete('/:id', ctrl.deleteLead);
router.get('/:id/score', ctrl.getLeadScore);

// Notes & communication
router.post('/:id/notes', v.validateAddNote, ctrl.addNote);
router.post('/:id/contact', leadContactLimiter, v.validateContactLead, ctrl.contactLead);

// Proposal lifecycle
router.post('/:id/proposal', v.validateSendProposal, proposalCtrl.sendProposal);
router.post('/:id/proposal/resend', proposalCtrl.resendProposal);
router.post('/:id/proposal/revise', v.validateReviseProposal, proposalCtrl.reviseProposal);
router.patch('/:id/proposal/accept', proposalCtrl.acceptProposal);
router.patch('/:id/proposal/decline', v.validateDeclineProposal, proposalCtrl.declineProposal);
router.get('/:id/proposal/history', proposalCtrl.getProposalHistory);
router.get('/:id/proposal/:version', proposalCtrl.getProposalVersion);

// Contract lifecycle
router.post('/:id/contract', v.validateSendContract, contractCtrl.sendContract);
router.patch('/:id/contract/signed', v.validateSignContract, contractCtrl.signContract);

// Status management
router.patch('/:id/status', v.validateStatusTransition, ctrl.updateStatus);
router.patch('/:id/hold', v.validateHoldLead, ctrl.holdLead);
router.patch('/:id/reopen', v.validateReopenLead, ctrl.reopenLead);
router.patch('/:id/won', v.validateMarkWon, ctrl.markWon);
router.patch('/:id/lost', v.validateMarkLost, ctrl.markLost);

// Attachments — files are uploaded via external File Upload Microservice;
// this endpoint only registers the returned URL + fileId on the lead record.
router.post('/:id/attachments', v.validateAddAttachment, attachCtrl.uploadAttachments);
router.delete('/:id/attachments/:fileId', attachCtrl.deleteAttachment);

// ─── ADMIN-ONLY param routes ──────────────────────────────────────────────────
router.patch('/:id/spam', adminAccess, ctrl.toggleSpam);
router.delete('/:id/hard-delete', adminAccess, ctrl.hardDelete);
router.patch('/:id/reopen-admin', adminAccess, ctrl.reopenAdmin);

module.exports = router;
