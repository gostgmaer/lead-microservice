/**
 * JWKS key resolver (X-C1 / Phase B B-1) — rotation-aware RS256 verification.
 *
 * Resolves IAM's RSA public keys from its JWKS endpoint, indexed by `kid`, so
 * tokens keep verifying across an IAM signing-key rotation (the JWKS serves the
 * old and new keys during overlap). Keys are cached; an unknown `kid` triggers a
 * throttled refresh (handles a freshly rotated key). Signature verification
 * itself stays with the caller — this only supplies the key.
 *
 * Dependency-free: uses the built-in global fetch and crypto. No-op when
 * config.iam.jwksUri is unset; callers then fall back to the static
 * JWT_PUBLIC_KEY (or HS256) they already use.
 */
import { createPublicKey } from 'crypto';
import { config } from '../config/index.js';
import logger from './logger.js';

const jwksUri = config.iam.jwksUri || '';
const MIN_REFRESH_MS = 30_000;

/** kid -> KeyObject */
const keys = new Map();
let lastFetch = 0;
let inFlight = null;

export function isJwksEnabled() {
  return !!jwksUri;
}

async function refresh() {
  if (inFlight) return inFlight;
  if (Date.now() - lastFetch < MIN_REFRESH_MS) return;

  inFlight = (async () => {
    try {
      const res = await fetch(jwksUri);
      if (!res.ok) {
        logger.warn(`JWKS fetch failed (${res.status}) from ${jwksUri}`);
        return;
      }
      const body = await res.json();
      for (const jwk of body?.keys ?? []) {
        if (!jwk.kid) continue;
        try {
          keys.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
        } catch (err) {
          logger.warn(`Skipping unparseable JWK (kid=${jwk.kid}): ${err.message}`);
        }
      }
      lastFetch = Date.now();
    } catch (err) {
      logger.warn(`JWKS fetch error from ${jwksUri}: ${err.message}`);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Public key (crypto.KeyObject) for the given kid, or null if JWKS is disabled
 * or the kid cannot be resolved. Refreshes from the endpoint on an unknown kid.
 * @param {string|undefined} kid
 * @returns {Promise<import('crypto').KeyObject|null>}
 */
export async function getJwksKey(kid) {
  if (!kid || !isJwksEnabled()) return null;

  const cached = keys.get(kid);
  if (cached) return cached;

  await refresh();
  return keys.get(kid) ?? null;
}
