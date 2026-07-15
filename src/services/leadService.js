/**
 * Lead Service
 * All business logic lives here. Controllers call these methods only.
 */
import Lead from '../models/Lead.js';
import * as leadEmail from './leadEmailService.js';
import AppError from '../utils/appError.js';
import { config } from '../config/index.js';
import crypto from 'crypto';
import { buildProposalPdfBuffer } from '../utils/proposalPdf.js';
import { uploadFile } from '../utils/storage.js';
import logger from '../utils/logger.js';

const DASH = config.dashboard.url;

/** Helper to generate and store PDF on the backend */
async function _generateAndStoreProposalPdf(proposalData, leadNumber, req) {
  const buffer = await buildProposalPdfBuffer(proposalData);
  const fileName = `proposal-${leadNumber}-${Date.now()}.pdf`;
  return await uploadFile(buffer, fileName, 'application/pdf', req);
}

// ─── Status transition map ────────────────────────────────────────────────────

export const VALID_TRANSITIONS = {
  new:               ['contacted', 'qualified', 'disqualified', 'on_hold', 'archived'],
  contacted:         ['qualified', 'proposal_draft', 'proposal_sent', 'quotation_sent', 'disqualified', 'on_hold', 'archived'],
  qualified:         ['proposal_draft', 'proposal_sent', 'quotation_sent', 'disqualified', 'on_hold', 'archived'],
  disqualified:      [],
  proposal_draft:    ['proposal_sent', 'quotation_sent', 'archived'],
  proposal_sent:     ['proposal_sent', 'proposal_viewed', 'proposal_accepted', 'proposal_declined', 'proposal_revised', 'proposal_expired', 'negotiation', 'on_hold'],
  proposal_viewed:   ['proposal_accepted', 'proposal_declined', 'proposal_revised', 'negotiation', 'on_hold'],
  proposal_accepted: ['quotation_sent', 'contract_sent', 'negotiation', 'won'],
  proposal_declined: ['proposal_revised', 'lost', 'on_hold'],
  proposal_revised:  ['proposal_sent'],
  proposal_expired:  ['proposal_revised', 'lost', 'on_hold'],
  quotation_sent:    ['quotation_sent', 'invoice_sent', 'contract_sent', 'negotiation', 'won', 'lost'],
  invoice_sent:      ['invoice_sent', 'contract_sent', 'won', 'lost'],
  negotiation:       ['proposal_sent', 'quotation_sent', 'contract_sent', 'won', 'lost', 'on_hold'],
  contract_sent:     ['contract_signed', 'lost', 'on_hold'],
  contract_signed:   ['won'],
  won:               ['archived'],
  lost:              ['on_hold', 'archived', 'new'],
  on_hold:           ['new', 'contacted', 'qualified', 'proposal_draft', 'proposal_sent', 'negotiation'],
  archived:          [],
};

/**
 * The single entry point for all status changes.
 */
export async function updateLeadStatus(lead, newStatus, note = null, changedBy = null, agentName = '') {
  const current = lead.status;
  let targetStatus = newStatus;

  // If trying to contact lead but lead is already in an advanced status,
  // do not downgrade the status, but still run contacted side-effects.
  if (newStatus === 'contacted') {
    const advancedStatuses = [
      'qualified', 'proposal_draft', 'proposal_sent', 'proposal_viewed',
      'proposal_accepted', 'proposal_declined', 'proposal_revised', 'proposal_expired',
      'quotation_sent', 'invoice_sent', 'negotiation', 'contract_sent', 'contract_signed',
      'won'
    ];
    if (advancedStatuses.includes(current)) {
      targetStatus = current;
    }
  }

  if (current !== targetStatus) {
    const allowed = VALID_TRANSITIONS[current] || [];
    if (!allowed.includes(targetStatus)) {
      throw AppError.unprocessable(`Invalid status transition: ${current} → ${targetStatus}`);
    }
  }

  const now = new Date();
  const reviewUrl = `${DASH}/leads/${lead._id}`;
  lead.status = targetStatus;
  lead.updatedBy = changedBy;

  switch (newStatus) {
    case 'contacted':
      lead.lastContactedAt = now;
      lead.followUpCount = (lead.followUpCount || 0) + 1;
      break;
    case 'qualified':
      lead.qualifiedAt = lead.qualifiedAt || now;
      break;
    case 'disqualified':
      lead.disqualifiedAt = now;
      if (note) lead.disqualificationReason = note;
      break;
    case 'proposal_sent': {
      lead.proposalSentAt = now;
      const activeEntry = lead.proposals[lead.activeProposalVersion - 1];
      if (activeEntry) { activeEntry.sentAt = now; activeEntry.status = 'sent'; }
      break;
    }
    case 'proposal_viewed': {
      if (!lead.proposalViewedAt) lead.proposalViewedAt = now;
      const activeEntry = lead.proposals[lead.activeProposalVersion - 1];
      if (activeEntry) {
        if (!activeEntry.viewedAt) activeEntry.viewedAt = now;
        activeEntry.viewCount = (activeEntry.viewCount || 0) + 1;
        activeEntry.status = 'viewed';
      }
      break;
    }
    case 'proposal_accepted':
      lead.proposalAcceptedAt = now;
      if (lead.proposals[lead.activeProposalVersion - 1])
        lead.proposals[lead.activeProposalVersion - 1].status = 'accepted';
      break;
    case 'proposal_declined':
      lead.proposalDeclinedAt = now;
      if (note) lead.proposalDeclinedReason = note;
      if (lead.proposals[lead.activeProposalVersion - 1]) {
        lead.proposals[lead.activeProposalVersion - 1].status = 'declined';
        if (note) lead.proposals[lead.activeProposalVersion - 1].declinedReason = note;
      }
      break;
    case 'proposal_revised':
      lead.proposalRevisionCount = (lead.proposalRevisionCount || 0) + 1;
      break;
    case 'proposal_expired':
      if (lead.proposals[lead.activeProposalVersion - 1])
        lead.proposals[lead.activeProposalVersion - 1].status = 'expired';
      break;
    case 'negotiation':
      lead.lastContactedAt = now;
      break;
    case 'contract_sent':
      lead.contractSentAt = lead.contractSentAt || now;
      lead.contractSentBy = lead.contractSentBy || changedBy;
      break;
    case 'contract_signed':
      lead.contractSignedAt = now;
      break;
    case 'won':
      lead.qualifiedAt = lead.qualifiedAt || now;
      break;
    case 'on_hold':
      lead.onHoldAt = now;
      if (note) lead.onHoldReason = note;
      break;
    case 'archived':
      lead.isDeleted = true;
      lead.deletedAt = now;
      lead.deletedBy = changedBy;
      break;
    default:
      break;
  }

  lead.statusHistory.push({ status: targetStatus, pipelineStage: lead.pipelineStage, changedBy, changedAt: now, note });
  await lead.save();

  // Fire-and-forget emails
  switch (targetStatus) {
    case 'proposal_accepted':
      leadEmail.sendProposalAccepted(lead, agentName);
      leadEmail.sendAdminProposalAccepted(lead, reviewUrl);
      break;
    case 'proposal_declined':
      leadEmail.sendProposalDeclinedAck(lead, agentName);
      leadEmail.sendAdminProposalDeclined(lead, { declinedReason: note || '', reviewUrl });
      break;
    case 'proposal_expired': {
      const entry = lead.proposals[lead.activeProposalVersion - 1];
      leadEmail.sendProposalExpired(lead, { proposalNumber: entry?.proposalNumber || '', expiredAt: now, reviewUrl });
      break;
    }
    case 'contract_sent':
      leadEmail.sendContractEmail(lead, { contractUrl: lead.contractUrl || '', message: note || '', agentName });
      break;
    case 'contract_signed':
      leadEmail.sendContractSigned(lead, agentName);
      break;
    case 'won':
      leadEmail.sendWonNotification(lead, { agentName, reviewUrl });
      break;
    case 'lost':
      leadEmail.sendLostNotification(lead, { lostReason: note || '', agentName, reviewUrl });
      break;
    default:
      break;
  }

  return lead;
}

// ─── Lead CRUD ────────────────────────────────────────────────────────────────

// Signature of raw MIME/email source (headers, multipart boundaries) being pasted
// into a free-text field — a classic contact-form injection/spam-bot pattern that
// would otherwise be stored and echoed verbatim into notification emails.
const MIME_INJECTION_PATTERN = /Content-(Type|Transfer-Encoding|Disposition):|^-{2,}=?_?Part_|MIME-Version:/im;

function looksLikeMimeInjection(...fields) {
  return fields.some((f) => typeof f === 'string' && MIME_INJECTION_PATTERN.test(f));
}

export async function createLead(data, tenantId, meta = {}) {
  const { ipAddress, userAgent, source } = meta;
  // SECURITY FIX: align honeypot field with UI (hp)
  const isSpam = !!(
    (data.hp && data.hp.trim().length > 0) ||
    (data.website_url && data.website_url.trim().length > 0) ||
    looksLikeMimeInjection(data.message, data.subject)
  );
  const lead = new Lead({
    ...data,
    tenantId,
    ipAddress,
    userAgent,
    source: source || data.source || 'website',
    isSpam,
    gdprConsentAt: data.gdprConsent === true || data.gdprConsent === 'true' ? new Date() : undefined,
  });
  await lead.save();
  return lead;
}

export async function getLeads(tenantId, { page = 1, limit = 20, status, priority, source, brand, sort = 'createdAt', order = 'desc', assignedTo } = {}) {
  const query = { tenantId, isDeleted: false };
  if (status) query.status = status;
  if (priority) query.priority = priority;
  if (source) query.source = source;
  if (brand) query.brand = brand;
  if (assignedTo) query.assignedTo = assignedTo;
  return Lead.paginate(query, { page, limit, sort: { [sort]: order === 'desc' ? -1 : 1 } });
}

export async function getLeadById(id, tenantId) {
  const lead = await Lead.findOne({ _id: id, tenantId, isDeleted: false });
  if (!lead) throw AppError.notFound('Lead not found');
  return lead;
}

export async function updateLead(id, tenantId, updates, updatedBy) {
  const ALLOWED = [
    'firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle',
    'website', 'linkedIn', 'country', 'city', 'timezone',
    'subject', 'message', 'projectType', 'budget', 'requestedBudgetAmount', 'timeline', 'requirements', 'category',
    'tags', 'labels', 'customFields', 'siteKey', 'pipelineStage',
    'assignedTo', 'nextFollowUp', 'preferredContactMethod', 'preferredContactTime',
    'utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm', 'landingPage', 'externalId',
  ];

  const lead = await Lead.findOne({ _id: id, tenantId, isDeleted: false });
  if (!lead) throw AppError.notFound('Lead not found');

  const { status: newStatus, internalNotes, ...otherUpdates } = updates;

  // 1. Handle status change if provided
  if (newStatus && newStatus !== lead.status) {
    await updateLeadStatus(lead, newStatus, updates.statusNote || 'Updated via lead profile', updatedBy);
  }

  // 2. Handle internal notes if provided
  const lastInternalNote = lead.notes.filter((n) => n.isInternal).slice(-1)[0]?.content;
  if (internalNotes && internalNotes !== lastInternalNote) {
    lead.notes.push({ content: internalNotes, isInternal: true, createdBy: updatedBy, createdAt: new Date() });
  }

  // 3. Apply other allowed updates
  for (const key of ALLOWED) {
    if (otherUpdates[key] !== undefined) {
      lead[key] = otherUpdates[key];
    }
  }

  lead.updatedBy = updatedBy;
  await lead.save();
  return lead;
}

export async function softDeleteLead(id, tenantId, deletedBy) {
  const lead = await Lead.findOne({ _id: id, tenantId, isDeleted: false });
  if (!lead) throw AppError.notFound('Lead not found');
  lead.isDeleted = true;
  lead.deletedAt = new Date();
  lead.deletedBy = deletedBy;
  await lead.save();
  return lead;
}

export async function hardDeleteLead(id, tenantId, deletedBy) {
  return softDeleteLead(id, tenantId, deletedBy);
}

export async function assignLead(leadId, tenantId, assignedTo, assignedBy) {
  const lead = await Lead.findOneAndUpdate(
    { _id: leadId, tenantId, isDeleted: false },
    { $set: { assignedTo, assignedAt: new Date(), updatedBy: assignedBy } },
    { new: true }
  );
  if (!lead) throw AppError.notFound('Lead not found');
  return lead;
}

export async function addNote(leadId, tenantId, content, isInternal, createdBy) {
  const lead = await Lead.findOne({ _id: leadId, tenantId, isDeleted: false });
  if (!lead) throw AppError.notFound('Lead not found');
  lead.notes.push({ content, isInternal: !!isInternal, createdBy, createdAt: new Date() });
  await lead.save();
  return lead;
}

export async function computeAndSaveScore(lead) {
  lead.score = Lead.computeLeadScore(lead);
  await lead.save();
  return lead;
}

export async function getLeadStats(tenantId) {
  return Lead.getDashboardStats(tenantId);
}

// ─── Proposal Operations ──────────────────────────────────────────────────────

const PROPOSAL_ALLOWED_STATUSES = ['qualified', 'contacted', 'proposal_draft', 'negotiation'];

export async function sendProposal(leadId, tenantId, proposalData, sentBy, agentName = '', req = null) {
  const lead = await Lead.findOne({ _id: leadId, tenantId, isDeleted: false });
  if (!lead) throw AppError.notFound('Lead not found');
  if (!PROPOSAL_ALLOWED_STATUSES.includes(lead.status))
    throw AppError.unprocessable(`Cannot send proposal from status: ${lead.status}`);

  // Backend Atomic Generation: if no URL is provided, generate and store it now.
  let proposalUrl = proposalData.proposalUrl;
  if (!proposalUrl) {
    logger.info('Backend generating proposal PDF atomically', { leadId });
    proposalUrl = await _generateAndStoreProposalPdf(proposalData, lead.leadNumber, req);
  }

  const version = lead.proposals.length + 1;
  const proposalNumber = `P-${String(lead.leadNumber).padStart(5, '0')}-v${version}`;
  const accessKey = crypto.randomUUID();

  lead.proposals.push({
    version,
    proposalNumber,
    proposalUrl,
    accessKey,
    quotedAmount: proposalData.quotedAmount,
    quotedCurrency: proposalData.quotedCurrency || 'USD',
    breakdown: proposalData.breakdown,
    validUntil: proposalData.validUntil,
    sentAt: new Date(),
    sentBy,
    status: 'sent',
    message: proposalData.message,
    attachmentName: proposalData.attachmentName,
  });
  lead.activeProposalVersion = version;
  lead.proposalUrl = proposalUrl;
  lead.quotedAmount = proposalData.quotedAmount;
  lead.quotedCurrency = proposalData.quotedCurrency || 'USD';
  lead.quotedAt = new Date();
  lead.quotedBy = sentBy;
  lead.proposalSentAt = new Date();
  lead.proposalExpiresAt = proposalData.validUntil;

  const nextStatus = proposalData.documentType === 'quotation' ? 'quotation_sent' : 'proposal_sent';
  await updateLeadStatus(lead, nextStatus, null, sentBy, agentName);

  leadEmail.sendProposalEmail(lead, {
    proposalNumber,
    proposalUrl: `${config.dashboard.url}/proposal/view/${accessKey}`,
    pdfUrl: proposalUrl,
    quotedAmount: proposalData.quotedAmount,
    quotedCurrency: proposalData.quotedCurrency || 'USD',
    validUntil: proposalData.validUntil,
    message: proposalData.message,
    attachmentName: proposalData.attachmentName,
  });
  return lead;
}

export async function resendProposal(leadId, tenantId, messageOverride, sentBy, agentName = '') {
  const lead = await Lead.findOne({ _id: leadId, tenantId, isDeleted: false });
  if (!lead) throw AppError.notFound('Lead not found');
  const RESEND_ALLOWED = ['proposal_sent', 'proposal_viewed', 'proposal_expired'];
  if (!RESEND_ALLOWED.includes(lead.status))
    throw AppError.unprocessable(`Cannot resend proposal from status: ${lead.status}`);
  const activeEntry = lead.proposals[lead.activeProposalVersion - 1];
  if (!activeEntry) throw AppError.badRequest('No active proposal found');
  lead.proposalSentAt = new Date();
  if (activeEntry.status === 'expired') activeEntry.status = 'sent';
  lead.notes.push({ content: `Proposal v${activeEntry.version} resent`, isInternal: true, createdAt: new Date(), createdBy: sentBy });
  await lead.save();
  const trackingUrl = `${config.dashboard.url}/proposal/view/${activeEntry.accessKey}`;
  leadEmail.sendProposalEmail(lead, {
    proposalNumber: activeEntry.proposalNumber,
    proposalUrl: trackingUrl,
    pdfUrl: activeEntry.proposalUrl,
    quotedAmount: activeEntry.quotedAmount,
    quotedCurrency: activeEntry.quotedCurrency || 'USD',
    validUntil: activeEntry.validUntil,
    message: messageOverride || activeEntry.message,
    attachmentName: activeEntry.attachmentName,
  });
  return { lead, version: activeEntry.version, proposalNumber: activeEntry.proposalNumber };
}

export async function reviseProposal(leadId, tenantId, data, revisedBy, agentName = '', req = null) {
  const lead = await Lead.findOne({ _id: leadId, tenantId, isDeleted: false });
  if (!lead) throw AppError.notFound('Lead not found');
  const REVISE_ALLOWED = ['proposal_declined', 'proposal_expired', 'proposal_sent', 'proposal_viewed', 'negotiation'];
  if (!REVISE_ALLOWED.includes(lead.status))
    throw AppError.unprocessable(`Cannot revise proposal from status: ${lead.status}`);

  if (lead.proposals[lead.activeProposalVersion - 1])
    lead.proposals[lead.activeProposalVersion - 1].status = 'revised';

  // Backend Atomic Generation
  let proposalUrl = data.proposalUrl;
  if (!proposalUrl) {
    logger.info('Backend revising proposal PDF atomically', { leadId });
    proposalUrl = await _generateAndStoreProposalPdf(data, lead.leadNumber, req);
  }

  const version = lead.proposals.length + 1;
  const proposalNumber = `P-${String(lead.leadNumber).padStart(5, '0')}-v${version}`;
  const accessKey = crypto.randomUUID();

  lead.proposals.push({
    version,
    proposalNumber,
    proposalUrl,
    accessKey,
    quotedAmount: data.quotedAmount,
    quotedCurrency: data.quotedCurrency || 'USD',
    breakdown: data.breakdown,
    validUntil: data.validUntil,
    sentAt: new Date(),
    sentBy: revisedBy,
    status: 'sent',
    revisionNote: data.revisionNote,
    message: data.message,
    attachmentName: data.attachmentName,
  });

  lead.activeProposalVersion = version;
  lead.proposalUrl = proposalUrl;
  lead.quotedAmount = data.quotedAmount || lead.quotedAmount;
  lead.quotedCurrency = data.quotedCurrency || lead.quotedCurrency;
  lead.quotedAt = new Date();
  lead.proposalSentAt = new Date();
  lead.proposalExpiresAt = data.validUntil;
  lead.proposalRevisionCount = (lead.proposalRevisionCount || 0) + 1;
  lead.status = 'proposal_sent';

  lead.statusHistory.push({ status: 'proposal_revised', pipelineStage: lead.pipelineStage, changedBy: revisedBy, changedAt: new Date(), note: data.revisionNote });
  lead.statusHistory.push({ status: 'proposal_sent', pipelineStage: lead.pipelineStage, changedBy: revisedBy, changedAt: new Date(), note: `Revised version ${version} sent` });

  await lead.save();
  leadEmail.sendProposalEmail(lead, {
    proposalNumber,
    proposalUrl: `${config.dashboard.url}/proposal/view/${accessKey}`,
    pdfUrl: proposalUrl,
    quotedAmount: data.quotedAmount,
    quotedCurrency: data.quotedCurrency || 'USD',
    validUntil: data.validUntil,
    message: `[Revised] ${data.revisionNote}`,
    attachmentName: data.attachmentName,
  });
  return { lead, version, proposalNumber };
}

export async function acceptProposal(leadId, tenantId, { note } = {}, acceptedBy, agentName = '') {
  const lead = await Lead.findOne({ _id: leadId, tenantId, isDeleted: false });
  if (!lead) throw AppError.notFound('Lead not found');
  const ACCEPT_ALLOWED = ['proposal_sent', 'proposal_viewed', 'negotiation'];
  if (!ACCEPT_ALLOWED.includes(lead.status))
    throw AppError.unprocessable(`Cannot accept proposal from status: ${lead.status}`);
  await updateLeadStatus(lead, 'proposal_accepted', note, acceptedBy, agentName);
  return lead;
}

export async function declineProposal(leadId, tenantId, { declinedReason, note } = {}, declinedBy, agentName = '') {
  const lead = await Lead.findOne({ _id: leadId, tenantId, isDeleted: false });
  if (!lead) throw AppError.notFound('Lead not found');
  const DECLINE_ALLOWED = ['proposal_sent', 'proposal_viewed', 'negotiation'];
  if (!DECLINE_ALLOWED.includes(lead.status))
    throw AppError.unprocessable(`Cannot decline proposal from status: ${lead.status}`);
  lead.proposalDeclinedReason = declinedReason;
  if (lead.proposals[lead.activeProposalVersion - 1])
    lead.proposals[lead.activeProposalVersion - 1].declinedReason = declinedReason;
  await updateLeadStatus(lead, 'proposal_declined', declinedReason, declinedBy, agentName);
  return lead;
}

/** Public method for client-side acceptance via accessKey */
export async function clientAcceptProposal(accessKey, { ip, userAgent, signatureName = '' } = {}) {
  const lead = await Lead.findOne({ 'proposals.accessKey': accessKey, isDeleted: false });
  if (!lead) throw AppError.notFound('Proposal not found');

  const entry = lead.proposals.find((p) => p.accessKey === accessKey);
  if (!entry) throw AppError.notFound('Proposal version not found');

  const ACCEPT_ALLOWED = ['draft', 'sent', 'viewed']; // within the proposal itself
  if (!['proposal_sent', 'proposal_viewed', 'negotiation'].includes(lead.status)) {
    throw AppError.unprocessable(`This proposal is no longer in a state that can be accepted (status: ${lead.status}).`);
  }

  // Update entry tracking
  entry.status = 'accepted';
  entry.acceptedAt = new Date();
  entry.acceptedIp = ip;
  entry.acceptedUserAgent = userAgent;
  if (signatureName) entry.message = `[Digital Signature] ${signatureName} | ${entry.message || ''}`;

  // Update lead status
  await updateLeadStatus(lead, 'proposal_accepted', `Client accepted via secure link (IP: ${ip})`, null);

  return { lead, proposalNumber: entry.proposalNumber };
}

export async function trackProposalView(leadId, version, accessKey = null) {
  let lead;
  let entry;

  if (accessKey) {
    lead = await Lead.findOne({ 'proposals.accessKey': accessKey });
    if (!lead) throw AppError.notFound('Proposal not found');
    entry = lead.proposals.find((p) => p.accessKey === accessKey);
  } else {
    lead = await Lead.findById(leadId);
    if (!lead) throw AppError.notFound('Lead not found');
    entry = lead.proposals.find((p) => p.version === parseInt(version));
  }

  if (!entry) throw AppError.notFound('Proposal version not found');
  if (!entry.viewedAt) entry.viewedAt = new Date();
  entry.viewCount = (entry.viewCount || 0) + 1;
  if (!lead.proposalViewedAt) lead.proposalViewedAt = new Date();
  if (lead.status === 'proposal_sent') {
    lead.status = 'proposal_viewed';
    lead.statusHistory.push({ status: 'proposal_viewed', changedBy: null, changedAt: new Date(), note: 'Auto-tracked via secure view link' });
  }
  await lead.save();
  return { lead, proposalUrl: entry.proposalUrl };
}

// ─── Contract Operations ──────────────────────────────────────────────────────

export async function sendContract(leadId, tenantId, { contractUrl, message, attachmentName } = {}, sentBy, agentName = '') {
  const lead = await Lead.findOne({ _id: leadId, tenantId, isDeleted: false });
  if (!lead) throw AppError.notFound('Lead not found');
  if (lead.status !== 'proposal_accepted')
    throw AppError.unprocessable(`Cannot send contract from status: ${lead.status}`);
  lead.contractUrl = contractUrl;
  lead.contractSentBy = sentBy;
  await updateLeadStatus(lead, 'contract_sent', message, sentBy, agentName);
  return lead;
}

export async function signContract(leadId, tenantId, { note, signedDate } = {}, signedBy, agentName = '') {
  const lead = await Lead.findOne({ _id: leadId, tenantId, isDeleted: false });
  if (!lead) throw AppError.notFound('Lead not found');
  if (lead.status !== 'contract_sent')
    throw AppError.unprocessable(`Cannot sign contract from status: ${lead.status}`);
  lead.contractSignedAt = signedDate ? new Date(signedDate) : new Date();
  lead.contractNote = note;
  // Sign contract first (updates to contract_signed)
  await updateLeadStatus(lead, 'contract_signed', note, signedBy, agentName);
  // Then mark as won (updates to won, sending the Win notification)
  await updateLeadStatus(lead, 'won', note, signedBy, agentName);
  return lead;
}

// ─── Deal Outcomes ────────────────────────────────────────────────────────────

export async function markWon(leadId, tenantId, { note, closedRevenue } = {}, closedBy, agentName = '') {
  const lead = await Lead.findOne({ _id: leadId, tenantId, isDeleted: false });
  if (!lead) throw AppError.notFound('Lead not found');
  const WON_ALLOWED = ['proposal_accepted', 'contract_signed', 'negotiation'];
  if (!WON_ALLOWED.includes(lead.status))
    throw AppError.unprocessable(`Cannot mark won from status: ${lead.status}`);
  if (closedRevenue !== undefined) lead.quotedAmount = closedRevenue;
  await updateLeadStatus(lead, 'won', note, closedBy, agentName);
  return lead;
}

export async function markLost(leadId, tenantId, { lostReason, note } = {}, closedBy, agentName = '') {
  const lead = await Lead.findOne({ _id: leadId, tenantId, isDeleted: false });
  if (!lead) throw AppError.notFound('Lead not found');
  const TERMINAL = ['won', 'archived', 'disqualified'];
  if (TERMINAL.includes(lead.status))
    throw AppError.unprocessable(`Cannot mark lost from status: ${lead.status}`);
  await updateLeadStatus(lead, 'lost', lostReason || note, closedBy, agentName);
  return lead;
}

export async function putOnHold(leadId, tenantId, { onHoldReason, resumeDate } = {}, updatedBy) {
  const lead = await Lead.findOne({ _id: leadId, tenantId, isDeleted: false });
  if (!lead) throw AppError.notFound('Lead not found');
  if (resumeDate) lead.resumeDate = new Date(resumeDate);
  if (onHoldReason) lead.onHoldReason = onHoldReason;
  await updateLeadStatus(lead, 'on_hold', onHoldReason, updatedBy);
  return lead;
}

export async function reopenLead(leadId, tenantId, { note } = {}, updatedBy) {
  const lead = await Lead.findOne({ _id: leadId, tenantId });
  if (!lead) throw AppError.notFound('Lead not found');
  const REOPEN_ALLOWED = ['on_hold', 'lost'];
  if (!REOPEN_ALLOWED.includes(lead.status))
    throw AppError.unprocessable(`Use admin endpoint for reopening from status: ${lead.status}`);
  lead.reopenedAt = new Date();
  lead.reopenNote = note;
  lead.isDeleted = false;
  lead.deletedAt = null;
  await updateLeadStatus(lead, 'new', note, updatedBy);
  return lead;
}

export async function forceReopenAdmin(leadId, tenantId, { note } = {}, updatedBy) {
  const lead = await Lead.findOne({ _id: leadId, tenantId });
  if (!lead) throw AppError.notFound('Lead not found');
  lead.reopenedAt = new Date();
  lead.reopenNote = note;
  lead.status = 'new';
  lead.isDeleted = false;
  lead.deletedAt = null;
  lead.disqualifiedAt = null;
  lead.statusHistory.push({ status: 'new', changedBy: updatedBy, changedAt: new Date(), note: `Force-reopened by admin: ${note}` });
  await lead.save();
  return lead;
}

export async function expireProposal(lead) {
  const entry = lead.proposals[lead.activeProposalVersion - 1];
  const reviewUrl = `${DASH}/leads/${lead._id}`;
  lead.status = 'proposal_expired';
  if (entry) entry.status = 'expired';
  lead.statusHistory.push({ status: 'proposal_expired', changedAt: new Date(), note: 'Auto-expired by scheduler' });
  await lead.save();
  leadEmail.sendProposalExpired(lead, { proposalNumber: entry?.proposalNumber || '', expiredAt: new Date(), reviewUrl });
  return lead;
}

export async function toggleSpam(leadId, tenantId, updatedBy) {
  const lead = await Lead.findOne({ _id: leadId, tenantId });
  if (!lead) throw AppError.notFound('Lead not found');
  lead.isSpam = !lead.isSpam;
  lead.updatedBy = updatedBy;
  await lead.save();
  return lead;
}

/**
 * Cross-service account-deletion cascade: called by IAM when a staff IAM
 * user is archived or hard-deleted. Previously nothing here reacted at all
 * — a lead stayed assigned to a now-archived account forever, and the daily
 * follow-up-reminder scheduler (leadSchedulerService.runFollowUpReminders)
 * kept emailing on that account's behalf indefinitely since its query only
 * excludes leads where assignedTo doesn't exist.
 *
 * Unassigns rather than reassigns — picking a new owner is a business
 * decision this service has no basis to make; clearing assignedTo just
 * stops the stale automation and leaves the lead visible to whoever
 * re-triages unassigned leads.
 */
export async function unassignLeadsForStaff(iamUserId) {
  const result = await Lead.updateMany(
    { assignedTo: iamUserId },
    { $unset: { assignedTo: '' } },
  );
  return { unassignedCount: result.modifiedCount ?? result.nModified ?? 0 };
}
