# ═══════════════════════════════════════════════════════════════════════════
# Lead Microservice — Dockerfile
# ═══════════════════════════════════════════════════════════════════════════

FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifest + lockfile first for Docker layer caching
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application source (node_modules excluded via .dockerignore)
COPY . .


# ── Production runner ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Copy everything from builder
COPY --from=builder /app ./

# Remove package managers to reduce attack surface and CVEs
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack && \
  rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# Patch OpenSSL CVE-2026-45447
RUN apk upgrade --no-cache libcrypto3 libssl3

# Install standard DejaVu fonts for PDF rendering fallback
RUN apk add --no-cache ttf-dejavu

EXPOSE 4003

CMD ["node", "server.js"]
