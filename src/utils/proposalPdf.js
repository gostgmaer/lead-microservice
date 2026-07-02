/**
 * Server-side document generator (pdfkit, pure-JS — runs on node:20-alpine).
 *
 * One engine, four document types sharing the same data model + renderer:
 *   • proposal   — full EasyDEV "Static Website + Managed Hosting" proposal
 *   • quotation  — short commercial quote (line items + GST + grand total)
 *   • invoice    — billing document (invoice #, due date, amount due, bank details)
 *   • contract   — service agreement for signature (parties, terms, signatures)
 *
 * Dispatch on data.documentType (default "proposal"). Pass as little as
 * { client, company, development|quotedAmount } and demo defaults fill the rest;
 * all totals are computed so the document always reconciles.
 *
 * CURRENCY: pdfkit Helvetica renders $, €, £ but NOT ₹ — INR shows as "Rs " by
 * default. Set env PROPOSAL_PDF_FONT to a Unicode TTF for a real ₹.
 */
import fs from "fs";
import PDFDocument from "pdfkit";

// ─── Palette ──────────────────────────────────────────────────────────────────
const INK = "#1f2937";
const MUTED = "#6b7280";
const FAINT = "#9ca3af";
const ACCENT = "#4338ca";
const SOFT = "#eef2ff";
const LINE = "#e5e7eb";

// ─── Optional Unicode font (enables a real ₹) ─────────────────────────────────
const UNICODE_FONT_PATH = process.env.PROPOSAL_PDF_FONT || "";
const HAS_UNICODE_FONT = Boolean(UNICODE_FONT_PATH && fs.existsSync(UNICODE_FONT_PATH));
const CURRENCY_SYMBOLS = { USD: "$", EUR: "€", GBP: "£", AED: "AED ", AUD: "A$", CAD: "C$", SGD: "S$" };
function currencyPrefix(code) {
	if (code === "INR") return HAS_UNICODE_FONT ? "₹" : "Rs ";
	return CURRENCY_SYMBOLS[code] || `${code} `;
}

const DOC_TYPES = new Set(["proposal", "quotation", "invoice", "contract"]);
const DOC_LABELS = { proposal: "Proposal", quotation: "Quotation", invoice: "Invoice", contract: "Service Agreement" };
const DOC_PREFIX = { proposal: "EZD-P", quotation: "EZD-Q", invoice: "EZD-INV", contract: "EZD-C" };

// ─── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_AGENCY = {
	name: "EasyDEV",
	founder: "Kishor Sarkar",
	title: "Founder",
	email: "info@easydev.in",
	phone: "",
	website: "https://easydev.in",
	city: "Suri",
	country: "India",
	gstin: "",
	bank: "",
};
const DEFAULT_DEV_ITEMS = [
	{ component: "UI/UX Design", description: "Layout design & structure planning", amount: 10000 },
	{ component: "Frontend Development", description: "3–5 responsive pages", amount: 18000 },
	{ component: "Contact Form Integration", description: "Email integration & validation", amount: 5000 },
	{ component: "Basic SEO Setup", description: "Meta tags, sitemap, indexing", amount: 4000 },
	{ component: "Testing & Optimization", description: "Cross-device testing & performance", amount: 4000 },
	{ component: "Secure Deployment", description: "Hosting configuration & SSL setup", amount: 4000 },
];
const DEFAULT_LAUNCH_ITEMS = [
	{ item: "Domain Registration (1 Year)", amount: 1200 },
	{ item: "Hosting Activation & Initial Setup", amount: 3800 },
	{ item: "SSL Configuration", amount: "Included" },
];
const DEFAULT_OVERVIEW_INCLUDES = [
	"Responsive UI/UX design", "Static frontend development", "Contact form with email integration",
	"Basic SEO setup", "Secure HTTPS deployment", "Managed hosting", "Ongoing maintenance support",
];
const DEFAULT_HOSTING_INCLUDES = [
	"Secure hosting environment", "SSL monitoring", "Domain configuration", "Uptime monitoring", "Email routing for contact form",
];
const DEFAULT_MAINTENANCE_INCLUDES = [
	"Minor content updates (text or image replacements within existing page structure)",
	"Bug fixes related to implemented features", "Security updates and routine system checks",
	"Technical support during standard business hours", "Performance monitoring and optimization",
	"Changes limited strictly to the existing approved design structure",
	"Any additional features, new pages, or structural modifications will be quoted separately",
];

// ─── Numeric / date helpers ───────────────────────────────────────────────────
function num(v, fallback = 0) {
	const n = Number(v);
	return Number.isFinite(n) ? n : fallback;
}
function roundUpTo(value, step) {
	return Math.ceil(num(value) / step) * step;
}
function formatDate(iso) {
	if (!iso) return "—";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return String(iso);
	return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Build the complete data model (superset for all document types).
 */
function normalizeProposalData(raw = {}) {
	const documentType = DOC_TYPES.has(raw.documentType) ? raw.documentType : "proposal";
	const currency = raw.currency || "INR";
	const P = currencyPrefix(currency);
	const m = (amount) => {
		if (typeof amount === "string") return amount; // e.g. "Included"
		const n = Number(amount);
		if (!Number.isFinite(n)) return "—";
		return `${P}${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
	};

	const agency = { ...DEFAULT_AGENCY, ...(raw.agency || {}) };
	const client = raw.client || {};
	const clientName =
		raw.clientName ||
		[client.firstName, client.lastName].filter(Boolean).join(" ").trim() ||
		client.name ||
		"Valued Client";
	const company = raw.company || client.company || clientName;

	// ── Development line items ────────────────────────────────────────────────
	let devItems = Array.isArray(raw.development?.items) && raw.development.items.length
		? raw.development.items.map((i) => ({
				component: i.component || i.item || "Item",
				description: i.description || "",
				qty: num(i.qty, 1),
				amount: num(i.amount ?? i.unitPrice, 0),
		  }))
		: null;
	const explicitDevTotal = raw.development?.total ?? raw.quotedAmount ?? null;
	if (!devItems) {
		if (explicitDevTotal != null && num(explicitDevTotal) > 0) {
			const target = num(explicitDevTotal);
			const baseSum = DEFAULT_DEV_ITEMS.reduce((s, i) => s + i.amount, 0);
			let running = 0;
			devItems = DEFAULT_DEV_ITEMS.map((i, idx) => {
				const isLast = idx === DEFAULT_DEV_ITEMS.length - 1;
				const amt = isLast ? target - running : Math.round((i.amount / baseSum) * target);
				running += amt;
				return { ...i, qty: 1, amount: amt };
			});
		} else {
			devItems = DEFAULT_DEV_ITEMS.map((i) => ({ ...i, qty: 1 }));
		}
	}
	const developmentTotal = devItems.reduce((s, i) => s + num(i.amount), 0);

	// ── Launch cost ───────────────────────────────────────────────────────────
	let launchItems;
	if (Array.isArray(raw.launch?.items) && raw.launch.items.length) {
		launchItems = raw.launch.items.map((i) => ({ ...i }));
	} else if (raw.launch?.total != null && num(raw.launch.total) > 0) {
		launchItems = [{ item: "Launch & Setup (domain, hosting, SSL)", amount: num(raw.launch.total) }];
	} else {
		launchItems = DEFAULT_LAUNCH_ITEMS.map((i) => ({ ...i }));
	}
	const launchTotal =
		raw.launch?.total != null
			? num(raw.launch.total)
			: launchItems.reduce((s, i) => s + (typeof i.amount === "number" ? i.amount : 0), 0);

	// ── Hosting & maintenance (proposal) ──────────────────────────────────────
	const hostingMonthly = num(raw.hosting?.monthly, 1000);
	const hostingYearly = num(raw.hosting?.yearly, hostingMonthly * 12);
	const maintenanceRatePct = num(raw.maintenance?.ratePct, 10);
	const maintenanceAnnual = num(raw.maintenance?.annual, Math.round((developmentTotal * maintenanceRatePct) / 100));
	const maintenanceMonthlyEq = Math.round(maintenanceAnnual / 12);
	const maintenanceRoundedMonthly = num(raw.maintenance?.roundedMonthly, roundUpTo(maintenanceMonthlyEq, 100));
	const monthlyTotal = hostingMonthly + maintenanceRoundedMonthly;
	const termYears = num(raw.termYears, 3);
	const termMonths = termYears * 12;
	const monthlyPlanTotal = monthlyTotal * termMonths;
	const proposalSubtotal = developmentTotal + launchTotal + monthlyPlanTotal;

	// ── Commercial line items + tax (quotation / invoice) ─────────────────────
	const lineItems = [
		...devItems.map((i) => ({ item: i.component, description: i.description, qty: i.qty, unitPrice: i.amount, total: num(i.qty, 1) * num(i.amount) })),
	];
	if (launchTotal > 0) {
		lineItems.push({ item: "Launch & Setup", description: "Domain, hosting activation, SSL", qty: 1, unitPrice: launchTotal, total: launchTotal });
	}
	const oneTimeSubtotal = lineItems.reduce((s, i) => s + i.total, 0);
	const discount = num(raw.discount, 0);
	const taxable = Math.max(0, oneTimeSubtotal - discount);
	const gstRate = num(raw.gstRate, 18);
	const gstAmount = Math.round((taxable * gstRate) / 100);
	const grandTotal = taxable + gstAmount;

	// ── Dates / numbers ───────────────────────────────────────────────────────
	const issueDate = raw.date || raw.issueDate || new Date().toISOString();
	let validityDays = raw.validityDays != null ? num(raw.validityDays, 15) : 15;
	if (raw.validUntil && raw.validityDays == null) {
		const until = new Date(raw.validUntil).getTime();
		const from = new Date(issueDate).getTime();
		if (Number.isFinite(until) && Number.isFinite(from) && until > from) validityDays = Math.ceil((until - from) / 86400000);
	}
	const dueDate = raw.dueDate || new Date(new Date(issueDate).getTime() + num(raw.dueDays, validityDays) * 86400000).toISOString();
	const documentNumber =
		raw.documentNumber || raw.proposalNumber || raw.number || raw.proposalId ||
		`${DOC_PREFIX[documentType]}-${Date.now().toString().slice(-8)}`;

	const payment = {
		advancePct: num(raw.payment?.advancePct, 30),
		designPct: num(raw.payment?.designPct, 50),
		launchPct: num(raw.payment?.launchPct, 20),
	};

	return {
		documentType,
		docLabel: DOC_LABELS[documentType],
		currency,
		money: m,
		agency,
		clientName,
		company,
		clientEmail: client.email || raw.clientEmail || "",
		clientPhone: client.phone || raw.clientPhone || "",
		clientAddress: raw.clientAddress || client.address || "",
		documentNumber,
		issueDate,
		validityDays,
		dueDate,
		status: raw.status || "Unpaid",
		notes: raw.notes || "",
		projectTitle: raw.projectTitle || raw.projectName || "Static Website Development & Managed Hosting Services",
		projectType: raw.projectType || "Static Business Website",
		timeline: raw.timeline || "1–2 Weeks",
		pages: raw.pages || "Up to 3–5 pages within agreed structure",
		overviewIncludes: raw.overviewIncludes || DEFAULT_OVERVIEW_INCLUDES,
		devItems,
		developmentTotal,
		launchItems,
		launchTotal,
		hostingMonthly,
		hostingYearly,
		hostingIncludes: raw.hosting?.includes || DEFAULT_HOSTING_INCLUDES,
		maintenanceRatePct,
		maintenanceAnnual,
		maintenanceMonthlyEq,
		maintenanceRoundedMonthly,
		maintenanceIncludes: raw.maintenance?.includes || DEFAULT_MAINTENANCE_INCLUDES,
		monthlyTotal,
		termYears,
		termMonths,
		monthlyPlanTotal,
		proposalSubtotal,
		lineItems,
		oneTimeSubtotal,
		discount,
		taxable,
		gstRate,
		gstAmount,
		grandTotal,
		payment,
	};
}

// ─── Renderer factory (shared helpers over a pdfkit doc) ──────────────────────
function createRenderer(doc, ctx) {
	const { left, right, cw, FONT, FONT_BOLD, m } = ctx;
	const ensure = (needed) => {
		const bottom = doc.page.height - doc.page.margins.bottom;
		if (doc.y + needed > bottom) doc.addPage();
	};
	const sectionTitle = (n, title) => {
		doc.moveDown(1.0);
		ensure(72);
		const y = doc.y;
		if (n != null) {
			doc.roundedRect(left, y, 28, 28, 7).fill(ACCENT);
			doc.fillColor("#ffffff").font(FONT_BOLD).fontSize(13).text(String(n), left, y + 7, { width: 28, align: "center" });
			doc.fillColor(INK).font(FONT_BOLD).fontSize(15).text(title, left + 40, y + 5, { width: cw - 40 });
		} else {
			doc.fillColor(INK).font(FONT_BOLD).fontSize(15).text(title, left, y + 5, { width: cw });
		}
		doc.y = Math.max(doc.y, y + 30);
		doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(ACCENT).lineWidth(1.4).stroke();
		doc.y += 12;
		doc.fillColor(INK);
	};
	const subhead = (text) => {
		ensure(30);
		doc.moveDown(0.4);
		doc.font(FONT_BOLD).fontSize(11).fillColor(ACCENT).text(text, left, doc.y);
		doc.y += 4;
		doc.fillColor(INK);
	};
	const para = (text, opts = {}) => {
		ensure(34);
		doc.font(FONT).fontSize(10.5).fillColor("#374151").text(text, left, doc.y, { width: cw, lineGap: 3, ...opts });
		doc.moveDown(0.35);
	};
	const bullets = (items) => {
		doc.font(FONT).fontSize(10).fillColor("#374151");
		items.forEach((it) => {
			const w = cw - 14;
			const h = doc.heightOfString(it, { width: w });
			ensure(h + 4);
			const y = doc.y;
			doc.circle(left + 3, y + 5, 1.5).fill(ACCENT);
			doc.fillColor("#374151").text(it, left + 12, y, { width: w, lineGap: 2 });
			doc.y = y + h + 4;
		});
		doc.moveDown(0.2);
	};
	const kv = (label, value, opts = {}) => {
		ensure(18);
		const lw = opts.labelWidth ?? cw * 0.34;
		const y = doc.y;
		doc.font(FONT_BOLD).fontSize(10).fillColor(INK).text(label, left, y, { width: lw });
		doc.font(FONT).fontSize(10).fillColor("#374151").text(String(value), left + lw, y, { width: cw - lw });
		doc.y = Math.max(doc.y, y + 14);
	};
	const table = (cols, rows, { totalRow } = {}) => {
		const totalW = cols.reduce((s, c) => s + c.w, 0);
		ensure(52);
		const hy = doc.y;
		doc.rect(left, hy, totalW, 20).fill("#eef0f4");
		let x = left;
		doc.font(FONT_BOLD).fontSize(8.5).fillColor(MUTED);
		cols.forEach((c) => {
			doc.text(c.label.toUpperCase(), x + 6, hy + 6, { width: c.w - 12, align: c.align || "left" });
			x += c.w;
		});
		doc.y = hy + 20;
		const renderRow = (cells, { bold = false, zebra = false } = {}) => {
			doc.font(bold ? FONT_BOLD : FONT).fontSize(9.5);
			const heights = cols.map((c, i) => doc.heightOfString(String(cells[i] ?? ""), { width: c.w - 12 }));
			const rowH = Math.max(15, ...heights) + 8;
			ensure(rowH);
			const ry = doc.y;
			if (bold) doc.rect(left, ry, totalW, rowH).fill(SOFT);
			else if (zebra) doc.rect(left, ry, totalW, rowH).fill("#fafafb");
			let cx = left;
			cols.forEach((c, i) => {
				doc.font(bold ? FONT_BOLD : FONT).fillColor(bold ? ACCENT : INK)
					.text(String(cells[i] ?? ""), cx + 6, ry + 5, { width: c.w - 12, align: c.align || "left" });
				cx += c.w;
			});
			doc.y = ry + rowH;
			doc.moveTo(left, doc.y).lineTo(left + totalW, doc.y).strokeColor(LINE).lineWidth(0.5).stroke();
		};
		rows.forEach((r, i) => renderRow(r, { zebra: i % 2 === 1 }));
		if (totalRow) renderRow(totalRow, { bold: true });
		doc.moveDown(0.6);
	};
	const totalBox = (label, value, color = ACCENT) => {
		ensure(56);
		const y = doc.y + 2;
		doc.roundedRect(left, y, cw, 46, 8).fill(color);
		doc.fillColor("#dbeafe").font(FONT).fontSize(10).text(label.toUpperCase(), left + 18, y + 12);
		doc.fillColor("#ffffff").font(FONT_BOLD).fontSize(20).text(m(value), left, y + 14, { width: cw - 18, align: "right" });
		doc.y = y + 46 + 14;
	};
	// Two-column From / To party block.
	const parties = (fromTitle, fromLines, toTitle, toLines) => {
		ensure(90);
		const colGap = 24;
		const colW = (cw - colGap) / 2;
		const top = doc.y;
		const col = (x, title, lines) => {
			doc.font(FONT).fontSize(9).fillColor(FAINT).text(title.toUpperCase(), x, top);
			doc.font(FONT_BOLD).fontSize(12).fillColor(INK).text(lines[0] || "", x, top + 13, { width: colW });
			doc.font(FONT).fontSize(9.5).fillColor(MUTED);
			const rest = lines.slice(1).filter(Boolean).join("\n");
			if (rest) doc.text(rest, x, doc.y + 1, { width: colW });
		};
		col(left, fromTitle, fromLines);
		const leftEnd = doc.y;
		doc.y = top;
		col(left + colW + colGap, toTitle, toLines);
		doc.y = Math.max(leftEnd, doc.y) + 10;
	};
	return { ensure, sectionTitle, subhead, para, bullets, kv, table, totalBox, parties };
}

// ─── Document header band (quotation / invoice / contract) ────────────────────
function headerBand(doc, ctx, d, title, metaPairs) {
	const { left, right, cw, FONT, FONT_BOLD } = ctx;
	doc.rect(0, 0, doc.page.width, 110).fill(ACCENT);
	doc.fillColor("#ffffff").font(FONT_BOLD).fontSize(13).text(d.agency.name, left, 34);
	doc.fillColor("#c7d2fe").font(FONT).fontSize(9).text(d.agency.email + (d.agency.phone ? `  ·  ${d.agency.phone}` : ""), left, 52);
	doc.fillColor("#ffffff").font(FONT_BOLD).fontSize(26).text(title, left, 30, { width: cw, align: "right" });
	doc.fillColor("#c7d2fe").font(FONT).fontSize(9).text(metaPairs, left, 64, { width: cw, align: "right" });
	doc.y = 130;
	doc.fillColor(INK);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROPOSAL
// ═══════════════════════════════════════════════════════════════════════════════
function renderProposal(doc, r, d, ctx) {
	const { left, right, cw, FONT, FONT_BOLD } = ctx;
	const m = d.money;
	// Cover
	doc.rect(0, 0, doc.page.width, doc.page.height).fill("#ffffff");
	doc.rect(0, 0, doc.page.width, 230).fill(ACCENT);
	doc.fillColor("#ffffff").font(FONT_BOLD).fontSize(13).text(d.agency.name, left, 50);
	doc.fillColor("#c7d2fe").font(FONT).fontSize(10).text("Digital Platform Development Proposal", left, 70);
	doc.fillColor("#ffffff").font(FONT_BOLD).fontSize(25).text(d.projectTitle, left, 120, { width: cw });
	doc.y = 270;
	doc.fillColor(INK);
	[
		["Prepared For", d.company],
		["Prepared By", `${d.agency.name} — ${d.agency.title} ${d.agency.founder} (${d.agency.email})`],
		["Proposal Reference", d.documentNumber],
		["Issue Date", formatDate(d.issueDate)],
		["Validity", `${d.validityDays} Calendar Days from Issue Date`],
	].forEach(([k, v]) => {
		const y = doc.y;
		doc.font(FONT).fontSize(9).fillColor(FAINT).text(k.toUpperCase(), left, y);
		doc.font(FONT_BOLD).fontSize(13).fillColor(INK).text(String(v), left, y + 12, { width: cw });
		doc.moveDown(0.85);
	});
	doc.fontSize(9).fillColor(FAINT).text("Confidential — For Internal Review Only", left, doc.page.height - 92);
	doc.text(`© ${new Date(d.issueDate).getFullYear()} ${d.agency.name}. All Rights Reserved.`, left, doc.page.height - 78);

	doc.addPage();
	doc.y = doc.page.margins.top;

	r.sectionTitle(1, "Executive Cover Letter");
	r.kv("Date:", formatDate(d.issueDate));
	r.kv("Proposal Ref:", d.documentNumber);
	doc.moveDown(0.5);
	r.para("To,");
	r.para(`The Management Team\n${d.company}`);
	r.para(`Subject: Proposal for ${d.projectTitle}`, { font: FONT_BOLD });
	r.para(`Dear ${d.clientName},`);
	r.para("We are pleased to submit this proposal for the design, development, and long-term management of your professional static business website.");
	r.para(`This document outlines the project scope, launch costs, hosting structure, maintenance framework, and a structured ${d.termYears}-year service agreement designed to ensure operational stability, predictable investment, and continuous technical support.`);
	r.para("Our objective is to provide a reliable, secure, and professionally managed digital presence that supports your business growth.");
	r.para("All commercial figures mentioned in this proposal are exclusive of applicable GST and shall be invoiced in accordance with prevailing statutory regulations.");
	r.para("We appreciate the opportunity to work with your organization and look forward to building a strong digital foundation for your business.");
	doc.moveDown(0.5);
	r.para("Sincerely,");
	doc.font(FONT_BOLD).fontSize(11).fillColor(INK).text(d.agency.founder, left, doc.y);
	doc.font(FONT).fontSize(10).fillColor(MUTED).text(`${d.agency.title}\n${d.agency.name}\n${d.agency.email}`, left, doc.y + 2);

	r.sectionTitle(2, "Project Overview");
	r.kv("Project Type:", d.projectType);
	r.kv("Delivery Timeline:", d.timeline);
	r.kv("Pages:", d.pages);
	r.subhead("Includes");
	r.bullets(d.overviewIncludes);

	r.sectionTitle(3, "Development Investment");
	r.subhead("A. One-Time Development Investment");
	r.table(
		[{ label: "Component", w: cw * 0.3 }, { label: "Description", w: cw * 0.45 }, { label: "Amount", w: cw * 0.25, align: "right" }],
		d.devItems.map((i) => [i.component, i.description || "", m(i.amount)]),
		{ totalRow: ["Total Development Cost", "", m(d.developmentTotal)] },
	);
	r.para("(All figures exclusive of GST)", { font: "Helvetica-Oblique" });

	r.sectionTitle(4, "Launch Cost (One-Time Setup)");
	r.para("The launch cost covers domain registration and initial hosting activation required to make the website live.");
	r.table(
		[{ label: "Item", w: cw * 0.7 }, { label: "Amount", w: cw * 0.3, align: "right" }],
		d.launchItems.map((i) => [i.item, m(i.amount)]),
		{ totalRow: ["Total Launch Cost", m(d.launchTotal)] },
	);
	r.para("Launch cost payable before deployment.", { font: FONT_BOLD });

	r.sectionTitle(5, "Monthly Hosting & Maintenance Plan");
	r.subhead("A. Server Hosting");
	r.kv("Monthly:", m(d.hostingMonthly));
	r.kv("Yearly:", m(d.hostingYearly));
	doc.moveDown(0.2);
	r.bullets(d.hostingIncludes);
	r.subhead(`B. Annual Maintenance (${d.maintenanceRatePct}% of Development)`);
	r.para(`${d.maintenanceRatePct}% of ${m(d.developmentTotal)} = ${m(d.maintenanceAnnual)} per Year`);
	r.kv("Monthly Equivalent:", m(d.maintenanceMonthlyEq));
	r.kv("Rounded Monthly Billing:", m(d.maintenanceRoundedMonthly));
	doc.moveDown(0.2);
	r.bullets(d.maintenanceIncludes);
	r.subhead("C. Total Monthly Plan");
	r.table(
		[{ label: "Component", w: cw * 0.7 }, { label: "Monthly", w: cw * 0.3, align: "right" }],
		[["Hosting", m(d.hostingMonthly)], ["Maintenance", m(d.maintenanceRoundedMonthly)]],
	);
	r.totalBox("Total Monthly Payment", d.monthlyTotal);

	r.sectionTitle(6, `${d.termYears}-Year Service Agreement`);
	r.para(`This proposal includes a minimum ${d.termYears}-year managed hosting and maintenance agreement.`);
	r.subhead(`Financial Summary (${d.termYears} Years)`);
	r.table(
		[{ label: "Item", w: cw * 0.7 }, { label: "Amount", w: cw * 0.3, align: "right" }],
		[["Development", m(d.developmentTotal)], ["Launch Cost", m(d.launchTotal)], [`Monthly Plan (${m(d.monthlyTotal)} × ${d.termMonths})`, m(d.monthlyPlanTotal)]],
		{ totalRow: ["Subtotal (Before GST)", m(d.proposalSubtotal)] },
	);
	r.para("GST will be applied at prevailing statutory rates and reflected in tax invoices.");

	r.sectionTitle(7, "Service Level Commitment");
	r.bullets([
		"Target uptime of 99% annually, excluding scheduled maintenance, third-party service outages, domain registrar issues, or force majeure events.",
		"Standard support response time: 24–48 business hours from receipt of request.",
		"Critical service issues (website downtime) will be prioritized and addressed within 24 business hours.",
		"Hosting environment monitoring and basic security supervision included during the active service agreement period.",
		"Annual domain and SSL renewal coordination included (registration fees charged separately as applicable).",
	]);

	r.sectionTitle(8, "Agreement Extension & Renewal");
	r.para(`Upon completion of the initial ${d.termYears}-year term:`);
	r.bullets([
		"The service agreement may be extended on mutually agreed terms.",
		"Hosting and maintenance fees may be revised based on prevailing market and infrastructure costs.",
		"Renewal will be confirmed in writing prior to agreement expiry.",
		"Domain renewal will continue annually as per applicable registrar charges.",
	]);
	r.para("Unless otherwise notified in writing 30 days prior to expiry, services may continue under renewed terms.");

	renderContractTerms(doc, r, d, ctx, 9);

	r.sectionTitle(10, "Client Authorization");
	r.para("By signing below, the Client acknowledges that they have reviewed, understood, and agreed to the scope of work, pricing structure, service agreement terms, and conditions outlined in this proposal.");
	r.para("This signed document shall constitute formal approval to initiate the project under the agreed commercial and contractual terms.");
	signatureLines(doc, r, d, ctx);
}

// Shared contract-terms section (used by proposal §9 and the contract document).
function renderContractTerms(doc, r, d, ctx, sectionNo) {
	r.sectionTitle(sectionNo, "Contract Terms");
	r.subhead("Payment Structure");
	r.bullets([
		`${d.payment.advancePct}% advance to initiate development`,
		`${d.payment.designPct}% upon design & layout approval`,
		`${d.payment.launchPct}% prior to website launch`,
		"Launch cost payable before go-live",
		"Monthly hosting & maintenance billed in advance",
		`Minimum ${d.termYears}-year service agreement`,
	]);
	r.subhead("Early Termination");
	r.bullets([`In case of early termination during the ${d.termYears}-year agreement period, the client shall settle the remaining hosting commitment applicable to the active contract term.`]);
	r.subhead("Payment Default");
	r.bullets([
		"Payments delayed beyond 7 days from the due date may result in temporary suspension of hosting services until outstanding dues are cleared.",
		"Continued non-payment beyond 30 days may result in permanent service suspension without liability to the service provider.",
	]);
	r.subhead("Taxation");
	r.bullets(["All commercial figures are exclusive of applicable GST.", "GST shall be charged at prevailing statutory rates and reflected in tax invoices."]);
	r.subhead("Domain & Hosting Governance");
	r.bullets([
		"The domain shall be registered in the client's name unless otherwise agreed in writing.",
		"Hosting infrastructure and server management remain under the scope of the active service agreement.",
		"Hosting access credentials may be restricted during the contract term to ensure service integrity.",
	]);
	r.subhead("Intellectual Property & Ownership");
	r.bullets([
		"Ownership of the website source code and design assets shall transfer to the Client only upon full payment of all development dues under this agreement.",
		"Third-party tools, plugins, hosting services, or licensed components shall remain subject to their respective licensing terms and conditions.",
		"The Service Provider reserves the right to display the completed project in its portfolio and marketing materials unless otherwise agreed in writing by the Client.",
	]);
	r.subhead("Cancellation & Refund Policy");
	r.bullets([
		"If the Client cancels the project before development work has commenced, the advance amount shall be refundable after deducting 15% of the total development value towards administrative and consultation charges.",
		"Once design approval has been provided or development work has commenced, payments made shall be non-refundable.",
		"Payments made towards hosting, domain registration, third-party services, or government fees are strictly non-refundable.",
	]);
	r.subhead("Limitation of Liability");
	r.bullets([
		"The Service Provider shall not be liable for any indirect, incidental, special, or consequential damages arising from website usage, hosting interruptions, third-party service failures, domain registrar issues, cyber incidents, or circumstances beyond reasonable control.",
		"In no event shall the total liability of the Service Provider exceed the total development fees paid by the Client for services directly performed under this agreement.",
	]);
	r.subhead("Data & Security Disclaimer");
	r.bullets([
		"While reasonable security measures will be implemented, absolute protection against cyber threats, unauthorized access, or data breaches cannot be guaranteed.",
		"The Client is responsible for maintaining secure passwords, safeguarding administrative credentials, and controlling authorized access.",
	]);
	r.subhead("Force Majeure");
	r.bullets(["The Service Provider shall not be held liable for delays or failure in performance resulting from events beyond reasonable control, including but not limited to natural disasters, government actions, internet outages, cyber-attacks, infrastructure failures, or acts of third-party service providers."]);
	r.subhead("Governing Law");
	r.bullets([
		`This agreement shall be governed and construed in accordance with the laws of ${d.agency.country}.`,
		`Any disputes arising shall be subject to the jurisdiction of the competent courts in ${d.agency.city}.`,
	]);
}

function signatureLines(doc, r, d, ctx) {
	const { left, right, cw, FONT, FONT_BOLD } = ctx;
	doc.moveDown(0.4);
	r.kv("Client Name:", d.clientName);
	r.kv("Company Name:", d.company);
	doc.moveDown(0.3);
	["Authorized Signatory Name:", "Designation:", "Authorized Signature:", "Company Seal (if applicable):", "Date:"].forEach((label) => {
		r.ensure(26);
		const y = doc.y;
		doc.font(FONT).fontSize(10).fillColor(INK).text(label, left, y, { width: 190 });
		doc.moveTo(left + 200, y + 10).lineTo(right, y + 10).strokeColor(LINE).lineWidth(1).stroke();
		doc.y = y + 24;
	});
	doc.moveDown(0.5);
	r.para("For and on behalf of:");
	doc.font(FONT_BOLD).fontSize(11).fillColor(INK).text(d.agency.name, left, doc.y);
	doc.font(FONT).fontSize(10).fillColor(MUTED).text(`${d.agency.founder}\n${d.agency.title}\n${d.agency.email}`, left, doc.y + 2);
}

// Subtotal / discount / GST / total summary table (quotation + invoice).
function billingSummary(doc, r, d, ctx, { totalLabel = "Grand Total", color = ACCENT } = {}) {
	const { cw } = ctx;
	const m = d.money;
	r.table(
		[{ label: "Description", w: cw * 0.62 }, { label: "Amount", w: cw * 0.38, align: "right" }],
		[
			["Subtotal", m(d.oneTimeSubtotal)],
			["Discount", d.discount ? `- ${m(d.discount)}` : m(0)],
			["Taxable Amount", m(d.taxable)],
			[`GST (${d.gstRate}%)`, m(d.gstAmount)],
		],
	);
	r.totalBox(totalLabel, d.grandTotal, color);
}

function lineItemsTable(doc, r, d, ctx) {
	const { cw } = ctx;
	const m = d.money;
	r.table(
		[
			{ label: "Item", w: cw * 0.42 },
			{ label: "Qty", w: cw * 0.1, align: "right" },
			{ label: "Unit Price", w: cw * 0.24, align: "right" },
			{ label: "Total", w: cw * 0.24, align: "right" },
		],
		d.lineItems.map((i) => [i.item, String(i.qty), m(i.unitPrice), m(i.total)]),
	);
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUOTATION
// ═══════════════════════════════════════════════════════════════════════════════
function renderQuotation(doc, r, d, ctx) {
	headerBand(doc, ctx, d, "QUOTATION", `${d.documentNumber}\n${formatDate(d.issueDate)}`);
	r.parties(
		"From",
		[d.agency.name, d.agency.email, d.agency.phone, d.agency.website],
		"Quote For",
		[d.company, d.clientName, d.clientEmail, d.clientPhone],
	);
	r.kv("Project:", d.projectTitle);
	r.kv("Valid Until:", `${formatDate(d.dueDate)} (${d.validityDays} days)`);
	doc.moveDown(0.3);
	r.sectionTitle(null, "Quotation Details");
	lineItemsTable(doc, r, d, ctx);
	billingSummary(doc, r, d, ctx, { totalLabel: "Grand Total" });
	r.sectionTitle(null, "Payment Terms");
	r.bullets([
		`${d.payment.advancePct}% advance to initiate work`,
		`${d.payment.designPct}% upon design & layout approval`,
		`${d.payment.launchPct}% prior to delivery / launch`,
		"All figures are exclusive of applicable GST unless stated otherwise.",
		`This quotation is valid for ${d.validityDays} days from the issue date.`,
	]);
	if (d.notes) {
		r.sectionTitle(null, "Notes");
		r.para(d.notes);
	}
	doc.moveDown(1.0);
	r.para("Accepted & Approved By:");
	signatureLines(doc, r, d, ctx);
}

// ═══════════════════════════════════════════════════════════════════════════════
// INVOICE
// ═══════════════════════════════════════════════════════════════════════════════
function renderInvoice(doc, r, d, ctx) {
	const { left, cw, FONT, FONT_BOLD } = ctx;
	headerBand(doc, ctx, d, "INVOICE", `${d.documentNumber}`);
	r.parties(
		"Billed By",
		[d.agency.name, d.agency.email, d.agency.phone, d.agency.gstin ? `GSTIN: ${d.agency.gstin}` : ""],
		"Billed To",
		[d.company, d.clientName, d.clientEmail, d.clientAddress],
	);
	r.kv("Invoice Date:", formatDate(d.issueDate), { labelWidth: cw * 0.2 });
	r.kv("Due Date:", formatDate(d.dueDate), { labelWidth: cw * 0.2 });
	r.kv("Status:", d.status, { labelWidth: cw * 0.2 });
	if (d.projectTitle) r.kv("Project:", d.projectTitle, { labelWidth: cw * 0.2 });
	doc.moveDown(0.3);
	r.sectionTitle(null, "Invoice Items");
	lineItemsTable(doc, r, d, ctx);
	billingSummary(doc, r, d, ctx, { totalLabel: "Amount Due", color: "#047857" });
	r.sectionTitle(null, "Payment Details");
	if (d.agency.bank) r.para(d.agency.bank);
	else r.para("Bank / UPI payment details will be shared separately. Please use the invoice number as the payment reference.");
	r.bullets([
		`Please make payment by ${formatDate(d.dueDate)}.`,
		"Late payments may attract service suspension as per the agreed terms.",
		"All figures are inclusive of GST where applicable.",
	]);
	if (d.notes) {
		r.sectionTitle(null, "Notes");
		r.para(d.notes);
	}
	doc.moveDown(0.8);
	doc.font(FONT).fontSize(8.5).fillColor(FAINT).text("This is a computer-generated invoice and does not require a physical signature.", left, doc.y, { width: cw });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRACT / SERVICE AGREEMENT
// ═══════════════════════════════════════════════════════════════════════════════
function renderContract(doc, r, d, ctx) {
	const { left, cw, FONT, FONT_BOLD } = ctx;
	headerBand(doc, ctx, d, "SERVICE AGREEMENT", `${d.documentNumber}\n${formatDate(d.issueDate)}`);
	r.para(`This Service Agreement ("Agreement") is entered into on ${formatDate(d.issueDate)} between:`);
	r.parties(
		"Service Provider",
		[d.agency.name, `${d.agency.title}: ${d.agency.founder}`, d.agency.email, `${d.agency.city}, ${d.agency.country}`],
		"Client",
		[d.company, d.clientName, d.clientEmail, d.clientPhone],
	);
	r.sectionTitle(null, "1. Engagement & Scope");
	r.para(`The Service Provider agrees to deliver "${d.projectTitle}" as detailed in the associated proposal (${d.documentNumber}), including design, development, deployment and the agreed managed hosting & maintenance services.`);
	r.subhead("Includes");
	r.bullets(d.overviewIncludes);

	r.sectionTitle(null, "2. Commercial Summary");
	r.table(
		[{ label: "Item", w: cw * 0.7 }, { label: "Amount", w: cw * 0.3, align: "right" }],
		[
			["Development", d.money(d.developmentTotal)],
			["Launch Cost", d.money(d.launchTotal)],
			[`Monthly Plan (${d.money(d.monthlyTotal)} × ${d.termMonths})`, d.money(d.monthlyPlanTotal)],
		],
		{ totalRow: [`${d.termYears}-Year Subtotal (Before GST)`, d.money(d.proposalSubtotal)] },
	);

	renderContractTerms(doc, r, d, ctx, "3");

	r.sectionTitle(null, "4. Acceptance & Signatures");
	r.para("By signing below, both parties acknowledge that they have read, understood and agreed to the terms of this Agreement, which constitutes formal approval to commence the engagement.");
	doc.moveDown(0.4);
	// Dual signature blocks
	const block = (heading, lines) => {
		r.ensure(120);
		doc.font(FONT_BOLD).fontSize(11).fillColor(ACCENT).text(heading, left, doc.y);
		doc.y += 8;
		doc.font(FONT).fontSize(10).fillColor(MUTED).text(lines.filter(Boolean).join("   ·   "), left, doc.y, { width: cw });
		doc.y += 6;
		["Name:", "Designation:", "Signature:", "Date:"].forEach((lbl) => {
			r.ensure(24);
			const y = doc.y;
			doc.font(FONT).fontSize(10).fillColor(INK).text(lbl, left, y, { width: 110 });
			doc.moveTo(left + 120, y + 10).lineTo(ctx.right, y + 10).strokeColor(LINE).lineWidth(1).stroke();
			doc.y = y + 22;
		});
		doc.moveDown(0.5);
	};
	block("For the Service Provider", [d.agency.name]);
	block("For the Client", [d.company]);
}

const RENDERERS = {
	proposal: renderProposal,
	quotation: renderQuotation,
	invoice: renderInvoice,
	contract: renderContract,
};

/**
 * @param {object} input Document data (see normalizeProposalData). `documentType`
 *   selects the layout (default "proposal").
 * @returns {Promise<Buffer>}
 */
export function buildProposalPdfBuffer(input = {}) {
	const d = normalizeProposalData(input);

	return new Promise((resolve, reject) => {
		try {
			const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
			const chunks = [];
			doc.on("data", (c) => chunks.push(c));
			doc.on("end", () => resolve(Buffer.concat(chunks)));
			doc.on("error", reject);

			if (HAS_UNICODE_FONT) {
				try {
					doc.registerFont("Body", UNICODE_FONT_PATH);
				} catch {
					/* fall back to Helvetica */
				}
			}
			const FONT = HAS_UNICODE_FONT && doc._registeredFonts?.Body ? "Body" : "Helvetica";
			const FONT_BOLD = FONT === "Body" ? "Body" : "Helvetica-Bold";
			const ctx = {
				left: doc.page.margins.left,
				right: doc.page.width - doc.page.margins.right,
				cw: doc.page.width - doc.page.margins.left - doc.page.margins.right,
				FONT,
				FONT_BOLD,
				m: d.money,
			};
			const r = createRenderer(doc, ctx);

			(RENDERERS[d.documentType] || renderProposal)(doc, r, d, ctx);

			// Footer / page numbers — skip the first page (cover/header).
			const range = doc.bufferedPageRange();
			for (let i = range.start + 1; i < range.start + range.count; i++) {
				doc.switchToPage(i);
				const prevBottom = doc.page.margins.bottom;
				doc.page.margins.bottom = 0;
				const fy = doc.page.height - 34;
				doc.font(FONT).fontSize(8).fillColor(FAINT).text(`${d.agency.name}  ·  ${d.docLabel} ${d.documentNumber}`, ctx.left, fy, {
					width: ctx.cw / 2,
					align: "left",
					lineBreak: false,
				});
				doc.text(`Page ${i - range.start} of ${range.count - 1}`, ctx.left + ctx.cw / 2, fy, {
					width: ctx.cw / 2,
					align: "right",
					lineBreak: false,
				});
				doc.page.margins.bottom = prevBottom;
			}

			doc.end();
		} catch (err) {
			reject(err);
		}
	});
}

export { normalizeProposalData };
