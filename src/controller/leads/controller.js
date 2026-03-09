/**
 * Core Lead Controller
 * Handles: submit, list, get, update, delete, status, hold, reopen, won, lost, notes, score, spam, bulk ops
 */

const leadService = require('../../services/leadService');
const leadEmail = require('../../services/leadEmailService');
const Lead = require('../../models/Lead');
const { catchAsync } = require('../../middleware/errorHandler');
const { sendSuccess, sendCreated, sendPaginated, HTTP_STATUS } = require('../../utils/responseHelper');
const AppError = require('../../utils/appError');
const config = require('../../config/setting');

const DASH = config.dashboard.url;

// POST /api/leads/submit  — public
const submitLead = catchAsync(async (req, res) => {
  const tenantId = req.tenantId;

  const lead = await leadService.createLead(req.body, tenantId, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    source: req.body.source || 'website',
  });

  // If honeypot triggered, silently return 200 without processing emails
  if (lead.isSpam) {
    return res.status(200).json({ success: true, message: 'Inquiry received' });
  }

  // Fire emails — never awaited
  leadEmail.sendLeadReceived(lead);
  leadEmail.sendAdminLeadNotification(lead);

  return sendCreated(res, {
    data: { leadNumber: lead.leadNumberFormatted },
    message: 'Inquiry received. We will get back to you shortly.',
  });
});

// GET /api/leads
const listLeads = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status, priority, source, sort = 'createdAt', order = 'desc', assignedTo } = req.query;
  const tenantId = req.tenantId;

  const result = await leadService.getLeads(tenantId, {
    page: parseInt(page),
    limit: parseInt(limit),
    status, priority, source, sort, order, assignedTo,
  });

  return sendPaginated(res, {
    docs: result.docs,
    message: 'Leads retrieved successfully',
    page: result.page,
    pageSize: result.limit,
    totalRecords: result.total,
    totalPages: result.pages,
    hasNext: result.hasNext,
    hasPrev: result.hasPrev,
  });
});

// GET /api/leads/stats
const getStats = catchAsync(async (req, res) => {
  const stats = await leadService.getLeadStats(req.tenantId);
  return sendSuccess(res, { data: stats, message: 'Stats retrieved' });
});

// GET /api/leads/export
const exportLeads = catchAsync(async (req, res) => {
  const { Parser } = require('json2csv');
  const rows = await Lead.exportToCSV(req.tenantId, {});
  const parser = new Parser();
  const csv = parser.parse(rows);

  res.set({
    'Content-Type': 'text/csv',
    'Content-Disposition': `attachment; filename=leads-${new Date().toISOString().split('T')[0]}.csv`,
  });
  return res.status(200).send(csv);
});

// GET /api/leads/search
const searchLeads = catchAsync(async (req, res) => {
  const { q, status, priority, source, tags, dateFrom, dateTo, assignedTo } = req.query;
  const leads = await Lead.searchLeads({ tenantId: req.tenantId, q, status, priority, source, tags, dateFrom, dateTo, assignedTo });
  return sendSuccess(res, { data: leads, message: 'Search results' });
});

// GET /api/leads/follow-up
const getFollowUpLeads = catchAsync(async (req, res) => {
  const leads = await Lead.findDueForFollowUp(req.tenantId);
  return sendSuccess(res, { data: leads, message: 'Follow-up leads' });
});

// GET /api/leads/:id
const getLeadById = catchAsync(async (req, res) => {
  const lead = await leadService.getLeadById(req.params.id, req.tenantId);
  return sendSuccess(res, { data: lead, message: 'Lead retrieved' });
});

// PATCH /api/leads/:id
const updateLead = catchAsync(async (req, res) => {
  const lead = await leadService.updateLead(req.params.id, req.tenantId, req.body, req.user._id);
  return sendSuccess(res, { data: lead, message: 'Lead updated' });
});

// DELETE /api/leads/:id  — soft delete
const deleteLead = catchAsync(async (req, res) => {
  await leadService.softDeleteLead(req.params.id, req.tenantId, req.user._id);
  return sendSuccess(res, { message: 'Lead deleted' });
});

// GET /api/leads/:id/score
const getLeadScore = catchAsync(async (req, res) => {
  const lead = await leadService.getLeadById(req.params.id, req.tenantId);
  const updated = await leadService.computeAndSaveScore(lead);
  return sendSuccess(res, { data: { score: updated.score }, message: 'Score computed' });
});

// POST /api/leads/:id/notes
const addNote = catchAsync(async (req, res) => {
  const { content, isInternal } = req.body;
  const lead = await leadService.addNote(req.params.id, req.tenantId, content, isInternal, req.user._id);
  return sendSuccess(res, { data: lead.notes, message: 'Note added' });
});

// POST /api/leads/:id/contact
const contactLead = catchAsync(async (req, res) => {
  const { subject, message } = req.body;
  const lead = await leadService.getLeadById(req.params.id, req.tenantId);

  // Fire email — never awaited
  leadEmail.sendContactReply(lead, {
    subject,
    message,
    agentName: req.user.name || `${req.user.firstName} ${req.user.lastName}`,
    agentEmail: req.user.email,
    agentTitle: req.user.jobTitle,
  });

  await leadService.updateLeadStatus(lead, 'contacted', `Contacted by ${req.user.email}`, req.user._id);
  return sendSuccess(res, { message: 'Email sent and lead status updated' });
});

// PATCH /api/leads/:id/status
const updateStatus = catchAsync(async (req, res) => {
  const { status: newStatus, note } = req.body;
  const lead = await leadService.getLeadById(req.params.id, req.tenantId);
  const oldStatus = lead.status;
  await leadService.updateLeadStatus(lead, newStatus, note, req.user._id);
  return sendSuccess(res, { data: { oldStatus, newStatus }, message: 'Status updated' });
});

// PATCH /api/leads/:id/hold
const holdLead = catchAsync(async (req, res) => {
  const { onHoldReason, resumeDate } = req.body;
  await leadService.putOnHold(req.params.id, req.tenantId, { onHoldReason, resumeDate }, req.user._id);
  return sendSuccess(res, { message: 'Lead put on hold' });
});

// PATCH /api/leads/:id/reopen
const reopenLead = catchAsync(async (req, res) => {
  const { note } = req.body;
  await leadService.reopenLead(req.params.id, req.tenantId, { note }, req.user._id);
  return sendSuccess(res, { message: 'Lead reopened' });
});

// PATCH /api/leads/:id/won
const markWon = catchAsync(async (req, res) => {
  const { note, closedRevenue } = req.body;
  const lead = await leadService.markWon(req.params.id, req.tenantId, { note, closedRevenue }, req.user._id);
  const reviewUrl = `${DASH}/leads/${lead._id}`;
  leadEmail.sendWonNotification(lead, {
    agentName: req.user.name || req.user.email,
    reviewUrl,
  });
  return sendSuccess(res, { message: 'Lead marked as won' });
});

// PATCH /api/leads/:id/lost
const markLost = catchAsync(async (req, res) => {
  const { lostReason, note } = req.body;
  const lead = await leadService.markLost(req.params.id, req.tenantId, { lostReason, note }, req.user._id);
  const reviewUrl = `${DASH}/leads/${lead._id}`;
  leadEmail.sendLostNotification(lead, {
    lostReason,
    agentName: req.user.name || req.user.email,
    reviewUrl,
  });
  return sendSuccess(res, { message: 'Lead marked as lost' });
});

// POST /api/leads/bulk-update
const bulkUpdate = catchAsync(async (req, res) => {
  const { ids, ...updates } = req.body;
  await Lead.bulkUpdateStatus(ids, updates, req.user._id);
  return sendSuccess(res, { message: `${ids.length} leads updated` });
});

// POST /api/leads/bulk-delete
const bulkDelete = catchAsync(async (req, res) => {
  const { ids } = req.body;
  await Lead.bulkUpdateStatus(
    ids,
    { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id },
    req.user._id
  );
  return sendSuccess(res, { message: `${ids.length} leads deleted` });
});

// GET /api/leads/spam  (admin)
const listSpam = catchAsync(async (req, res) => {
  const leads = await Lead.find({ tenantId: req.tenantId, isSpam: true }).sort({ createdAt: -1 });
  return sendSuccess(res, { data: leads, message: 'Spam leads' });
});

// PATCH /api/leads/:id/spam  (admin)
const toggleSpam = catchAsync(async (req, res) => {
  const lead = await leadService.toggleSpam(req.params.id, req.tenantId, req.user._id);
  return sendSuccess(res, { data: { isSpam: lead.isSpam }, message: 'Spam flag toggled' });
});

// DELETE /api/leads/:id/hard-delete  — hard deletes are disabled; redirected to soft-delete
const hardDelete = catchAsync(async (req, res) => {
  await leadService.softDeleteLead(req.params.id, req.tenantId, req.user._id);
  return sendSuccess(res, { message: 'Lead deleted' });
});

// PATCH /api/leads/:id/reopen-admin  (admin)
const reopenAdmin = catchAsync(async (req, res) => {
  const { note } = req.body;
  await leadService.forceReopenAdmin(req.params.id, req.tenantId, { note }, req.user._id);
  return sendSuccess(res, { message: 'Lead force-reopened by admin' });
});

// GET /api/leads/health
const healthCheck = catchAsync(async (req, res) => {
  const { apiCall } = require('../../lib/axiosCall');
  const mongoose = require('mongoose');

  const dbStatus = mongoose.connection.readyState === 1 ? 'ok' : 'down';

  let emailStatus = 'unknown';
  try {
    const result = await apiCall(`${config.email.serviceUrl}/health`, { method: 'GET' }, { timeout: 3000 });
    emailStatus = result.error ? 'degraded' : 'ok';
  } catch {
    emailStatus = 'degraded';
  }

  return res.status(200).json({
    status: 'ok',
    service: 'lead-microservice',
    version: config.app.version,
    timestamp: new Date().toISOString(),
    dependencies: {
      database: dbStatus,
      emailService: emailStatus,
    },
  });
});

module.exports = {
  submitLead,
  listLeads,
  getStats,
  exportLeads,
  searchLeads,
  getFollowUpLeads,
  getLeadById,
  updateLead,
  deleteLead,
  getLeadScore,
  addNote,
  contactLead,
  updateStatus,
  holdLead,
  reopenLead,
  markWon,
  markLost,
  bulkUpdate,
  bulkDelete,
  listSpam,
  toggleSpam,
  hardDelete,
  reopenAdmin,
  healthCheck,
};
