# Product Price Tracker

A full-stack product price tracking application for monitoring product prices from a mock storefront.

## Tech Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: Supabase PostgreSQL
- Scraping: Playwright-based live offer capture
- Scheduler: external cron service (for example, cron-job.org)

## Local development

### 1. Install dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 2. Configure environment variables

Create a backend `.env` file from the example:

```bash
cd backend
cp .env.example .env
```

Example values:

```env
PORT=5000
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
FRONTEND_URL=http://localhost:5173
SCHEDULER_SECRET=replace-with-a-long-random-secret
```

Create a frontend `.env` file from the example:

```bash
cd ../frontend
cp .env.example .env
```

Example:

```env
VITE_API_BASE_URL=http://localhost:5000
```

Do not commit `.env` files. Keep `DATABASE_URL` and `SCHEDULER_SECRET` on the backend only.

### 3. Start backend

```bash
cd backend
npm start
```

### 4. Start frontend

```bash
cd frontend
npm run dev
```

The frontend should run on `http://localhost:5173` and call the backend at `http://localhost:5000` by default.

## Supabase

1. Create a Supabase project.
2. Copy the PostgreSQL connection string from the project settings.
3. Put it in the backend `.env` file as `DATABASE_URL`.
4. Make sure the backend migration is applied:

```bash
cd backend
npm run db:migrate
```

Important:
- `DATABASE_URL` belongs only in the backend environment.
- Never expose it to the frontend.
- Keep secrets out of the repository.

## Render deployment

This project is prepared for deployment on Render as a backend service.

### Required backend environment variables

Set these in the Render dashboard or via Render environment variables:

- `PORT` (supplied by Render automatically)
- `DATABASE_URL`
- `FRONTEND_URL` (production frontend origin, for example `https://your-frontend.vercel.app`)
- `SCHEDULER_SECRET`
- `NODE_ENV=production`

### Render build and start commands

Use the backend app directory as the service root.

Build command:

```bash
npm install
npx playwright install --with-deps chromium
```

Start command:

```bash
npm start
```

Health check path:

```text
/api/health
```

This endpoint must return:

```json
{ "status": "ok" }
```

You do not need to create a separate database on Render because Supabase PostgreSQL is already being used.

## Vercel deployment

The frontend is a standard React + Vite project and does not require a custom Vercel config for normal usage.

Set this variable in the Vercel project environment:

```env
VITE_API_BASE_URL=https://your-render-backend-url
```

Do not set `DATABASE_URL` or `SCHEDULER_SECRET` in the frontend environment.

## Scheduler

The scheduler endpoint is protected and should only be called by an external cron service.

Endpoint:

```text
POST https://<RENDER-BACKEND>/api/scheduler/scrape
```

Header:

```http
Authorization: Bearer <SCHEDULER_SECRET>
```

Recommended schedule:
- run every 2 hours
- use `cron-job.org` or another external scheduler

The exact production backend URL should be added after deployment.

## Security review

- `.env` files are gitignored.
- No real secrets are committed to the repository.
- `DATABASE_URL` is not exposed to the frontend.
- `SCHEDULER_SECRET` is not exposed to the frontend.
- Error responses do not expose application stack traces.
- The scheduler requires an `Authorization` bearer token.
- CORS is restricted to known frontend origins when `FRONTEND_URL` is configured.

## Database and scraping notes

- Failed attempts are stored as separate rows and do not overwrite prior attempts.
- `outcome` is restricted to `success`, `retried`, or `failed`.
- Failed attempts always use `NULL` for `price` and `stock`.
- `stock_status` distinguishes sold out from unknown or missing stock.
- A real sold-out result is stored as `stock_status = 'sold_out'` and `stock = 0`.

## Testing

```bash
cd backend
node --test
```

```bash
cd frontend
npm run build
```

## Deployment checklist

Before actual deployment:
- confirm backend `.env` values are set in the hosting platform
- confirm frontend `VITE_API_BASE_URL` points to the Render backend URL
- confirm `FRONTEND_URL` matches the deployed Vercel domain
- confirm the scheduler secret is set but not exposed to the frontend
- confirm the backend health endpoint is reachable
- confirm the scheduler endpoint is protected by bearer auth

Do not copy real secrets into the repository or into issue trackers.
