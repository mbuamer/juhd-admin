# Deploy JUHD Dash (juhd-admin) to Vercel

## Step 1: Push to GitHub

1. Create a new repo on GitHub (e.g. `juhd-admin`)
2. In terminal, from the juhd-admin folder:

```bash
cd /Users/mohammedbuamer/Desktop/Juhd/juhd-admin
git remote add origin https://github.com/YOUR_USERNAME/juhd-admin.git
git add .
git commit -m "JUHD Admin dashboard"
git push -u origin main
```

(If your default branch is `master`, use `git push -u origin master`)

---

## Step 2: Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (GitHub)
2. Click **Add New** → **Project**
3. Import your `juhd-admin` repo
4. Vercel will auto-detect Next.js — click **Deploy**
5. **Before it finishes**, go to **Settings** → **Environment Variables**
6. Add:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://vzauxmocprkljhmufdqy.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (your anon key from Supabase)
7. Click **Save**
8. Go to **Deployments** → click the **⋯** on the latest → **Redeploy** (so it picks up env vars)

---

## Step 3: Add Custom Domain (optional)

1. In Vercel project → **Settings** → **Domains**
2. Add `admin.juhd.app` (or `admin.yourdomain.com`)
3. Follow Vercel’s DNS instructions (add the CNAME record they show)
4. Wait for DNS to propagate (a few minutes)

---

## Done

Your admin will be live at:
- `https://juhd-admin-xxx.vercel.app` (Vercel default)
- or `https://admin.juhd.app` (after adding the domain)
