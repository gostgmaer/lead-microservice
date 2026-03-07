/**
 * Lead Email Template Registry
 * All lead-microservice email templates are defined here.
 * Template IDs match the exact export name passed to the Email Microservice.
 */

// ─── Inbound / Submission ─────────────────────────────────────────────────────

const LEAD_RECEIVED = 'LEAD_RECEIVED';
const LEAD_ADMIN_NOTIFICATION = 'LEAD_ADMIN_NOTIFICATION';

// ─── Communication ────────────────────────────────────────────────────────────

const LEAD_CONTACT_REPLY = 'LEAD_CONTACT_REPLY';
const LEAD_FOLLOW_UP_REMINDER = 'LEAD_FOLLOW_UP_REMINDER';
const LEAD_STATUS_CHANGED = 'LEAD_STATUS_CHANGED';

// ─── Proposal Workflow ────────────────────────────────────────────────────────

const PROJECT_PROPOSAL_EMAIL = 'PROJECT_PROPOSAL_EMAIL';
const LEAD_PROPOSAL_ACCEPTED = 'LEAD_PROPOSAL_ACCEPTED';
const LEAD_ADMIN_PROPOSAL_ACCEPTED = 'LEAD_ADMIN_PROPOSAL_ACCEPTED';
const LEAD_PROPOSAL_DECLINED_ACK = 'LEAD_PROPOSAL_DECLINED_ACK';
const LEAD_ADMIN_PROPOSAL_DECLINED = 'LEAD_ADMIN_PROPOSAL_DECLINED';
const LEAD_PROPOSAL_EXPIRING = 'LEAD_PROPOSAL_EXPIRING';
const LEAD_PROPOSAL_EXPIRED = 'LEAD_PROPOSAL_EXPIRED';

// ─── Contract Workflow ────────────────────────────────────────────────────────

const LEAD_CONTRACT_SENT = 'LEAD_CONTRACT_SENT';
const LEAD_CONTRACT_SIGNED = 'LEAD_CONTRACT_SIGNED';

// ─── Deal Outcome ─────────────────────────────────────────────────────────────

const LEAD_WON_NOTIFICATION = 'LEAD_WON_NOTIFICATION';
const LEAD_LOST_NOTIFICATION = 'LEAD_LOST_NOTIFICATION';

module.exports = {
  LEAD_RECEIVED,
  LEAD_ADMIN_NOTIFICATION,
  LEAD_CONTACT_REPLY,
  LEAD_FOLLOW_UP_REMINDER,
  LEAD_STATUS_CHANGED,
  PROJECT_PROPOSAL_EMAIL,
  LEAD_PROPOSAL_ACCEPTED,
  LEAD_ADMIN_PROPOSAL_ACCEPTED,
  LEAD_PROPOSAL_DECLINED_ACK,
  LEAD_ADMIN_PROPOSAL_DECLINED,
  LEAD_PROPOSAL_EXPIRING,
  LEAD_PROPOSAL_EXPIRED,
  LEAD_CONTRACT_SENT,
  LEAD_CONTRACT_SIGNED,
  LEAD_WON_NOTIFICATION,
  LEAD_LOST_NOTIFICATION,
};
