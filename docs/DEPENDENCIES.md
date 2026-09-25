# Dependencies - lead-microservice

Lead capture. Host port 3305 (container 3000).

This file is self-contained: it says what must be running (or configured) before this service works, gives the commands to start those dependencies, and lists who depends on it. `<infra>` below is `easydev-infra` (in this workspace: `C:\Users\kisho\WorkSpace\docker network\easydev-infra`). The full platform map lives in `learning/ai/langchain-knoledgebase-rag/docs/` (`SERVICE_DEPENDENCIES.md`, `OTHER_SERVICES_DEPENDENCIES.md`, `LOCAL_SETUP.md`, `ENVIRONMENT.md`).

**Legend:** **RUN** = must be up (compose `depends_on` or hard runtime). **CONFIG** = its address/secret must be set for this service to boot, but it need not be running. **FEATURE** = only one feature breaks when it is down. Nothing in this file was re-run when it was written; it is derived from the compose files, env examples and config code.

## 1. What this service depends on

| Dependency | Kind | Why |
|---|---|---|
| core Redis | RUN | Compose `depends_on`. |
| IAM auth-service | RUN | Compose `depends_on auth-service` (and its Postgres/pgbouncer). |
| MongoDB (`MONGODB_URI`) | RUN | Lead data. |
| notification-service | FEATURE | Lead emails (`EMAIL_SERVICE_URL`). |
| file-upload-service | FEATURE | Attachments (`FILE_UPLOAD_SERVICE_URL`). |

**Minimum to run it:** core (IAM + Redis) + MongoDB + `lead-microservice`.

## 2. Bring the dependencies up

Create the shared Docker networks once (safe to repeat):

```bash
for n in core-network product-network ai-platform-network utility-network; do
  docker network inspect $n >/dev/null 2>&1 || docker network create $n
done
```

Start in this order (Git Bash; Docker Desktop must be running). Steps marked **(optional)** are only needed for the features noted as FEATURE/CONFIG in section 1; skip them if you do not use those features.

1. **MongoDB (external - no compose file starts it)**

   ```bash
   # Use your existing MongoDB / Atlas, or a throwaway local one:
   docker run -d --name mongo --restart unless-stopped -p 27017:27017 -v mongo-data:/data/db mongo:7
   # URI for containers: mongodb://host.docker.internal:27017/easydev
   ```

2. **Core: databases, IAM, lead**

   ```bash
   cd "/c/Users/kisho/WorkSpace/docker network/easydev-infra"/stacks/core
   docker compose -p easydev-core -f docker-compose.local.build.yml up -d --build \
     core-redis auth-service core-postgres core-pgbouncer lead-microservice
   ```

3. **Utility stack: notification-service (+worker), file-upload-service, utility-redis** **(optional)**

   ```bash
   cd "/c/Users/kisho/WorkSpace/docker network/easydev-infra"/stacks/utility
   docker compose -p easydev-utility -f docker-compose.local.build.yml up -d --build
   ```

4. **Mailpit (local mail catcher; UI http://localhost:8025)** **(optional)**

   ```bash
   docker run -d --name mailpit --restart unless-stopped --network utility-network -p 1025:1025 -p 8025:8025 axllent/mailpit
   ```

5. **This service (Backend/lead-microservice)** - if it is part of one of the stacks above it is already started by that step. To run it from source while developing, keep the dependencies above up and follow this repo's README. Whole-stack shortcut from the infra repo: `bash <infra>/scripts/deploy-local.sh --stack <core|product|ai-platform|support-ai|utility>` (builds from local source, creates the networks, waits for health; `--stack` assumes the stacks it depends on are already running). Build one image at a time on a low-memory machine.

## 3. Settings that tie it to its dependencies

- MONGODB_URI
- DASHBOARD_URL, ALLOWED_ORIGINS
- LEAD_ENCRYPTION_KEY
- EMAIL_SERVICE_URL=http://notification-service:4000/v1
- FILE_UPLOAD_SERVICE_URL=http://file-upload-service:3000

Full variable documentation for the RAG-related services: `ENVIRONMENT.md` in the RAG repo. Never commit real values; only `*.example` files are tracked.

## 4. Who depends on this service

- gateway
- kishor-portfolio (`LEAD_GATEWAY_URL`)

If you stop it, those consumers lose the feature described above.

## 5. Check it is up

```bash
docker ps --format "{{.Names}}  {{.Status}}" | grep lead
docker logs lead-microservice --tail 30
```
