/**
 * Attachment Controller
 *
 * Files are uploaded via the external File Upload Microservice.
 * This controller only registers the returned URL + file ID on the lead record.
 *
 * Expected body for POST /:id/attachments:
 *   { attachments: [{ fileId, filename, url, mimetype, size }] }
 *   OR a single object: { fileId, filename, url, mimetype, size }
 */

const Lead = require('../../models/Lead');
const { catchAsync } = require('../../middleware/errorHandler');
const { sendSuccess } = require('../../utils/responseHelper');
const AppError = require('../../utils/appError');

// POST /api/leads/:id/attachments
const uploadAttachments = catchAsync(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId;

  const lead = await Lead.findOne({ _id: id, tenantId, isDeleted: false });
  if (!lead) throw AppError.notFound('Lead not found');

  // Accept either an array or a single attachment object
  const incoming = Array.isArray(req.body.attachments)
    ? req.body.attachments
    : [req.body];

  if (!incoming.length || !incoming[0].fileId) {
    throw AppError.badRequest('Provide attachments array with fileId, filename, and url');
  }

  // Prevent duplicate fileIds on the same lead
  const existingIds = new Set(lead.attachments.map((a) => a.fileId));

  const added = [];
  for (const item of incoming) {
    if (!item.fileId || !item.url || !item.filename) {
      throw AppError.badRequest(`Each attachment must include fileId, url, and filename`);
    }
    if (existingIds.has(item.fileId)) continue; // skip duplicates silently

    const entry = {
      fileId:     item.fileId,
      filename:   item.filename,
      url:        item.url,
      mimetype:   item.mimetype || null,
      size:       item.size     || null,
      uploadedAt: new Date(),
      uploadedBy: req.user._id,
    };
    lead.attachments.push(entry);
    existingIds.add(item.fileId);
    added.push(entry);
  }

  await lead.save();

  return sendSuccess(res, {
    data: lead.attachments,
    message: `${added.length} attachment(s) registered`,
  });
});

// DELETE /api/leads/:id/attachments/:fileId
// :fileId here is the MongoDB sub-document _id (not the external fileId)
const deleteAttachment = catchAsync(async (req, res) => {
  const { id, fileId } = req.params;
  const tenantId = req.tenantId;

  const lead = await Lead.findOne({ _id: id, tenantId, isDeleted: false });
  if (!lead) throw AppError.notFound('Lead not found');

  const attachIndex = lead.attachments.findIndex((a) => String(a._id) === fileId);
  if (attachIndex === -1) throw AppError.notFound('Attachment not found');

  // Note: actual file deletion on the upload microservice is the caller's responsibility
  lead.attachments.splice(attachIndex, 1);
  await lead.save();

  return sendSuccess(res, { message: 'Attachment removed' });
});

module.exports = { uploadAttachments, deleteAttachment };
