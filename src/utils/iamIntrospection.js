/**
 * IAM session introspection (X-C6) — mirrors payment-microservice's
 * IamIntrospectionService and ai-comm's equivalent guard logic.
 *
 * The JWT issued at login no longer carries a `permissions` array (lean-JWT
 * design), so this service resolves the caller's live roles/permissions
 * from IAM's session cache via POST /auth/introspect, keyed by the token's
 * `sessionId` claim. Also gives instant logout/logout-all propagation,
 * since a revoked session's introspection lookup comes back inactive.
 *
 * Rollout is additive: disabled (permissions always empty, same as before)
 * until IAM_INTROSPECTION_API_KEY is set. When IAM is unreachable, behavior
 * follows config.auth.introspectionFailOpen (default fail-open, so an IAM
 * outage doesn't lock everyone out).
 */
import config from '../config/setting.js';
import logger from './logger.js';

function resolveIntrospectUrl() {
	const apiKey = config.auth.introspectionApiKey;
	const base = config.auth.serviceUrl;
	if (!apiKey || !base) return null;
	const trimmed = String(base).trim().replace(/\/+$/, '');
	const withApiPrefix = /\/api\/v1\/iam$/i.test(trimmed) ? trimmed : `${trimmed}/api/v1/iam`;
	return `${withApiPrefix}/auth/introspect`;
}

const introspectUrl = resolveIntrospectUrl();
const cache = new Map();
let warnedDisabled = false;

export function isIntrospectionEnabled() {
	return introspectUrl !== null;
}

/**
 * Returns the full session context ({ active, roles, permissions }) from
 * IAM, or null if the session is inactive/revoked or introspection failed.
 */
export async function getSessionContext(sessionId) {
	if (!introspectUrl) {
		if (!warnedDisabled) {
			logger.warn('IAM session introspection is disabled (IAM_INTROSPECTION_API_KEY not set) — permissions will always be empty');
			warnedDisabled = true;
		}
		return null;
	}
	if (!sessionId) return null;

	const now = Date.now();
	const cached = cache.get(sessionId);
	if (cached && now - cached.checkedAt < config.auth.introspectionCacheTtlMs) {
		return cached.active ? cached : null;
	}

	try {
		const res = await fetch(introspectUrl, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-api-key': config.auth.introspectionApiKey },
			body: JSON.stringify({ sessionId }),
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) throw new Error(`IAM introspect returned HTTP ${res.status}`);
		const body = await res.json();
		const data = body?.data ?? body;
		const active = data?.active === true;

		const result = active
			? { active: true, roles: data.roles, permissions: data.permissions, checkedAt: now }
			: { active: false, checkedAt: now };

		cache.set(sessionId, result);
		return active ? result : null;
	} catch (err) {
		logger.warn(`Session introspection failed for ${sessionId}: ${err.message}`);
		return null;
	}
}

/**
 * True when the session is confirmed live, OR when liveness can't be
 * determined and policy is fail-open. False only when IAM authoritatively
 * reports the session inactive, or on error when fail-closed.
 */
export async function isSessionActive(sessionId) {
	if (!isIntrospectionEnabled()) return true;
	if (!sessionId) return true;
	const ctx = await getSessionContext(sessionId);
	return ctx !== null || config.auth.introspectionFailOpen;
}
