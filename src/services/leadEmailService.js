/**
 * Lead Email Service
 *
 * RULES:
 * 1. This is the ONLY file in the microservice that calls POST /send-email.
 * 2. All email functions return a Promise — callers MUST NOT await them (fire-and-forget).
 * 3. _dispatch already logs all errors internally — callers do not need to handle errors.
 */

const { apiCall } = require('../lib/axiosCall');
const logger = require('../middleware/logger');
const config = require('../config/setting');

const URL = config.email.serviceUrl;
const KEY = config.email.apiKey;
const ADMIN = config.email.adminEmail;
const DASH = config.dashboard.url;

/**
 * Internal dispatcher — the ONE place /send-email is called.
 * @returns {Promise<void>}
 */
function _dispatch(to, template, data) {
  return apiCall(
    `${URL}/send-email`,
    { method: 'POST', data: { to, template, data } },
    { headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } }
  )
    .then((result) => {
      if (result?.error) {
        logger.warn(`[leadEmail] ${template} → ${to} failed: ${result.message}`);
      }
    })
    .catch((err) => {
      logger.error(`[leadEmail] ${template} → ${to} threw: ${err.message}`);
    });
}

// ─── Inbound / Submission ─────────────────────────────────────────────────────

function sendLeadReceived(lead) {
  return _dispatch(lead.email, 'LEAD_RECEIVED', {
    firstName: lead.firstName,
    lastName: lead.lastName,
    leadNumber: lead.leadNumberFormatted,
    subject: lead.subject,
    projectType: lead.projectType,
    budget: lead.budget,
    timeline: lead.timeline,
  });
}

function sendAdminLeadNotification(lead) {
  return _dispatch(ADMIN, 'LEAD_ADMIN_NOTIFICATION', {
    leadNumber: lead.leadNumberFormatted,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
    subject: lead.subject,
    message: lead.message,
    projectType: lead.projectType,
    budget: lead.budget,
    timeline: lead.timeline,
    source: lead.source,
    priority: lead.priority,
    score: lead.score,
    ipAddress: lead.ipAddress,
    submittedAt: lead.createdAt,
    reviewUrl: `${DASH}/leads/${lead._id}`,
  });
}

// ─── Communication ────────────────────────────────────────────────────────────

function sendContactReply(lead, { subject, message, agentName, agentEmail, agentTitle }) {
  return _dispatch(lead.email, 'LEAD_CONTACT_REPLY', {
    firstName: lead.firstName,
    lastName: lead.lastName,
    leadNumber: lead.leadNumberFormatted,
    subject,
    message,
    agentName,
    agentEmail,
    agentTitle,
  });
}

function sendStatusChanged(lead, { oldStatus, newStatus, note, agentName, ctaUrl }) {
  return _dispatch(lead.email, 'LEAD_STATUS_CHANGED', {
    firstName: lead.firstName,
    lastName: lead.lastName,
    leadNumber: lead.leadNumberFormatted,
    oldStatus,
    newStatus,
    note,
    agentName,
    ctaUrl,
  });
}

function sendFollowUpReminder(agentEmail, lead, agent, { followUpDate, daysSinceLastContact, notes, reviewUrl }) {
  return _dispatch(agentEmail, 'LEAD_FOLLOW_UP_REMINDER', {
    agentName: agent?.firstName || agentEmail,
    leadNumber: lead.leadNumberFormatted,
    leadFirstName: lead.firstName,
    leadLastName: lead.lastName,
    leadEmail: lead.email,
    leadCompany: lead.company,
    priority: lead.priority,
    followUpDate,
    daysSinceLastContact,
    notes,
    reviewUrl,
  });
}

// ─── Proposal Lifecycle ───────────────────────────────────────────────────────

function sendProposalEmail(lead, { proposalNumber, proposalUrl, quotedAmount, validUntil, message, attachmentName }) {
  return _dispatch(lead.email, 'PROJECT_PROPOSAL_EMAIL', {
    clientName: `${lead.firstName} ${lead.lastName}`,
    projectName: lead.subject,
    proposalUrl,
    proposalNumber,
    issueDate: new Date().toLocaleDateString(),
    validUntil,
    quotedAmount,
    message,
    attachmentName,
  });
}

function sendProposalAccepted(lead, agentName) {
  return _dispatch(lead.email, 'LEAD_PROPOSAL_ACCEPTED', {
    firstName: lead.firstName,
    leadNumber: lead.leadNumberFormatted,
    projectName: lead.subject,
    quotedAmount: lead.quotedAmount,
    quotedCurrency: lead.quotedCurrency,
    agentName,
  });
}

function sendAdminProposalAccepted(lead, reviewUrl) {
  return _dispatch(ADMIN, 'LEAD_ADMIN_PROPOSAL_ACCEPTED', {
    leadNumber: lead.leadNumberFormatted,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    company: lead.company,
    projectName: lead.subject,
    quotedAmount: lead.quotedAmount,
    reviewUrl,
  });
}

function sendProposalDeclinedAck(lead, agentName) {
  return _dispatch(lead.email, 'LEAD_PROPOSAL_DECLINED_ACK', {
    firstName: lead.firstName,
    leadNumber: lead.leadNumberFormatted,
    projectName: lead.subject,
    agentName,
    supportEmail: ADMIN,
  });
}

function sendAdminProposalDeclined(lead, { declinedReason, reviewUrl }) {
  return _dispatch(ADMIN, 'LEAD_ADMIN_PROPOSAL_DECLINED', {
    leadNumber: lead.leadNumberFormatted,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    company: lead.company,
    declinedReason,
    reviewUrl,
  });
}

function sendProposalExpiringSoon(lead, { proposalNumber, validUntil, daysRemaining, reviewUrl }) {
  return _dispatch(ADMIN, 'LEAD_PROPOSAL_EXPIRING', {
    leadNumber: lead.leadNumberFormatted,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    proposalNumber,
    validUntil,
    daysRemaining,
    reviewUrl,
  });
}

function sendProposalExpired(lead, { proposalNumber, expiredAt, reviewUrl }) {
  return _dispatch(ADMIN, 'LEAD_PROPOSAL_EXPIRED', {
    leadNumber: lead.leadNumberFormatted,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    proposalNumber,
    expiredAt,
    reviewUrl,
  });
}

// ─── Contract Lifecycle ───────────────────────────────────────────────────────

function sendContractEmail(lead, { contractUrl, message, agentName }) {
  return _dispatch(lead.email, 'LEAD_CONTRACT_SENT', {
    firstName: lead.firstName,
    leadNumber: lead.leadNumberFormatted,
    projectName: lead.subject,
    contractUrl,
    message,
    agentName,
  });
}

function sendContractSigned(lead, agentName) {
  _dispatch(lead.email, 'LEAD_CONTRACT_SIGNED', {
    firstName: lead.firstName,
    leadNumber: lead.leadNumberFormatted,
    projectName: lead.subject,
    contractSignedAt: lead.contractSignedAt,
    agentName,
  });
  _dispatch(ADMIN, 'LEAD_CONTRACT_SIGNED', {
    firstName: lead.firstName,
    leadNumber: lead.leadNumberFormatted,
    projectName: lead.subject,
    contractSignedAt: lead.contractSignedAt,
    agentName,
  });
}

// ─── Deal Outcome ─────────────────────────────────────────────────────────────

function sendWonNotification(lead, { agentName, reviewUrl }) {
  return _dispatch(ADMIN, 'LEAD_WON_NOTIFICATION', {
    leadNumber: lead.leadNumberFormatted,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    company: lead.company,
    projectName: lead.subject,
    quotedAmount: lead.quotedAmount,
    quotedCurrency: lead.quotedCurrency,
    closedAt: new Date(),
    agentName,
    reviewUrl,
  });
}

function sendLostNotification(lead, { lostReason, agentName, reviewUrl }) {
  return _dispatch(ADMIN, 'LEAD_LOST_NOTIFICATION', {
    leadNumber: lead.leadNumberFormatted,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    company: lead.company,
    lostReason,
    agentName,
    reviewUrl,
  });
}

module.exports = {
  sendLeadReceived,
  sendAdminLeadNotification,
  sendContactReply,
  sendStatusChanged,
  sendFollowUpReminder,
  sendProposalEmail,
  sendProposalAccepted,
  sendAdminProposalAccepted,
  sendProposalDeclinedAck,
  sendAdminProposalDeclined,
  sendProposalExpiringSoon,
  sendProposalExpired,
  sendContractEmail,
  sendContractSigned,
  sendWonNotification,
  sendLostNotification,
};
