/**
 * Application configuration
 * Reads from process.env — ensure dotenv/config is imported before using this config
 */
import 'dotenv/config';

const config = {
	app: {
		name: process.env.APP_NAME || "lead-microservice",
		version: process.env.APP_VERSION || "1.0.0",
		port: parseInt(process.env.PORT, 10) || 4002,
		env: process.env.NODE_ENV || "development",
	},
	db: { uri: process.env.MONGODB_URI || "mongodb://localhost:27017/lead_microservice" },
	email: {
		serviceUrl: process.env.EMAIL_SERVICE_URL || "http://localhost:4001",
		apiKey: process.env.EMAIL_SERVICE_API_KEY || "",
		adminEmail: process.env.ADMIN_EMAIL || "admin@example.com",
	},
	auth: { serviceUrl: process.env.AUTH_SERVICE_URL || "http://localhost:4002" },
	dashboard: { url: process.env.DASHBOARD_URL || "http://localhost:3000" },
	fileUpload: {
		serviceUrl: process.env.FILE_UPLOAD_SERVICE_URL || '',
		gatewayHmacSecret: process.env.FILE_UPLOAD_HMAC_SECRET || '',
	},
	upload: {
		maxSizeMb: parseInt(process.env.LEAD_FILE_MAX_SIZE_MB, 10) || 10,
		allowedTypes: (process.env.LEAD_FILE_ALLOWED_TYPES || "pdf,doc,docx,xls,xlsx,png,jpg,jpeg,gif,zip,csv").split(","),
		dir: "uploads/leads",
	},
	pipeline: {
		stages: (
			process.env.LEAD_PIPELINE_STAGES || "New,Contacted,Qualified,Proposal Sent,Negotiation,Won,Lost,Archived"
		).split(","),
	},
	cors: { origins: (process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(",") },
	tenant: {
		enabled: process.env.TENANCY_ENABLED === "true",
		defaultTenantId: process.env.DEFAULT_TENANT_ID ? process.env.DEFAULT_TENANT_ID.trim() : null,
	},
	redis: { enabled: process.env.REDIS_ENABLED === "true", url: process.env.REDIS_URL || null },
};

export default config;
