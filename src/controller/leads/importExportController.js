/**
 * Import / Export Controller
 * Handles CSV import and export of leads.
 */

const { parse } = require('csv-parse/sync');
const Lead = require('../../models/Lead');
const { catchAsync } = require('../../middleware/errorHandler');
const { sendSuccess } = require('../../utils/responseHelper');
const AppError = require('../../utils/appError');
const logger = require('../../middleware/logger');

// GET /api/leads/export — also handled in core controller for simple cases
// POST /api/leads/import
const importLeads = catchAsync(async (req, res) => {
  if (!req.file) throw AppError.badRequest('CSV file is required (field: file)');

  let rows;
  try {
    rows = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    throw AppError.badRequest(`CSV parse error: ${err.message}`);
  }

  const tenantId = req.tenantId;
  const toInsert = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-based + header

    if (!row.firstName || !row.lastName || !row.email || !row.subject || !row.message) {
      errors.push({ row: rowNum, error: 'Missing required fields (firstName, lastName, email, subject, message)' });
      continue;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(row.email)) {
      errors.push({ row: rowNum, error: `Invalid email: ${row.email}` });
      continue;
    }

    toInsert.push({
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
      createdBy: req.user._id,
    });
  }

  let imported = 0;
  if (toInsert.length > 0) {
    try {
      const result = await Lead.insertMany(toInsert, { ordered: false });
      imported = result.length;
    } catch (err) {
      // ordered: false — partial inserts possible; count inserted
      imported = err.result?.nInserted || 0;
      if (err.writeErrors) {
        err.writeErrors.forEach((we) => {
          errors.push({ row: we.index + 2, error: we.errmsg || 'Insert failed' });
        });
      }
    }
  }

  return sendSuccess(res, {
    data: { imported, skipped: rows.length - imported - errors.length, errors },
    message: `Import complete: ${imported} imported, ${errors.length} errors`,
  });
});

module.exports = { importLeads };
