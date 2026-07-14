import mongoose from 'mongoose';

// ─── Enum constants ───────────────────────────────────────────────────────────
// Deliberately separate from Lead's STATUS_ENUM/CONTACT_METHOD_ENUM — a contact
// message is a simple "someone wants to reach us" inquiry, not a sales lead
// moving through a pipeline (budget/timeline/proposal/contract). Keeping the
// two resources on their own schema stops project-scoping fields (budget,
// timeline, services interested, attachments) from leaking back onto the
// plain contact form the way they had before this was split out.
export const STATUS_ENUM = ['new', 'read', 'responded', 'archived'];
export const CONTACT_METHOD_ENUM = ['email', 'phone', 'whatsapp'];
export const SOURCE_ENUM = ['contact_page', 'homepage', 'other'];

const contactSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, trim: true, index: true },

  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    match: [/^\w+([.+-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
  },
  phone: { type: String, trim: true },
  companyName: { type: String, trim: true, maxlength: [100, 'Company name cannot exceed 100 characters'] },

  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    maxlength: [2000, 'Message cannot exceed 2000 characters'],
  },

  preferredContactMethod: { type: String, enum: CONTACT_METHOD_ENUM, default: 'email' },
  newsletterOptIn: { type: Boolean, default: false },
  privacyConsent: { type: Boolean, required: true },

  source: { type: String, enum: SOURCE_ENUM, default: 'contact_page' },
  status: { type: String, enum: STATUS_ENUM, default: 'new', index: true },

  // Admin triage
  respondedAt: { type: Date },
  respondedBy: { type: String },
  adminNote: { type: String, maxlength: 2000 },

  // Metadata
  ipAddress: { type: String },
  userAgent: { type: String },

  // Soft-delete (same convention as Newsletter/Lead)
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: String, default: null },
}, {
  timestamps: true,
});

contactSchema.index({ tenantId: 1, status: 1 });
contactSchema.index({ tenantId: 1, createdAt: -1 });
contactSchema.index({ tenantId: 1, isDeleted: 1 });
contactSchema.index({ tenantId: 1, email: 1 });

contactSchema.methods.markRead = async function () {
  if (this.status === 'new') this.status = 'read';
  return this.save();
};

contactSchema.methods.markResponded = async function (respondedBy, note) {
  this.status = 'responded';
  this.respondedAt = new Date();
  if (respondedBy) this.respondedBy = respondedBy;
  if (note) this.adminNote = note;
  return this.save();
};

contactSchema.statics.getStats = async function (tenantId) {
  const stats = await this.aggregate([
    { $match: { tenantId, isDeleted: { $ne: true } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        new: { $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] } },
        read: { $sum: { $cond: [{ $eq: ['$status', 'read'] }, 1, 0] } },
        responded: { $sum: { $cond: [{ $eq: ['$status', 'responded'] }, 1, 0] } },
        archived: { $sum: { $cond: [{ $eq: ['$status', 'archived'] }, 1, 0] } },
      },
    },
  ]);
  return stats[0] || { total: 0, new: 0, read: 0, responded: 0, archived: 0 };
};

const Contact = mongoose.model('Contact', contactSchema);

export default Contact;
