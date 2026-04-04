## Care Minutes AI

Local development is split between `backend/` and `frontend/`. The backend now defaults to the local file-backed repository in development so the app can boot without Supabase, Anthropic, or Resend credentials.

### Stack

- Frontend: React 19 + Vite + Axios + Recharts
- Backend: Express 5 on Node.js
- Shared business logic: `shared/careCalculations.js`
- Local dev data store: `database/dev-store.json`
- Optional hosted data layer: Supabase REST/client
- Package manager: npm in both `frontend/` and `backend/`

### Local setup

1. Install dependencies:

```bash
npm run install:all
```

2. Copy env files if you want to override defaults:

```bash
cp backend/.env.example backend/.env.local
cp frontend/.env.example frontend/.env.local
```

3. Start the backend:

```bash
npm run dev:backend
```

4. Start the frontend in a second terminal:

```bash
npm run dev:frontend
```

### Local URLs

- Frontend dev: `http://localhost:5173`
- Frontend preview: `http://localhost:4173`
- Backend API: `http://localhost:3000`
- Backend health: `http://localhost:3000/health`

### Useful commands

```bash
npm run validate
npm run lint:frontend
npm run test:frontend
npm run test:backend
npm run build:frontend
npm run preview:frontend
npm run seed:dev
```

### Environment notes

- `DATA_PROVIDER=file` is the recommended local default.
- Set `DATA_PROVIDER=supabase` with `SUPABASE_URL` and `SUPABASE_KEY` if you want to use Supabase locally.
- If `LOCAL_DATA_FILE` is unset, the backend auto-creates `database/dev-store.json` with seed data.
- `VITE_API_BASE_URL` is optional in local development. Vite dev uses `/api` proxying, and local preview/builds on `localhost` fall back to `http://localhost:3000`.
- AI alerts work without credentials, but they return a clear fallback message instead of crashing.
- Overall compliance status and forecasting use the lower of total-care and RN performance so RN-only shortfalls do not appear compliant.
- Supabase mode is still backend-scoped by `facility_id`. The repo does not yet implement end-user auth, JWT claim forwarding, or fully enforced RLS tenancy.

### Health and readiness

- `GET /health` is the liveness endpoint and returns a stable JSON payload while the process is up.
- `GET /ready` validates repository configuration and returns `503` if the deployment is not ready to serve traffic.
- `GET /status` returns the same readiness payload with optional-service flags for operations checks.

### Local env variables

Backend:

- `DATA_PROVIDER=file`
- `PORT=3000`
- `ENABLE_ALERT_SCHEDULER=false`
- `CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173`
- `LOCAL_DATA_FILE` optional override for the local JSON store
- `SUPABASE_URL` and `SUPABASE_KEY` only if you want Supabase locally
- `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` are optional

Frontend:

- `VITE_API_BASE_URL` usually unset in local Vite dev
- `VITE_API_PORT=3000`

### Production env variables

Backend required for every deployment:

- `NODE_ENV=production`
- `PORT` from the platform, or set explicitly on a VPS
- `CORS_ORIGIN=https://your-frontend-domain.example`

Backend data provider:

- Recommended: `DATA_PROVIDER=supabase`, `SUPABASE_URL`, `SUPABASE_KEY`
- File mode only for controlled deployments: `DATA_PROVIDER=file`, `LOCAL_DATA_FILE=/persistent-volume/care-minutes-ai.json`

Backend optional services:

- `ENABLE_ALERT_SCHEDULER=true` only on one worker/process if you want scheduled daily alerts
- `ANTHROPIC_API_KEY` for AI-generated alert copy
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for email delivery

Frontend:

- `VITE_API_BASE_URL=https://your-backend-domain.example` when frontend and backend are on different origins
- `VITE_API_BASE_URL=/api` or unset only if the deployed frontend host rewrites `/api/*` to the backend

### Switching from file mode to Supabase

1. Apply `database/schema.sql` to your Supabase project.
2. Set `DATA_PROVIDER=supabase`.
3. Set `SUPABASE_URL` and `SUPABASE_KEY`.
4. Remove `LOCAL_DATA_FILE` unless you still want local file mode in development.
5. Re-run validation and confirm `GET /ready` returns `200`.

### Deployment notes

Frontend:

- Vercel, Netlify, and similar static hosts should build from `frontend/`.
- Set `VITE_API_BASE_URL` to the deployed backend URL unless you have a same-origin `/api` rewrite in place.
- The MVP currently uses only the root route plus query parameters such as `/?facilityId=<uuid>`, so refreshes work as long as the host serves the app root. If you add real client-side routes later, add an SPA fallback to `index.html`.

Backend:

- Render, Railway, Fly, and VPS hosts can run `npm run start:backend`.
- The server honors platform-assigned `PORT`.
- Use `GET /health` for liveness checks and `GET /ready` for readiness checks.
- `DATA_PROVIDER=file` writes to local disk. On managed hosts this is often ephemeral, so use Supabase or mount a persistent volume and set `LOCAL_DATA_FILE`.
- `ENABLE_ALERT_SCHEDULER=true` should only be enabled on one backend instance to avoid duplicate scheduled runs.

### Render + Vercel guide

For the exact GitHub -> Render -> Vercel deployment sequence, use [`docs/deployment-render-vercel.md`](docs/deployment-render-vercel.md).
