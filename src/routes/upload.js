import express from "express";
import path from "path";
import { authenticate } from "../middleware/auth.js";
import { BadRequestError } from "../utils/errors.js";
import { uploadFile } from "../utils/storage.js";
import { buildProposalPdfBuffer } from "../utils/proposalPdf.js";

// Strict allowlists for proposal uploads
const ALLOWED_PROPOSAL_EXTENSIONS = new Set([".html", ".htm"]);
const ALLOWED_PROPOSAL_MIME_TYPES = new Set(["text/html"]);

const router = express.Router();

function sanitizeFileName(fileName = "proposal.html") {
	return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// A proposal needs *some* development figure: an explicit quotedAmount/total or line items.
function assertHasDevelopmentAmount(body = {}) {
	const { quotedAmount, development } = body;
	const hasQuoted = quotedAmount != null && !Number.isNaN(Number(quotedAmount)) && Number(quotedAmount) > 0;
	const hasTotal = development?.total != null && Number(development.total) > 0;
	const hasItems = Array.isArray(development?.items) && development.items.length > 0;
	if (!hasQuoted && !hasTotal && !hasItems) {
		throw new BadRequestError(
			"A development amount is required: provide quotedAmount, development.total, or development.items.",
		);
	}
}

router.post("/proposal", authenticate, async (req, res, next) => {
	try {
		const { fileName, mimeType = "text/html", contentBase64 } = req.body;

		if (!contentBase64) {
			throw new BadRequestError("contentBase64 is required");
		}

		const normalizedFileName = sanitizeFileName(fileName || `proposal-${Date.now()}.html`);

		// SECURITY: Restrict uploads to HTML only — reject other file types
		const ext = path.extname(normalizedFileName).toLowerCase();
		if (!ALLOWED_PROPOSAL_EXTENSIONS.has(ext)) {
			throw new BadRequestError(
				`Invalid file extension "${ext}". Only .html and .htm files are allowed for proposals.`
			);
		}
		// SECURITY: Reject non-HTML MIME types — prevents disguised file uploads
		const normalizedMime = String(mimeType || "").toLowerCase().split(";")[0].trim();
		if (!ALLOWED_PROPOSAL_MIME_TYPES.has(normalizedMime)) {
			throw new BadRequestError(
				`Invalid MIME type "${normalizedMime}". Only text/html is accepted for proposals.`
			);
		}

		const normalizedBase64 =
			String(contentBase64).includes(",") ? String(contentBase64).split(",")[1] : String(contentBase64);

		// VALIDATION FIX: Wrap base64 decoding in try-catch to return 400 instead of 500
		// Invalid base64 string would crash Buffer.from and return server error
		let buffer;
		try {
			buffer = Buffer.from(normalizedBase64, "base64");
			if (buffer.length === 0) {
				throw new BadRequestError("Invalid base64 content: decoding resulted in empty buffer");
			}
		} catch (decodeErr) {
			throw new BadRequestError(
				`Invalid base64 encoding: ${decodeErr instanceof Error ? decodeErr.message : 'unknown error'}`
			);
		}

		const publicUrl = await uploadFile(buffer, normalizedFileName, mimeType, req);

		res
			.status(201)
			.json({
				success: true,
				message: "Proposal file uploaded successfully",
				data: { fileName: normalizedFileName, mimeType, url: publicUrl },
			});
	} catch (error) {
		next(error);
	}
});

// POST /upload/proposal-pdf
// Server-side renders a branded PDF from structured proposal data (pure-JS,
// no Chromium) and stores it via the file service, returning the public URL.
router.post("/proposal-pdf", authenticate, async (req, res, next) => {
	try {
		const { fileName } = req.body || {};
		assertHasDevelopmentAmount(req.body);

		const buffer = await buildProposalPdfBuffer(req.body);
		if (!buffer || buffer.length === 0) {
			throw new BadRequestError("Proposal PDF generation produced an empty document.");
		}

		const normalizedFileName = sanitizeFileName(fileName || `proposal-${Date.now()}.pdf`).replace(
			/\.(html?|[^.]*)$/i,
			".pdf",
		);
		const publicUrl = await uploadFile(buffer, normalizedFileName, "application/pdf", req);

		res.status(201).json({
			success: true,
			message: "Proposal PDF generated successfully",
			data: { fileName: normalizedFileName, mimeType: "application/pdf", url: publicUrl },
		});
	} catch (error) {
		next(error);
	}
});

// POST /upload/proposal-pdf/preview
// Renders the SAME PDF as /proposal-pdf but streams it back inline without
// storing it — used by the dashboard "Preview" button for a true WYSIWYG view.
router.post("/proposal-pdf/preview", authenticate, async (req, res, next) => {
	try {
		assertHasDevelopmentAmount(req.body);

		const buffer = await buildProposalPdfBuffer(req.body);
		if (!buffer || buffer.length === 0) {
			throw new BadRequestError("Proposal PDF generation produced an empty document.");
		}

		res.status(200);
		res.setHeader("Content-Type", "application/pdf");
		res.setHeader("Content-Disposition", 'inline; filename="proposal-preview.pdf"');
		res.setHeader("Content-Length", buffer.length);
		res.send(buffer);
	} catch (error) {
		next(error);
	}
});

export default router;
