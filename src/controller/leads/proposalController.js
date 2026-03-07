/**
 * Proposal Controller
 * Handles: send, resend, revise, accept, decline, history, view tracking, expiring
 */

const leadService = require('../../services/leadService');
const leadEmail = require('../../services/leadEmailService');
const Lead = require('../../models/Lead');
const { catchAsync } = require('../../middleware/errorHandler');
const { sendSuccess, sendCreated } = require('../../utils/responseHelper');
const config = require('../../config/setting');

const DASH = config.dashboard.url;

// POST /api/leads/:id/proposal
const sendProposal = catchAsync(async (req, res) => {
  const lead = await leadService.sendProposal(req.params.id, req.tenantId, req.body, req.user._id);
  const activeEntry = lead.proposals[lead.activeProposalVersion - 1];

  return sendCreated(res, {
    data: {
      version: activeEntry.version,
      proposalNumber: activeEntry.proposalNumber,
    },
    message: 'Proposal sent',
  });
});

// POST /api/leads/:id/proposal/resend
const resendProposal = catchAsync(async (req, res) => {
  const { message: messageOverride } = req.body;
  const { lead, version, proposalNumber } = await leadService.resendProposal(
    req.params.id, req.tenantId, messageOverride, req.user._id
  );

  return sendSuccess(res, { data: { version, proposalNumber }, message: 'Proposal resent' });
});

// POST /api/leads/:id/proposal/revise
const reviseProposal = catchAsync(async (req, res) => {
  const { lead, version, proposalNumber } = await leadService.reviseProposal(
    req.params.id, req.tenantId, req.body, req.user._id
  );

  return sendCreated(res, {
    data: { version, proposalNumber },
    message: 'Proposal revised and sent',
  });
});

// PATCH /api/leads/:id/proposal/accept
const acceptProposal = catchAsync(async (req, res) => {
  const lead = await leadService.acceptProposal(
    req.params.id, req.tenantId, { note: req.body.note }, req.user._id
  );

  const reviewUrl = `${DASH}/leads/${lead._id}`;
  const agentName = req.user.name || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim();

  // Fire-and-forget emails
  leadEmail.sendProposalAccepted(lead, agentName);
  leadEmail.sendAdminProposalAccepted(lead, reviewUrl);

  return sendSuccess(res, {
    data: { nextStep: `Send contract via POST /api/leads/${lead._id}/contract` },
    message: 'Proposal accepted',
  });
});

// PATCH /api/leads/:id/proposal/decline
const declineProposal = catchAsync(async (req, res) => {
  const { declinedReason, note } = req.body;
  const lead = await leadService.declineProposal(
    req.params.id, req.tenantId, { declinedReason, note }, req.user._id
  );

  const reviewUrl = `${DASH}/leads/${lead._id}`;
  const agentName = req.user.name || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim();

  leadEmail.sendProposalDeclinedAck(lead, agentName);
  leadEmail.sendAdminProposalDeclined(lead, { declinedReason, reviewUrl });

  return sendSuccess(res, {
    data: { nextStep: `Consider revising — POST /api/leads/${lead._id}/proposal/revise` },
    message: 'Proposal declined',
  });
});

// GET /api/leads/:id/proposal/history
const getProposalHistory = catchAsync(async (req, res) => {
  const lead = await leadService.getLeadById(req.params.id, req.tenantId);
  const now = new Date();

  const proposals = lead.proposals
    .sort((a, b) => a.version - b.version)
    .map((p) => ({
      ...p.toObject(),
      isActive: p.version === lead.activeProposalVersion,
      isExpired: (p.status === 'sent' || p.status === 'viewed') && p.validUntil && new Date(p.validUntil) < now,
    }));

  return sendSuccess(res, {
    data: {
      proposals,
      activeVersion: lead.activeProposalVersion,
      totalVersions: lead.proposals.length,
    },
    message: 'Proposal history',
  });
});

// GET /api/leads/:id/proposal/:version
const getProposalVersion = catchAsync(async (req, res) => {
  const lead = await leadService.getLeadById(req.params.id, req.tenantId);
  const version = parseInt(req.params.version);
  const entry = lead.proposals.find((p) => p.version === version);
  if (!entry) {
    return res.status(404).json({ success: false, message: 'Proposal version not found' });
  }
  return sendSuccess(res, { data: entry, message: 'Proposal version' });
});

// GET /api/leads/:id/proposal/view/:version  — public, tracking
const trackProposalView = catchAsync(async (req, res) => {
  const { lead, proposalUrl } = await leadService.trackProposalView(req.params.id, req.params.version);
  return res.redirect(302, proposalUrl);
});

// GET /api/leads/proposals/stats
const getProposalStats = catchAsync(async (req, res) => {
  const stats = await Lead.getProposalFunnelStats(req.tenantId);
  return sendSuccess(res, { data: stats, message: 'Proposal funnel stats' });
});

// GET /api/leads/proposals/expiring
const getExpiringProposals = catchAsync(async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const tenantId = req.tenantId;
  const now = new Date();
  const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const leads = await Lead.find({
    tenantId,
    isDeleted: false,
    status: { $in: ['proposal_sent', 'proposal_viewed'] },
    proposalExpiresAt: { $gte: now, $lte: cutoff },
  }).select('leadNumber firstName email proposals activeProposalVersion proposalExpiresAt');

  return sendSuccess(res, {
    data: leads.map((l) => ({
      leadId: l._id,
      leadNumber: l.leadNumberFormatted,
      firstName: l.firstName,
      email: l.email,
      validUntil: l.proposalExpiresAt,
      daysRemaining: Math.ceil((new Date(l.proposalExpiresAt) - now) / 86400000),
    })),
    message: `Proposals expiring in next ${days} days`,
  });
});

// POST /api/leads/proposals/expire-check  (admin — manual trigger)
const manualExpireCheck = catchAsync(async (req, res) => {
  const { runProposalExpiryCheck } = require('../../services/leadSchedulerService');
  runProposalExpiryCheck(); // fire-and-forget
  return sendSuccess(res, { message: 'Expiry check triggered' });
});

module.exports = {
  sendProposal,
  resendProposal,
  reviseProposal,
  acceptProposal,
  declineProposal,
  getProposalHistory,
  getProposalVersion,
  trackProposalView,
  getProposalStats,
  getExpiringProposals,
  manualExpireCheck,
};
