# JUHD Admin – Deployment Notes

## SQL Scripts to Run in Supabase

Run these in order in the Supabase SQL Editor:

1. **ADD_ADMIN_ANALYTICS_RPCS.sql** (if not already run) – signups, premium count, pending reports, error counts
2. **ADD_ADMIN_REPORTS_RPCS.sql** – content stats, gym check-ins, retention, friends, routines, exercises, targeted push count, single-user push

Location: `../MYFITNESSAPP/sql_scripts/ADD_ADMIN_REPORTS_RPCS.sql` (or your FitLog project root)

## New Features

### Insights (`/admin/insights`)
- **Content** – Posts total/today/week/month, comments, likes, reposts, posts by type
- **Revenue** – Placeholder (needs RevenueCat or App Store webhooks)
- **Gym check-ins** – Today, week, month, top gyms
- **Retention** – Week 1 and Week 4 cohort retention
- **Friends** – Total friendships, pending requests, acceptance rate, avg friends per user
- **Routines & exercises** – Explore routine usage, most logged exercises

### Notifications
- **Single-user push** – Send push to one user (e.g. after resolving a bug)
- **Targeted push** – Filter by gender, city, age min/max with “Will be sent to X users” preview

### Users
- **View as user** – View user details, copy user ID, quick link to send push
