const mongoose = require('mongoose');
const Counter = require('./Counter');

// ─── Enum constants ───────────────────────────────────────────────────────────

const STATUS_ENUM = [
  'new', 'contacted', 'qualified', 'disqualified',
  'proposal_draft', 'proposal_sent', 'proposal_viewed',
  'proposal_accepted', 'proposal_declined', 'proposal_revised',
  'proposal_expired', 'negotiation', 'contract_sent', 'contract_signed',
  'won', 'lost', 'on_hold', 'archived',
];

const PRIORITY_ENUM = ['low', 'medium', 'high', 'urgent'];
const BUDGET_ENUM = ['under-5k', '5k-10k', '10k-25k', '25k-50k', '50k-100k', 'over-100k', 'not-sure'];
const TIMELINE_ENUM = ['asap', '1-month', '2-3months', '3-6months', '6months+', 'flexible'];
const PROJECT_TYPE_ENUM = ['website', 'webapp', 'mobile', 'ecommerce', 'redesign', 'maintenance', 'consulting', 'other'];
const SOURCE_ENUM = ['website', 'referral', 'social', 'email', 'api', 'import', 'manual', 'other'];
const CATEGORY_ENUM = ['General Inquiry', 'Technical Support', 'Sales', 'Partnership', 'Feedback', 'Career', 'Other'];
const CONTACT_METHOD_ENUM = ['email', 'phone', 'whatsapp', 'any'];

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

const proposalSchema = new mongoose.Schema({
  version:         { type: Number, required: true },
  proposalNumber:  { type: String },
  proposalUrl:     { type: String, required: true },
  quotedAmount:    { type: Number },
  quotedCurrency:  { type: String, default: 'USD' },
  validUntil:      { type: Date },
  sentAt:          { type: Date },
  sentBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  viewedAt:        { type: Date },
  viewCount:       { type: Number, default: 0 },
  status:          { type: String, enum: ['draft', 'sent', 'viewed', 'accepted', 'declined', 'revised', 'expired'], default: 'draft' },
  declinedReason:  { type: String },
  revisionNote:    { type: String },
  message:         { type: String },
  attachmentName:  { type: String },
  createdAt:       { type: Date, default: Date.now },
}, { _id: true });

const noteSchema = new mongoose.Schema({
  content:    { type: String, required: true, maxlength: 2000 },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt:  { type: Date, default: Date.now },
  isInternal: { type: Boolean, default: false },
}, { _id: true });

const statusHistorySchema = new mongoose.Schema({
  status:        { type: String },
  pipelineStage: { type: String },
  changedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  changedAt:     { type: Date, default: Date.now },
  note:          { type: String },
}, { _id: true });

// Attachment stored from external File Upload Microservice
const attachmentSchema = new mongoose.Schema({
  fileId:       { type: String, required: true },  // ID returned by the upload microservice
  filename:     { type: String, required: true },  // original display name
  url:          { type: String, required: true },  // public URL returned by upload microservice
  mimetype:     { type: String },
  size:         { type: Number },
  uploadedAt:   { type: Date, default: Date.now },
  uploadedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { _id: true });

// ─── Main schema ──────────────────────────────────────────────────────────────

const leadSchema = new mongoose.Schema(
  {
    // Identity
    tenantId:    { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    leadNumber:  { type: Number },
    externalId:  { type: String },

    // Contact info
    firstName:   { type: String, required: true, trim: true },
    lastName:    { type: String, required: true, trim: true },
    email:       { type: String, required: true, lowercase: true, trim: true },
    phone:       { type: String, trim: true },
    company:     { type: String, trim: true },
    jobTitle:    { type: String },
    website:     { type: String },
    linkedIn:    { type: String },
    country:     { type: String },
    city:        { type: String },
    timezone:    { type: String },

    // Qualification
    status:                  { type: String, enum: STATUS_ENUM, default: 'new', index: true },
    pipelineStage:           { type: String, default: 'New' },
    priority:                { type: String, enum: PRIORITY_ENUM, default: 'medium' },
    score:                   { type: Number, default: 0, min: 0, max: 100 },
    qualifiedAt:             { type: Date },
    disqualifiedAt:          { type: Date },
    disqualificationReason:  { type: String },
    onHoldAt:                { type: Date },
    onHoldReason:            { type: String },
    resumeDate:              { type: Date },
    reopenedAt:              { type: Date },
    reopenNote:              { type: String },

    // Project / Inquiry Details
    subject:     { type: String, required: true, trim: true },
    message:     { type: String, required: true, maxlength: 5000 },
    projectType: { type: String, enum: PROJECT_TYPE_ENUM },
    budget:      { type: String, enum: BUDGET_ENUM },
    timeline:    { type: String, enum: TIMELINE_ENUM },
    requirements:{ type: [String] },
    category:    { type: String, enum: CATEGORY_ENUM },

    // Attachments
    attachments: { type: [attachmentSchema], default: [] },

    // Assignment
    assignedTo:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedAt:  { type: Date },
    ownedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Activity
    notes:          { type: [noteSchema], default: [] },
    statusHistory:  { type: [statusHistorySchema], default: [] },
    lastContactedAt: { type: Date },
    nextFollowUp:    { type: Date },
    followUpCount:   { type: Number, default: 0 },

    // Proposal workflow — versioned array
    proposals:              { type: [proposalSchema], default: [] },
    activeProposalVersion:  { type: Number, default: 0 },
    proposalUrl:            { type: String },
    quotedAmount:           { type: Number },
    quotedCurrency:         { type: String, default: 'USD' },
    quotedAt:               { type: Date },
    quotedBy:               { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    proposalSentAt:         { type: Date },
    proposalViewedAt:       { type: Date },
    proposalAcceptedAt:     { type: Date },
    proposalDeclinedAt:     { type: Date },
    proposalDeclinedReason: { type: String },
    proposalExpiresAt:      { type: Date },
    proposalRevisionCount:  { type: Number, default: 0 },

    // Contract
    contractUrl:      { type: String },
    contractSentAt:   { type: Date },
    contractSentBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    contractSignedAt: { type: Date },
    contractNote:     { type: String },

    // Source & UTM
    source:      { type: String, enum: SOURCE_ENUM, default: 'website' },
    medium:      { type: String },
    campaign:    { type: String },
    referrer:    { type: String },
    utmSource:   { type: String },
    utmMedium:   { type: String },
    utmCampaign: { type: String },
    utmContent:  { type: String },
    utmTerm:     { type: String },
    landingPage: { type: String },

    // Consent & Compliance
    gdprConsent:            { type: Boolean, default: false },
    gdprConsentAt:          { type: Date },
    gdprVersion:            { type: String },
    marketingConsent:       { type: Boolean, default: false },
    preferredContactMethod: { type: String, enum: CONTACT_METHOD_ENUM, default: 'email' },
    preferredContactTime:   { type: String },

    // Custom
    customFields: { type: Map, of: mongoose.Schema.Types.Mixed },
    tags:         { type: [String], index: true },
    labels:       { type: [String] },
    siteKey:      { type: String },

    // Technical Metadata
    ipAddress:  { type: String },
    userAgent:  { type: String },
    isSpam:     { type: Boolean, default: false, index: true },
    spamScore:  { type: Number },

    // Soft delete
    isDeleted:  { type: Boolean, default: false, index: true },
    deletedAt:  { type: Date },
    deletedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
leadSchema.index({ tenantId: 1, email: 1 });
leadSchema.index({ tenantId: 1, status: 1 });
leadSchema.index({ tenantId: 1, createdAt: -1 });
leadSchema.index({ tenantId: 1, isDeleted: 1 });
// Scheduler query indexes
leadSchema.index({ tenantId: 1, proposalExpiresAt: 1 });
leadSchema.index({ tenantId: 1, nextFollowUp: 1 });
leadSchema.index({ tenantId: 1, resumeDate: 1 });
// Assignment & scoring
leadSchema.index({ tenantId: 1, assignedTo: 1 });
leadSchema.index({ tenantId: 1, score: -1 });
leadSchema.index({ tenantId: 1, leadNumber: 1 }, { unique: true });
// Full-text search across contact fields
leadSchema.index(
  { firstName: 'text', lastName: 'text', email: 'text', company: 'text', subject: 'text' },
  { name: 'lead_text_search' }
);

// ─── Virtuals ─────────────────────────────────────────────────────────────────
leadSchema.virtual('leadNumberFormatted').get(function () {
  return 'L-' + String(this.leadNumber).padStart(5, '0');
});

leadSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// ─── Pre-save hook ────────────────────────────────────────────────────────────
leadSchema.pre('save', async function (next) {
  // Auto-increment leadNumber
  if (this.isNew) {
    this.leadNumber = await Counter.nextSequence(`lead_${this.tenantId}`);
  }

  // Auto-set priority from budget / timeline
  const { budget, timeline } = this;
  if (budget === 'over-100k' || budget === '50k-100k') {
    this.priority = 'urgent';
  } else if (budget === '25k-50k' || timeline === 'asap') {
    this.priority = 'high';
  } else if (budget === 'under-5k' || timeline === '6months+') {
    this.priority = 'low';
  } else if (!this.priority) {
    this.priority = 'medium';
  }

  // Auto-compute lead score
  this.score = Lead.computeLeadScore(this);

  next();
});

// ─── Static Methods ───────────────────────────────────────────────────────────

leadSchema.statics.computeLeadScore = function (lead) {
  let score = 0;

  // Budget (single highest)
  const budgetMap = { 'over-100k': 30, '50k-100k': 25, '25k-50k': 18, '10k-25k': 12, '5k-10k': 6 };
  score += budgetMap[lead.budget] ?? 2;

  // Timeline (single highest)
  const timelineMap = { asap: 20, '1-month': 16, '2-3months': 12, '3-6months': 8 };
  score += timelineMap[lead.timeline] ?? 3;

  // Profile completeness
  if (lead.phone) score += 8;
  if (lead.company) score += 8;
  if (lead.projectType) score += 5;
  if (lead.requirements && lead.requirements.length > 0) score += 5;
  if (lead.website) score += 3;
  if (lead.linkedIn) score += 2;

  // Engagement
  if (lead.attachments && lead.attachments.length > 0) score += 10;
  if (lead.followUpCount >= 2) score += 5;

  // Consent
  if (lead.marketingConsent === true) score += 4;

  return Math.min(100, score);
};

leadSchema.statics.paginate = async function (query = {}, { page = 1, limit = 20, sort = { createdAt: -1 }, populate = [] } = {}) {
  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    this.find(query).sort(sort).skip(skip).limit(limit).populate(populate),
    this.countDocuments(query),
  ]);
  const pages = Math.ceil(total / limit);
  return { docs, total, page, pages, limit, hasNext: page < pages, hasPrev: page > 1 };
};

leadSchema.statics.searchLeads = async function ({ tenantId, q, status, priority, source, tags, dateFrom, dateTo, assignedTo } = {}) {
  const query = { tenantId, isDeleted: false };
  if (status) query.status = status;
  if (priority) query.priority = priority;
  if (source) query.source = source;
  if (assignedTo) query.assignedTo = assignedTo;
  if (tags && tags.length) query.tags = { $in: Array.isArray(tags) ? tags : tags.split(',') };
  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
    if (dateTo) query.createdAt.$lte = new Date(dateTo);
  }
  if (q) {
    query.$or = [
      { firstName: { $regex: q, $options: 'i' } },
      { lastName: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { company: { $regex: q, $options: 'i' } },
      { subject: { $regex: q, $options: 'i' } },
    ];
  }
  return this.find(query).sort({ createdAt: -1 }).limit(200);
};

leadSchema.statics.getDashboardStats = async function (tenantId) {
  const base = { tenantId, isDeleted: false };
  const [counts, priorityCounts, sourceCounts, projectTypeCounts, tagCounts, aggData] = await Promise.all([
    this.aggregate([
      { $match: base },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    this.aggregate([
      { $match: base },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]),
    this.aggregate([
      { $match: base },
      { $group: { _id: '$source', count: { $sum: 1 } } },
    ]),
    this.aggregate([
      { $match: base },
      { $group: { _id: '$projectType', count: { $sum: 1 } } },
    ]),
    this.aggregate([
      { $match: { ...base, tags: { $exists: true, $ne: [] } } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    this.aggregate([
      { $match: base },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          avgScore: { $avg: '$score' },
          avgQuoted: { $avg: '$quotedAmount' },
          totalWonRevenue: {
            $sum: {
              $cond: [{ $eq: ['$status', 'won'] }, { $ifNull: ['$quotedAmount', 0] }, 0],
            },
          },
        },
      },
    ]),
  ]);

  const statusMap = Object.fromEntries(counts.map((c) => [c._id, c.count]));
  const total = aggData[0]?.total || 0;
  const won = statusMap['won'] || 0;

  const proposalStatuses = ['proposal_draft', 'proposal_sent', 'proposal_viewed', 'proposal_accepted', 'proposal_declined', 'proposal_revised', 'proposal_expired'];
  const inProposalStage = proposalStatuses.reduce((a, s) => a + (statusMap[s] || 0), 0);
  const inContractStage = (statusMap['contract_sent'] || 0) + (statusMap['contract_signed'] || 0);

  return {
    overview: {
      total,
      new: statusMap['new'] || 0,
      contacted: statusMap['contacted'] || 0,
      qualified: statusMap['qualified'] || 0,
      inProposalStage,
      inContractStage,
      won,
      lost: statusMap['lost'] || 0,
      onHold: statusMap['on_hold'] || 0,
      archived: statusMap['archived'] || 0,
      conversionRate: total ? `${((won / total) * 100).toFixed(2)}%` : '0.00%',
    },
    proposalFunnel: {
      draft: statusMap['proposal_draft'] || 0,
      sent: statusMap['proposal_sent'] || 0,
      viewed: statusMap['proposal_viewed'] || 0,
      accepted: statusMap['proposal_accepted'] || 0,
      declined: statusMap['proposal_declined'] || 0,
      revised: statusMap['proposal_revised'] || 0,
      expired: statusMap['proposal_expired'] || 0,
      viewRate: statusMap['proposal_sent'] ? `${(((statusMap['proposal_viewed'] || 0) / statusMap['proposal_sent']) * 100).toFixed(2)}%` : '0.00%',
      acceptanceRate: inProposalStage ? `${(((statusMap['proposal_accepted'] || 0) / inProposalStage) * 100).toFixed(2)}%` : '0.00%',
      declineRate: inProposalStage ? `${(((statusMap['proposal_declined'] || 0) / inProposalStage) * 100).toFixed(2)}%` : '0.00%',
    },
    byPriority: Object.fromEntries(priorityCounts.map((c) => [c._id, c.count])),
    bySource: Object.fromEntries(sourceCounts.map((c) => [c._id, c.count])),
    byProjectType: Object.fromEntries(projectTypeCounts.map((c) => [c._id, c.count])),
    averageScore: Math.round(aggData[0]?.avgScore || 0),
    averageQuotedAmount: Math.round(aggData[0]?.avgQuoted || 0),
    totalWonRevenue: aggData[0]?.totalWonRevenue || 0,
    topTags: tagCounts.map((c) => ({ tag: c._id, count: c.count })),
  };
};

leadSchema.statics.bulkUpdateStatus = async function (ids, updates, updatedBy) {
  return this.updateMany({ _id: { $in: ids } }, { $set: { ...updates, updatedBy } });
};

leadSchema.statics.countByTenant = function (tenantId) {
  return this.countDocuments({ tenantId, isDeleted: false });
};

leadSchema.statics.findDueForFollowUp = function (tenantId) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return this.find({ tenantId, isDeleted: false, nextFollowUp: { $lte: today }, status: { $nin: ['won', 'lost', 'archived', 'disqualified'] } });
};

leadSchema.statics.findExpiredProposals = function (tenantId) {
  return this.find({
    tenantId,
    isDeleted: false,
    status: { $in: ['proposal_sent', 'proposal_viewed'] },
    proposalExpiresAt: { $lt: new Date() },
  });
};

leadSchema.statics.exportToCSV = async function (tenantId, filters = {}) {
  const query = { tenantId, isDeleted: false, ...filters };
  const leads = await this.find(query).lean();
  return leads.map((l) => ({
    leadNumber: `L-${String(l.leadNumber).padStart(5, '0')}`,
    firstName: l.firstName,
    lastName: l.lastName,
    email: l.email,
    phone: l.phone || '',
    company: l.company || '',
    jobTitle: l.jobTitle || '',
    subject: l.subject,
    status: l.status,
    priority: l.priority,
    score: l.score,
    budget: l.budget || '',
    timeline: l.timeline || '',
    projectType: l.projectType || '',
    source: l.source || '',
    tags: (l.tags || []).join(';'),
    quotedAmount: l.quotedAmount || '',
    quotedCurrency: l.quotedCurrency || 'USD',
    pipelineStage: l.pipelineStage || '',
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  }));
};

leadSchema.statics.getTimeSeries = async function (tenantId, groupBy = 'day') {
  const groupFormat = { day: '%Y-%m-%d', week: '%Y-%U', month: '%Y-%m' }[groupBy] || '%Y-%m-%d';
  return this.aggregate([
    { $match: { tenantId, isDeleted: false } },
    { $group: { _id: { $dateToString: { format: groupFormat, date: '$createdAt' } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $project: { date: '$_id', count: 1, _id: 0 } },
  ]);
};

leadSchema.statics.getProposalFunnelStats = async function (tenantId) {
  const base = { tenantId, isDeleted: false };
  const now = new Date();

  const [statusCounts, expiringSoon, declineReasons, avgData] = await Promise.all([
    this.aggregate([
      { $match: base },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    this.find({
      tenantId, isDeleted: false,
      status: { $in: ['proposal_sent', 'proposal_viewed'] },
      proposalExpiresAt: { $gte: now, $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    }).select('leadNumber firstName email proposalExpiresAt activeProposalVersion proposals').lean(),
    this.aggregate([
      { $match: { ...base, proposalDeclinedReason: { $exists: true, $ne: '' } } },
      { $group: { _id: '$proposalDeclinedReason', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    this.aggregate([
      { $match: { ...base, status: 'proposal_accepted', proposalAcceptedAt: { $exists: true }, proposalSentAt: { $exists: true } } },
      {
        $group: {
          _id: null,
          avgDaysToAccept: {
            $avg: { $divide: [{ $subtract: ['$proposalAcceptedAt', '$proposalSentAt'] }, 86400000] },
          },
          avgRevisionCount: { $avg: '$proposalRevisionCount' },
        },
      },
    ]),
  ]);

  const sm = Object.fromEntries(statusCounts.map((c) => [c._id, c.count]));
  const sent = sm['proposal_sent'] || 0;
  const viewed = sm['proposal_viewed'] || 0;
  const accepted = sm['proposal_accepted'] || 0;
  const declined = sm['proposal_declined'] || 0;
  const expired = sm['proposal_expired'] || 0;
  const totalSent = sent + viewed + accepted + declined + expired;

  return {
    totalProposalsSent: totalSent,
    totalRevisions: 0,
    viewRate: totalSent ? `${((viewed / totalSent) * 100).toFixed(2)}%` : '0.00%',
    acceptanceRate: totalSent ? `${((accepted / totalSent) * 100).toFixed(2)}%` : '0.00%',
    declineRate: totalSent ? `${((declined / totalSent) * 100).toFixed(2)}%` : '0.00%',
    expiryRate: totalSent ? `${((expired / totalSent) * 100).toFixed(2)}%` : '0.00%',
    avgDaysToAccept: Math.round(avgData[0]?.avgDaysToAccept || 0),
    avgDaysToDecline: 0,
    avgRevisionCount: Math.round(avgData[0]?.avgRevisionCount || 0),
    expiringSoon: expiringSoon.map((l) => ({
      leadId: l._id,
      leadNumber: `L-${String(l.leadNumber).padStart(5, '0')}`,
      firstName: l.firstName,
      email: l.email,
      validUntil: l.proposalExpiresAt,
      daysRemaining: Math.ceil((new Date(l.proposalExpiresAt) - now) / 86400000),
    })),
    topDeclineReasons: declineReasons.map((r) => ({ reason: r._id, count: r.count })),
  };
};

const Lead = mongoose.models.Lead || mongoose.model('Lead', leadSchema);

module.exports = Lead;
module.exports.STATUS_ENUM = STATUS_ENUM;
module.exports.PRIORITY_ENUM = PRIORITY_ENUM;
module.exports.BUDGET_ENUM = BUDGET_ENUM;
module.exports.TIMELINE_ENUM = TIMELINE_ENUM;
module.exports.PROJECT_TYPE_ENUM = PROJECT_TYPE_ENUM;
module.exports.SOURCE_ENUM = SOURCE_ENUM;
module.exports.CATEGORY_ENUM = CATEGORY_ENUM;
module.exports.CONTACT_METHOD_ENUM = CONTACT_METHOD_ENUM;
