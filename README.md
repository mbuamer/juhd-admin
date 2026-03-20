# JUHD Admin

Web-based admin dashboard for the JUHD fitness app.

## Setup

1. **Copy environment variables:**
   ```bash
   cp .env.local.example .env.local
   ```

2. **Edit `.env.local`** and add your Supabase credentials (same as your FitLog app):
   - `NEXT_PUBLIC_SUPABASE_URL` — from SupabaseConfig.xcconfig or Supabase dashboard
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — your anon/public key

3. **Install and run:**
   ```bash
   npm install
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/admin` → `/admin/login`.

5. **Log in** with an admin account (your JUHD user with `role = 'admin'` in the `users` table).

## Deploy to Vercel

1. Push this folder to GitHub.
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo.
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy. Optionally add a custom domain (e.g. `admin.juhd.app`).

## Structure

- `/admin` — redirects to login or dashboard
- `/admin/login` — sign in (admin only)
- `/admin/dashboard` — main dashboard (protected)
