import { catchAsync } from '../middleware/errorHandler.js';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/responseHelper.js';
import { NotFoundError } from '../utils/errors.js';
import Contact from '../models/Contact.js';
import logger from '../utils/logger.js';
import { getPaginationParams, getPaginationMeta } from '../utils/pagination.js';

// POST /api/contact/submit (public)
export const submitContact = catchAsync(async (req, res) => {
  const { name, email, phone, companyName, message, preferredContactMethod, newsletterOptIn, privacyConsent } = req.body;

  const contact = await Contact.create({
    tenantId: req.tenantId,
    name,
    email: email.toLowerCase(),
    phone,
    companyName,
    message,
    preferredContactMethod: preferredContactMethod || 'email',
    newsletterOptIn: !!newsletterOptIn,
    privacyConsent: privacyConsent === true || privacyConsent === 'true',
    source: req.body.source === 'homepage' ? 'homepage' : 'contact_page',
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });

  logger.info('Contact message received', { id: contact._id, email: contact.email, tenantId: req.tenantId });

  // NOTE: no admin/confirmation email is dispatched yet — this service's
  // sendEmail() calls out to notification-service by templateId, and no
  // CONTACT_RECEIVED template is confirmed to exist there. Wiring one up
  // blind (the way the fabricated AggregateRating in the marketing site was
  // added to "fill a gap") would risk a silent delivery failure. Add the
  // sendEmail() call here once a real template is provisioned.

  return sendCreated(res, {
    data: { id: contact._id },
    message: 'Thank you for reaching out. We will get back to you shortly.',
  });
});

// GET /api/contact (protected, list)
export const listContacts = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPaginationParams(req);
  const { status, search, sort = 'createdAt', order = 'desc' } = req.query;

  const filter = { tenantId: req.tenantId, isDeleted: { $ne: true } };
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { companyName: { $regex: search, $options: 'i' } },
    ];
  }

  const total = await Contact.countDocuments(filter);
  const contacts = await Contact.find(filter)
    .sort({ [sort]: order === 'asc' ? 1 : -1 })
    .skip(skip)
    .limit(limit);

  return sendPaginated(res, {
    docs: contacts,
    message: 'Contact messages retrieved successfully',
    page,
    pageSize: limit,
    totalRecords: total,
    totalPages: getPaginationMeta(total, page, limit).totalPages,
    hasNext: skip + contacts.length < total,
    hasPrev: page > 1,
  });
});

// GET /api/contact/stats (protected)
export const getContactStats = catchAsync(async (req, res) => {
  const stats = await Contact.getStats(req.tenantId);
  return sendSuccess(res, { data: stats, message: 'Contact stats retrieved' });
});

// GET /api/contact/:id (protected)
export const getContactById = catchAsync(async (req, res) => {
  const contact = await Contact.findOne({ _id: req.params.id, tenantId: req.tenantId, isDeleted: { $ne: true } });
  if (!contact) throw new NotFoundError('Contact message');

  // Auto-mark as read the first time an admin opens it
  await contact.markRead();

  return sendSuccess(res, { data: contact, message: 'Contact message retrieved' });
});

// PATCH /api/contact/:id/status (protected)
export const updateContactStatus = catchAsync(async (req, res) => {
  const { status, note } = req.body;
  const contact = await Contact.findOne({ _id: req.params.id, tenantId: req.tenantId, isDeleted: { $ne: true } });
  if (!contact) throw new NotFoundError('Contact message');

  if (status === 'responded') {
    await contact.markResponded(req.user?.email, note);
  } else {
    contact.status = status;
    if (note) contact.adminNote = note;
    await contact.save();
  }

  logger.info('Contact status updated', { id: contact._id, status, updatedBy: req.user?.email });

  return sendSuccess(res, { data: contact, message: 'Contact message updated' });
});

// DELETE /api/contact/:id (protected, soft delete)
export const deleteContact = catchAsync(async (req, res) => {
  const contact = await Contact.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId, isDeleted: { $ne: true } },
    { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.id } },
    { new: true }
  );
  if (!contact) throw new NotFoundError('Contact message');

  logger.info('Contact message deleted', { id: contact._id, deletedBy: req.user?.email });

  return sendSuccess(res, { data: {}, message: 'Contact message deleted successfully' });
});
