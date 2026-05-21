# juhd-admin — local dashboard test

Use this before deploying web changes. Your checklist (test exclusion, avg/day KPIs, daily signup/workout charts) only works when **live** RPC data is loaded.

## 1. Environment

```bash
cd ~/Desktop/Juhd/juhd-admin
cp .env.local.example .env.local   # skip if .env.local exists
```

Set in `.env.local` (from `JUHD APP/FitLog/SupabaseConfig.xcconfig`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Do **not** set `NEXT_PUBLIC_GROWTH_USE_MOCK=true` for this test.

## 2. Supabase SQL (required once per fix)

In Supabase SQL editor, run in order:

1. `JUHD APP/FitLog/scripts/admin_exclude_test_role.sql`
2. `JUHD APP/FitLog/scripts/admin_protect_user_roles.sql`
3. `JUHD APP/FitLog/scripts/admin_workouts_today_rpc.sql`
4. `JUHD APP/FitLog/scripts/admin_growth_dashboard_exclude_test.sql` (re-run after chart fixes)

Optional verify: `JUHD APP/FitLog/scripts/admin_local_dashboard_verify.sql`

Tag test accounts:

```sql
UPDATE public.users SET role = 'test'
WHERE email LIKE '%@fitlog.test' OR username LIKE 'test_user_%';
```

## 3. Start dev server

```bash
cd ~/Desktop/Juhd/juhd-admin
npm install
npm run dev
```

**First launch can take ~60 seconds** before you see `✓ Ready` and `Local: http://localhost:3000`. Leave the terminal open until that line appears — Safari will fail if you open the URL too early.

If `npm run dev` prints only `> next dev` and nothing else for 2+ minutes, stop it (Ctrl+C) and run:

```bash
npm run dev
```

(the default script uses `--webpack`, which is more reliable on this machine than Turbopack-only startup).

Open **http://127.0.0.1:3000/admin/login** (prefer `127.0.0.1` over `localhost` in Safari), sign in as `role = admin`, then use the sidebar **Growth analytics** link.

Do **not** bookmark `/admin/analytics-dashboard` as the first URL — that page is large; the first load can take 1–3 minutes while the terminal shows `Compiling /admin/analytics-dashboard …`. Safari may show a WebKit error if you open it before compile finishes.

### Safari “WebKit encountered an internal error”

1. Use **http://127.0.0.1:3000/admin/login** (not `localhost`).
2. Watch the terminal until compile lines stop, then refresh.
3. Or use **Chrome** for the first visit to that route.
4. Confirm `.env.local` has real Supabase URL + anon key (not the placeholder).

## 4. Checklist (your requirements)

| Check | What to look for |
|-------|------------------|
| Test exclusion | Footer note: counts exclude `role=test`. After tagging test users, **Total users** / **Signups** drop. |
| Data source | Period panel badge is **live** (green), not hybrid/mock. |
| Avg / day | **Avg signups / day** and **Avg workouts / day** on Weekly (÷7), Monthly (÷30), Yearly (÷365). |
| Signups chart | **Monthly** → **30** daily labels (`Mon DD`); **Weekly** → 7; **Yearly** → 12 monthly labels. |
| Workouts chart | Same bucket rules; test users’ sessions excluded. |
| Network | `get_growth_dashboard` with `p_period_days: 30` → `signUpsOverTime` length 30; `365` → length 12. |

## 5. If numbers do not change

- SQL not applied or old function still cached → re-run step 4 script (includes `DROP FUNCTION`).
- Badge still **hybrid** → full RPC parse failed; check Supabase logs or `fetchNote` on the page.
- No test users tagged → exclusion has nothing to subtract.
- Mock env var set → remove `NEXT_PUBLIC_GROWTH_USE_MOCK`.
