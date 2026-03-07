/**
 * Lead Upload Middleware
 *
 * Lead file uploads are handled by the external File Upload Microservice.
 * This file only provides the multer configuration for CSV import.
 */

const multer = require('multer');

// CSV import — in-memory only (max 10 MB)
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.mimetype === 'application/csv' || file.originalname.endsWith('.csv')) {
      return cb(null, true);
    }
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only CSV files are accepted for import'));
  },
});

const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
};

module.exports = { csvUpload, handleUploadErrors };
