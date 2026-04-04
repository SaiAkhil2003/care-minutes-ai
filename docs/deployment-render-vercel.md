# Care Minutes AI Deployment Guide

This repository is prepared for:

- Backend: Render
- Frontend: Vercel
- Data layer in production: Supabase recommended

## 1. Push the repository to GitHub

1. Create a GitHub repository.
2. Add the remote locally.
3. Push the default branch.

```bash
git remote add origin <your-github-repo-url>
git push -u origin main
```

## 2. Deploy the backend to Render

This repository includes a root [`render.yaml`](../render.yaml) blueprint for the backend service.

### Recommended production mode

Use:

- `DATA_PROVIDER=supabase`
- `SUPABASE_URL`
- `SUPABASE_KEY`

Do not use file mode on Render unless you intentionally attach a persistent disk.

### Render steps

1. In Render, choose `New +` and then `Blueprint`.
2. Connect the GitHub repository.
3. Render will detect [`render.yaml`](../render.yaml) and create the `care-minutes-ai-backend` web service.
4. In the service environment settings, set these values before the first production rollout:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
5. Optional variables:
   - `CORS_ORIGIN`
   - `ANTHROPIC_API_KEY`
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`
6. Keep `ENABLE_ALERT_SCHEDULER=false` for the first deployment. Turn it on later only for one backend instance if you want scheduled alerts.
7. Deploy the service.
8. After deploy, note the Render backend URL, for example `https://care-minutes-ai-backend.onrender.com`.

You can leave `CORS_ORIGIN` unset for the very first backend deploy. The API will still start, and you will set `CORS_ORIGIN` after Vercel gives you the frontend production URL.

### If you intentionally use file mode on Render

1. In Render, attach a persistent disk to the backend service.
2. Set:
   - `DATA_PROVIDER=file`
   - `LOCAL_DATA_FILE=/var/data/care-minutes-ai.json` or another path on the mounted disk
3. Redeploy.

Without a persistent disk, file mode on Render is not durable and should be treated as unsafe for production data.

## 3. Deploy the frontend to Vercel

This repository includes [`frontend/vercel.json`](../frontend/vercel.json).

### Vercel steps

1. In Vercel, choose `Add New...` and then `Project`.
2. Import the GitHub repository.
3. Set the project `Root Directory` to `frontend`.
4. Confirm these settings:
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Output directory: `dist`
5. Set:
   - `VITE_API_BASE_URL=https://your-render-backend-url.onrender.com`
6. Deploy the project.
7. Note the Vercel production URL, for example `https://care-minutes-ai-frontend.vercel.app`.

## 4. Connect the frontend to the backend

Because the frontend needs the Render backend URL and the backend needs the frontend origin for CORS, use this order:

1. Deploy the backend on Render first.
2. Deploy the frontend on Vercel using the Render backend URL in `VITE_API_BASE_URL`.
3. Copy the Vercel production URL.
4. Update the Render backend variable:
   - `CORS_ORIGIN=https://your-vercel-project.vercel.app`
5. Redeploy the Render backend.

After that, the deployed frontend can call the deployed backend from the browser.

## 5. Health and readiness checks

After Render deployment:

1. Open `https://your-render-backend.onrender.com/health`
2. Confirm the JSON includes `status: ok`
3. Open `https://your-render-backend.onrender.com/ready`
4. Confirm the JSON includes `status: ready`

If `/ready` returns `503`, fix the reported configuration issue before continuing.

## 6. Post-deploy verification checklist

Frontend:

1. Open the Vercel production URL.
2. Confirm the dashboard loads.
3. Confirm facility data appears.
4. Confirm there are no browser CORS errors.

Backend:

1. Confirm `/health` returns `200`.
2. Confirm `/ready` returns `200`.
3. Confirm `data_mode` matches your intended deployment mode.

End-to-end:

1. Load the dashboard.
2. Create or edit a staff member.
3. Create or edit a shift.
4. Run the AI alert action.
5. Download the PDF.

## 7. Later custom domain setup

Suggested split:

- Frontend: `app.yourdomain.com`
- Backend: `api.yourdomain.com`

When you add custom domains later:

1. Add the frontend domain in Vercel.
2. Add the backend domain in Render.
3. Update backend:
   - `CORS_ORIGIN=https://app.yourdomain.com`
4. Update frontend:
   - `VITE_API_BASE_URL=https://api.yourdomain.com`
5. Redeploy both services.

## 8. Preview deployment note

The backend CORS configuration uses explicit origins. That is appropriate for production, but it means Vercel preview deployments are not automatically allowed unless you add their exact preview origins to `CORS_ORIGIN`.

For the initial deployment, keep `CORS_ORIGIN` set to the single Vercel production URL.
