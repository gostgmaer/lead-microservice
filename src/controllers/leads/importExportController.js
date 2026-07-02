/**
 * Import / Export Controller
 */
import { parse } from 'csv-parse/sync';
import Lead from '../../models/Lead.js';
import Counter from '../../models/Counter.js';
import { catchAsync } from '../../middleware/errorHandler.js';
import { sendSuccess } from '../../utils/responseHelper.js';
import AppError from '../../utils/appError.js';
import logger from '../../utils/logger.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/leads/import
export const importLeads = catchAsync(async (req, res) => {
  if (!req.file) throw AppError.badRequest('CSV file is required (field: file)');

  let rows;
  try {
    rows = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    throw AppError.badRequest(`CSV parse error: ${err.message}`);
  }

  const tenantId = req.tenantId;
  const toInsert = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    if (!row.firstName || !row.lastName || !row.email || !row.subject || !row.message) {
      errors.push({ row: rowNum, error: 'Missing required fields (firstName, lastName, email, subject, message)' });
      continue;
    }
    if (!EMAIL_REGEX.test(row.email)) {
      errors.push({ row: rowNum, error: `Invalid email: ${row.email}` });
      continue;
    }

    const leadData = {
      tenantId,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email.toLowerCase().trim(),
      phone: row.phone || undefined,
      company: row.company || undefined,
      subject: row.subject,
      message: row.message,
      source: row.source || 'import',
      tags: row.tags ? row.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      gdprConsent: true,
      gdprConsentAt: new Date(),
      createdBy: req.user.id,
    };

    // Run schema validation on model instance synchronously before batching
    const tempLead = new Lead(leadData);
    const validationError = tempLead.validateSync();
    if (validationError) {
      errors.push({
        row: rowNum,
        error: Object.values(validationError.errors).map(e => e.message).join(', ')
      });
      continue;
    }

    toInsert.push(leadData);
  }

  let imported = 0;
  if (toInsert.length > 0) {
    try {
      // Reserve sequence IDs atomically for the batch
      const nextSeq = await Counter.findOneAndUpdate(
        { name: `lead_${tenantId}` },
        { $inc: { seq: toInsert.length } },
        { new: true, upsert: true }
      );
      const startSeq = nextSeq.seq - toInsert.length + 1;

      // Populate leadNumber, priority, and score prior to bulk write
      for (let i = 0; i < toInsert.length; i++) {
        toInsert[i].leadNumber = startSeq + i;
        toInsert[i].priority = toInsert[i].priority || 'medium';
        toInsert[i].score = Lead.computeLeadScore(toInsert[i]);
      }

      const result = await Lead.insertMany(toInsert, { ordered: false });
      imported = result.length;
    } catch (err) {
      // Handle bulk write errors gracefully, recording per-row errors
      if (err.name === 'BulkWriteError' || err.name === 'MongoBulkWriteError' || err.writeErrors) {
        imported = err.result?.nInserted || 0;
        if (err.writeErrors) {
          err.writeErrors.forEach((we) => {
            errors.push({ row: we.index + 2, error: we.errmsg || 'Insert failed' });
          });
        }
        logger.warn(`[importLeads] Partial insert: ${imported} ok, ${errors.length} errors`);
      } else {
        // Rethrow unexpected database/connection/schema errors to catchAsync
        logger.error(`[importLeads] Unexpected error: ${err.message}`, err);
        throw err;
      }
    }
  }

  return sendSuccess(res, {
    data: { imported, skipped: rows.length - toInsert.length, errors },
    message: `Import complete: ${imported} imported, ${errors.length} errors`,
  });
});
