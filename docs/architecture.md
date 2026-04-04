# Care Minutes AI Architecture

## Structure

- `frontend/`: React 19 + Vite dashboard
- `backend/`: Express 5 API
- `shared/`: compliance, forecast, and reporting calculations shared across the app and tests
- `database/`: Supabase schema, migrations, and local file-store data

## Data modes

- `DATA_PROVIDER=file`: local JSON-backed repository for development and test
- `DATA_PROVIDER=supabase`: hosted repository for production-style deployments

The backend defaults to file mode outside production so the MVP boots without external services.

## Core flows

- Dashboard: frontend calls `/dashboard/summary`, `/forecast/quarterly`, and `/reports`
- Shift and staff management: frontend calls `/staff` and `/shifts`
- AI alerting: frontend or scheduler calls `/ai-alerts/run`
- Reporting: frontend downloads `/reports/audit.pdf`

## Compliance model

- Daily total target and RN minimum come from facility config or effective-dated compliance tables
- Total care compliance counts RN, EN, and PCW minutes
- RN compliance counts RN minutes only
- Overall compliance status uses the lower of total-care and RN compliance
- Agency minutes count toward total minutes and are tracked separately from non-agency minutes

## Deployment split

- Frontend: Vercel static deployment from `frontend/`
- Backend: Render web service from `backend/`
- Database: Supabase in the Sydney region when used

## Tenant isolation

- The current Supabase integration is still backend-scoped: the API accepts `facility_id` and applies facility filters in repository calls.
- The schema already includes RLS policies keyed off JWT facility claims, but the current app does not implement sign-in, JWT issuance/forwarding, or per-request claim propagation.
- Using a backend key alone does not create end-user tenant isolation. A correct RLS-enforced version would require a real auth/session flow plus repository requests executed with the caller JWT.
