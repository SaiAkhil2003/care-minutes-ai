# Care Minutes AI Frontend

The frontend is a Vite-built React app. For full project setup and deployment guidance, use the root guide in `../readme.md`.

## Frontend env

- Local Vite dev uses the `/api` proxy automatically.
- Local built previews on `localhost` fall back to `http://localhost:${VITE_API_PORT}` when `VITE_API_BASE_URL` is unset.
- Production builds should set `VITE_API_BASE_URL` when the backend is hosted on a different origin.
- Leave `VITE_API_BASE_URL` unset in production only if your host rewrites `/api/*` to the backend.

## Deep links

The current MVP uses a single frontend route and stores the selected facility in the query string, for example `/?facilityId=<uuid>`. Static hosting only needs to serve the app root. If client-side routes are added later, configure an SPA fallback to `index.html`.
