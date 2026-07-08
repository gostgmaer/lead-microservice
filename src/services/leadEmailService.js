/**
 * Lead Email Service
 *
 * RULES:
 * 1. This is the ONLY file that calls POST {EMAIL_SERVICE_URL}/send-email for lead templates.
 * 2. All functions return a Promise — callers MUST NOT await them (fire-and-forget).
 * 3. _dispatch logs errors internally — callers do not need to handle errors.
 */
import { apiCall } from '../lib/axiosCall.js';
import logger from '../utils/logger.js';
import { config } from '../config/index.js';
import {
  LEAD_RECEIVED, LEAD_ADMIN_NOTIFICATION, LEAD_CONTACT_REPLY, LEAD_STATUS_CHANGED,
  LEAD_FOLLOW_UP_REMINDER, PROJECT_PROPOSAL_EMAIL, LEAD_PROPOSAL_ACCEPTED,
  LEAD_ADMIN_PROPOSAL_ACCEPTED, LEAD_PROPOSAL_DECLINED_ACK, LEAD_ADMIN_PROPOSAL_DECLINED,
  LEAD_PROPOSAL_EXPIRING, LEAD_PROPOSAL_EXPIRED, LEAD_CONTRACT_SENT, LEAD_CONTRACT_SIGNED,
  LEAD_WON_NOTIFICATION, LEAD_LOST_NOTIFICATION,
} from '../email/leadEmailTemplate.js';

const URL   = config.email.serviceUrl;
const KEY   = config.email.apiKey;
const ADMIN = config.email.adminEmail;
const DASH  = config.dashboard.url;
const APP_NAME = config.app.name || 'EasyDev';

// tenantId comes from the lead itself (guaranteed present now that
// TENANCY_ENABLED is on) rather than a static default — every caller below
// already has the lead object in scope.
function _dispatch(to, template, data, tenantId) {
  const resolvedTenant = tenantId || config.tenant.defaultTenantId || '';
  const idempotencyKey = `${template.toLowerCase()}-${resolvedTenant}-${to}`;
  logger.info(`[leadEmail] Dispatching ${template} to ${to}`, { idempotencyKey });
  return apiCall(
    `${URL}/email/send`,
    { method: 'POST', data: { to, template, data } },
    {
      headers: {
        'Content-Type': 'application/json',
        ...(KEY ? { 'x-api-key': KEY } : {}),
        'x-tenant-id': resolvedTenant,
        'x-app-name': APP_NAME,
        'x-app-url': DASH,
        'x-path': '/dashboard',
        'x-idempotency-key': idempotencyKey,
      },
    }
  )
    .then((result) => {
      if (result?.error) {
        logger.warn(`[leadEmail] ${template} → ${to} failed: ${result.message}`);
      } else {
        logger.info(`[leadEmail] ${template} successfully handed off to email service for ${to}`);
      }
    })
    .catch((err) => {
      logger.error(`[leadEmail] ${template} → ${to} threw: ${err.message}`);
    });
}

// ─── Inbound / Submission ─────────────────────────────────────────────────────

export function sendLeadReceived(lead) {
  return _dispatch(lead.email, LEAD_RECEIVED, {
    firstName: lead.firstName, lastName: lead.lastName,
    leadNumber: lead.leadNumberFormatted, subject: lead.subject,
    projectType: lead.projectType || 'other', budget: lead.budget, timeline: lead.timeline,
  }, lead.tenantId);
}

export function sendAdminLeadNotification(lead) {
  return _dispatch(ADMIN, LEAD_ADMIN_NOTIFICATION, {
    leadNumber: lead.leadNumberFormatted,
    firstName: lead.firstName, lastName: lead.lastName,
    email: lead.email, phone: lead.phone, company: lead.company,
    subject: lead.subject, message: lead.message,
    projectType: lead.projectType || 'other', budget: lead.budget, timeline: lead.timeline,
    source: lead.source, priority: lead.priority, score: lead.score,
    ipAddress: lead.ipAddress, submittedAt: lead.createdAt,
    reviewUrl: `${DASH}/leads/${lead._id}`,
  }, lead.tenantId);
}

// ─── Communication ────────────────────────────────────────────────────────────

export function sendContactReply(lead, { subject, message, agentName, agentEmail, agentTitle }) {
  return _dispatch(lead.email, LEAD_CONTACT_REPLY, {
    firstName: lead.firstName, lastName: lead.lastName,
    leadNumber: lead.leadNumberFormatted, subject, message,
    agentName, agentEmail, agentTitle,
  }, lead.tenantId);
}

export function sendStatusChanged(lead, { oldStatus, newStatus, note, agentName, ctaUrl }) {
  return _dispatch(lead.email, LEAD_STATUS_CHANGED, {
    firstName: lead.firstName, lastName: lead.lastName,
    leadNumber: lead.leadNumberFormatted, oldStatus, newStatus, note, agentName, ctaUrl,
  }, lead.tenantId);
}

export function sendFollowUpReminder(agentEmail, lead, agent, { followUpDate, daysSinceLastContact, notes, reviewUrl }) {
  return _dispatch(agentEmail, LEAD_FOLLOW_UP_REMINDER, {
    agentName: agent?.firstName || agentEmail,
    leadNumber: lead.leadNumberFormatted,
    leadFirstName: lead.firstName, leadLastName: lead.lastName,
    leadEmail: lead.email, leadCompany: lead.company,
    priority: lead.priority, followUpDate, daysSinceLastContact, notes, reviewUrl,
  }, lead.tenantId);
}

// ─── Proposal Lifecycle ───────────────────────────────────────────────────────

export function sendProposalEmail(lead, { proposalNumber, proposalUrl, pdfUrl, quotedAmount, quotedCurrency, validUntil, message, attachmentName }) {
  return _dispatch(lead.email, PROJECT_PROPOSAL_EMAIL, {
    clientName: `${lead.firstName} ${lead.lastName}`,
    projectName: lead.subject, proposalUrl, pdfUrl, proposalNumber,
    issueDate: new Date().toLocaleDateString(),
    validUntil, quotedAmount, quotedCurrency: quotedCurrency || lead.quotedCurrency || 'USD', message, attachmentName,
  }, lead.tenantId);
}

export function sendProposalAccepted(lead, agentName) {
  return _dispatch(lead.email, LEAD_PROPOSAL_ACCEPTED, {
    firstName: lead.firstName, leadNumber: lead.leadNumberFormatted,
    projectName: lead.subject, quotedAmount: lead.quotedAmount,
    quotedCurrency: lead.quotedCurrency, agentName,
  }, lead.tenantId);
}

export function sendAdminProposalAccepted(lead, reviewUrl) {
  return _dispatch(ADMIN, LEAD_ADMIN_PROPOSAL_ACCEPTED, {
    leadNumber: lead.leadNumberFormatted,
    firstName: lead.firstName, lastName: lead.lastName,
    email: lead.email, company: lead.company,
    projectName: lead.subject, quotedAmount: lead.quotedAmount, reviewUrl,
  }, lead.tenantId);
}

export function sendProposalDeclinedAck(lead, agentName) {
  return _dispatch(lead.email, LEAD_PROPOSAL_DECLINED_ACK, {
    firstName: lead.firstName, leadNumber: lead.leadNumberFormatted,
    projectName: lead.subject, agentName, supportEmail: ADMIN,
  }, lead.tenantId);
}

export function sendAdminProposalDeclined(lead, { declinedReason, reviewUrl }) {
  return _dispatch(ADMIN, LEAD_ADMIN_PROPOSAL_DECLINED, {
    leadNumber: lead.leadNumberFormatted,
    firstName: lead.firstName, lastName: lead.lastName,
    email: lead.email, company: lead.company, declinedReason, reviewUrl,
  }, lead.tenantId);
}

export function sendProposalExpiringSoon(lead, { proposalNumber, validUntil, daysRemaining, reviewUrl }) {
  return _dispatch(ADMIN, LEAD_PROPOSAL_EXPIRING, {
    leadNumber: lead.leadNumberFormatted,
    firstName: lead.firstName, lastName: lead.lastName,
    email: lead.email, proposalNumber, validUntil, daysRemaining, reviewUrl,
  }, lead.tenantId);
}

export function sendProposalExpired(lead, { proposalNumber, expiredAt, reviewUrl }) {
  return _dispatch(ADMIN, LEAD_PROPOSAL_EXPIRED, {
    leadNumber: lead.leadNumberFormatted,
    firstName: lead.firstName, lastName: lead.lastName,
    email: lead.email, proposalNumber, expiredAt, reviewUrl,
  }, lead.tenantId);
}

// ─── Contract Lifecycle ───────────────────────────────────────────────────────

export function sendContractEmail(lead, { contractUrl, message, agentName }) {
  return _dispatch(lead.email, LEAD_CONTRACT_SENT, {
    firstName: lead.firstName, leadNumber: lead.leadNumberFormatted,
    projectName: lead.subject, contractUrl, message, agentName,
  }, lead.tenantId);
}

export function sendContractSigned(lead, agentName) {
  return Promise.all([
    _dispatch(lead.email, LEAD_CONTRACT_SIGNED, {
      firstName: lead.firstName, leadNumber: lead.leadNumberFormatted,
      projectName: lead.subject, contractSignedAt: lead.contractSignedAt, agentName,
    }, lead.tenantId),
    _dispatch(ADMIN, LEAD_CONTRACT_SIGNED, {
      firstName: lead.firstName, leadNumber: lead.leadNumberFormatted,
      projectName: lead.subject, contractSignedAt: lead.contractSignedAt, agentName,
    }, lead.tenantId)
  ]);
}

// ─── Deal Outcome ─────────────────────────────────────────────────────────────

export function sendWonNotification(lead, { agentName, reviewUrl }) {
  return _dispatch(ADMIN, LEAD_WON_NOTIFICATION, {
    leadNumber: lead.leadNumberFormatted,
    firstName: lead.firstName, lastName: lead.lastName,
    email: lead.email, company: lead.company, projectName: lead.subject,
    quotedAmount: lead.quotedAmount, quotedCurrency: lead.quotedCurrency,
    closedAt: new Date(), agentName, reviewUrl,
  }, lead.tenantId);
}

export function sendLostNotification(lead, { lostReason, agentName, reviewUrl }) {
  return _dispatch(ADMIN, LEAD_LOST_NOTIFICATION, {
    leadNumber: lead.leadNumberFormatted,
    firstName: lead.firstName, lastName: lead.lastName,
    email: lead.email, company: lead.company, lostReason, agentName, reviewUrl,
  }, lead.tenantId);
}
