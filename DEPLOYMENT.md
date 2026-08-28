# Deploying Lab Manager ($0/month)

This puts the app on a real public URL using two free services:

- **Neon** — free, persistent Postgres database (your data survives redeploys)
- **Render** — free hosting for both the backend (Flask API) and frontend (React site)

**Tradeoff of the free tier:** the backend "sleeps" after ~15 minutes of no traffic. The next request after that wakes it up, which takes ~30–50 seconds. No data is lost — it's just a one-time delay. No credit card is required for either service's free tier as of this writing (always double-check on their pricing pages, since providers change terms over time).

---

## 1. Create the database (Neon)

1. Go to [neon.tech](https://neon.tech) and sign up (free).
2. Create a new project — name it anything, e.g. "labinventory".
3. On the project dashboard, find the **connection string** (looks like `postgresql://user:password@ep-xxxx.neon.tech/dbname?sslmode=require`). Copy it — you'll paste it into Render in step 3.

## 2. Push your code to GitHub

Already done if you're reading this after Claude committed and pushed — confirm with:

```bash
git status
git log --oneline -3
```

Your repo should be at `https://github.com/<your-username>/LabInventory`.

## 3. Deploy on Render

### Fast path: Blueprint

The repo includes a `render.yaml` that defines both services at once.

1. Go to [render.com](https://render.com) and sign up (free).
2. Click **New** → **Blueprint**, connect your GitHub account, and select the `LabInventory` repo.
3. Render reads `render.yaml` and shows two services: `labinventory-api` (backend) and `labinventory-client` (frontend). Click **Apply**.
4. It'll ask you to fill in the env vars marked `sync: false` before it can deploy. For now, leave `DATABASE_URL`, `CORS_ORIGINS`, and `VITE_API_URL` blank — you'll set them in step 4 below once you know both services' URLs. `SECRET_KEY`, `JWT_SECRET_KEY`, and `REMINDER_SECRET` are auto-generated for you.

### Fallback: manual setup

If the Blueprint import doesn't behave as expected, do it manually:

**Backend:**
1. New → Web Service → connect the repo.
2. Root directory: `server`
3. Runtime: Python
4. Build command: `pip install -r requirements.txt`
5. Start command: `gunicorn app:app`
6. Plan: Free
7. Add env vars: `SECRET_KEY`, `JWT_SECRET_KEY` (generate with `python3 -c "import secrets; print(secrets.token_hex(32))"` — do this twice, once per key), plus `DATABASE_URL` (from Neon).

**Frontend:**
1. New → Static Site → connect the repo.
2. Root directory: `client`
3. Build command: `npm install && npm run build`
4. Publish directory: `dist`
5. Add a rewrite rule: source `/*` → destination `/index.html` (so client-side routing works on refresh).

## 4. Connect the two services together

Once both services have deployed once, you'll have two URLs, e.g.:
- Backend: `https://labinventory-api.onrender.com`
- Frontend: `https://labinventory-client.onrender.com`

Now go back and set the remaining env vars:

- On **labinventory-api**: set `DATABASE_URL` to your Neon connection string, and `CORS_ORIGINS` to your frontend's exact URL (e.g. `https://labinventory-client.onrender.com`).
- On **labinventory-client**: set `VITE_API_URL` to your backend's URL + `/api` (e.g. `https://labinventory-api.onrender.com/api`).

Trigger a manual redeploy on both services after setting these (Render's dashboard has a "Manual Deploy" button per service).

## 5. Test it

Open your frontend URL. Sign up as the first user of a new lab (you'll become its Lab Coordinator). The first request may take ~30-50 seconds if the backend was asleep — that's normal.

## 6. Optional: email reminders for incubation pickup

The app has a `/api/reminders/check` endpoint that emails whoever started an incubation once it's done, but nothing calls it automatically on the free tier. Two things needed:

**A. A Resend account** (for actually sending email) — sign up free at [resend.com](https://resend.com), grab an API key from **API Keys** in the sidebar. Email is sent via Resend's HTTP API rather than SMTP, since most free-tier hosts (including Render) block outbound SMTP ports entirely. On **labinventory-api**, set:
- `RESEND_API_KEY` (the key from Resend)
- `FROM_EMAIL` — use `onboarding@resend.dev` to start (works immediately, no setup), or your own verified domain address later

**B. A free scheduler** to actually call the endpoint every few minutes — e.g. [cron-job.org](https://cron-job.org) (free account):
1. Create a new cron job.
2. URL: `https://labinventory-api.onrender.com/api/reminders/check`
3. Method: `POST`
4. Custom header: `X-Reminder-Key: <value>` — find this value in Render under labinventory-api's environment variables (`REMINDER_SECRET`, auto-generated in step 3).
5. Interval: every 5-15 minutes.

This also has a nice side effect: it keeps ping-ing your backend, which reduces how often it falls asleep.

## Known limits to plan around

- **Cold starts**: ~30-50s wait after 15 min of inactivity (free tier).
- **No automated backups beyond Neon's own** — Neon's free tier has its own retention limits; check their current docs if you want longer history.
- **No CI/tests** — verify changes locally (like we've been doing) before pushing to `main`, since a push to `main` auto-deploys.
