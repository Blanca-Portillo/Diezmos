# Integration hand-off checklist

## Backend
- Project: `services/api`
- Run: from `services/api`, `func start` (Azure Functions Core Tools v4, .NET 10 isolated); local port `7071`.
- Build: `dotnet build services/api/Diezmos.Api.csproj` from repository root.
- Health: `GET /api/health` (anonymous); administrative routes require Entra ID bearer token and role.
- Configuration: `DATABASE_URL`, `AzureWebJobsStorage`, `ENTRA_TENANT_ID`, `ENTRA_API_AUDIENCE`, `BLOB_CONTAINER`, `CORS_ALLOWED_ORIGIN`.

## Frontend
- Project folder: repository root (`services/web` is not used).
- Install: `npm.cmd install` from root.
- Build: `npm.cmd run build` from root.
- Dev: `npm.cmd run dev` from root; Vite prints its `localhost` URL.
- API seam: `src/api.ts` and `src/config.ts`; set `VITE_API_BASE_URL` for the target API.
- Auth: MSAL configuration in `src/main.tsx`; configure `VITE_ENTRA_CLIENT_ID`, `VITE_ENTRA_TENANT_ID`, `VITE_ENTRA_REDIRECT_URI`.
- Mock files to delete: none. Mock datasets: none. Local persistent browser state: none. Do not copy data from `reference/prototype.html`.
- Domain types live in `src/types.ts`; keep these application types and map API responses there if they diverge.

## API route inventory
- `GET /api/health` — anonymous health probe.
- `GET, POST /api/members`; `PUT, DELETE /api/members/{id}` — Admin.
- `GET, POST /api/groups`; `PUT, DELETE /api/groups/{id}` — Admin.
- `GET, POST /api/memberships`; `PUT, DELETE /api/memberships/{id}` — Admin.
- `GET, POST /api/services`; `PUT, DELETE /api/services/{id}` — Admin.
- `GET, POST /api/attendance`; `PUT, DELETE /api/attendance/{id}` — Admin.
- `GET, POST /api/resources`; `PUT, DELETE /api/resources/{id}` — Admin.
- `GET, PUT /api/resources/{id}/content` — Admin; private Blob download/upload.
- `GET, POST /api/treasury`; `PUT, DELETE /api/treasury/{id}` — Treasury.
- `GET, POST /api/pastoral`; `PUT, DELETE /api/pastoral/{id}` — Pastoral only.
- `GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` — Admin; financial aggregates are returned only to Treasury role.
- All API routes except health require a valid Entra access token; role authorization is enforced in the API.

## Database
- Type: PostgreSQL.
- Migration: `services/api/migrations/001_initial_schema.sql`; apply explicitly with `psql`; function startup does not migrate schema.
- Connection: `DATABASE_URL`.
- Required: create/review schema migrations only; **NO seed data**.
- Tables include church profile, members, groups/group membership, services, attendance, resource metadata, treasury movements, restricted pastoral follow-ups, and audit events. Audit records omit financial values and pastoral notes.

## Storage and services
- Essential: React/TypeScript + Fluent UI v9 SPA; .NET 10 isolated Azure Functions API; PostgreSQL; private Azure Blob Storage; Microsoft Entra ID delegated authentication/roles; Static Web Apps hosting.
- Enhancement/production readiness: Application Insights, managed identity/Key Vault, private networking, automated backup/restore, malware scanning for uploads, and retention/deletion procedures.
- Blob files are limited to 15 MB; permitted extensions/MIME types are MP3, M4A, MP4, PDF, JPEG, PNG. The container is private.
- Date/time presentation uses `America/El_Salvador`; financial display and reporting use USD.
