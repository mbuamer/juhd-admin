-- Migration 6/6: Top users leaderboard + reports in period + growth dashboard premium KPI fix
-- Safe: new RPCs + replaces get_growth_dashboard body to set real v_premium_new when possible.

CREATE OR REPLACE FUNCTION public.get_admin_top_users(
  p_period_days integer,
  p_metric text DEFAULT 'workouts',
  p_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_metric text := lower(trim(coalesce(p_metric, 'workouts')));
  v_lim int := greatest(1, least(coalesce(p_limit, 25), 100));
  v_result jsonb := '[]'::jsonb;
BEGIN
  PERFORM public._admin_require_admin();
  v_start := public._admin_period_start(p_period_days);

  IF v_metric = 'workouts' AND to_regclass('public.sessions') IS NOT NULL THEN
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', t.user_id,
          'username', t.username,
          'count', t.cnt
        ) ORDER BY t.cnt DESC
      ),
      '[]'::jsonb
    )
    INTO v_result
    FROM (
      SELECT u.id::text AS user_id,
             coalesce(nullif(trim(u.username), ''), u.id::text) AS username,
             count(*)::int AS cnt
      FROM public.sessions s
      JOIN public.users u ON u.id = s.user_id
      WHERE s.ended_at IS NOT NULL
        AND timezone('utc', s.ended_at) >= v_start
      GROUP BY u.id, u.username
      ORDER BY cnt DESC
      LIMIT v_lim
    ) t;

  ELSIF v_metric = 'posts' AND to_regclass('public.posts') IS NOT NULL THEN
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object('user_id', t.user_id, 'username', t.username, 'count', t.cnt)
        ORDER BY t.cnt DESC
      ),
      '[]'::jsonb
    )
    INTO v_result
    FROM (
      SELECT u.id::text AS user_id,
             coalesce(nullif(trim(u.username), ''), u.id::text) AS username,
             count(*)::int AS cnt
      FROM public.posts p
      JOIN public.users u ON u.id = p.user_id
      WHERE timezone('utc', p.created_at) >= v_start
      GROUP BY u.id, u.username
      ORDER BY cnt DESC
      LIMIT v_lim
    ) t;

  ELSIF v_metric = 'checkins' AND to_regclass('public.gym_checkins') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'gym_checkins' AND column_name = 'checked_in_at'
    ) THEN
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object('user_id', t.user_id, 'username', t.username, 'count', t.cnt)
        ORDER BY t.cnt DESC
      ),
      '[]'::jsonb
    )
    INTO v_result
    FROM (
      SELECT u.id::text AS user_id,
             coalesce(nullif(trim(u.username), ''), u.id::text) AS username,
             count(*)::int AS cnt
      FROM public.gym_checkins g
      JOIN public.users u ON u.id = g.user_id
      WHERE timezone('utc', g.checked_in_at) >= v_start
      GROUP BY u.id, u.username
      ORDER BY cnt DESC
      LIMIT v_lim
    ) t;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_top_users(integer, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_top_users(integer, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_reports_in_period(p_period_days integer)
RETURNS TABLE (
  new_post_reports bigint,
  new_bug_reports bigint,
  pending_post_reports bigint,
  pending_bug_reports bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
BEGIN
  PERFORM public._admin_require_admin();
  v_start := public._admin_period_start(p_period_days);

  new_post_reports := 0;
  new_bug_reports := 0;
  pending_post_reports := 0;
  pending_bug_reports := 0;

  IF to_regclass('public.post_reports') IS NOT NULL THEN
    EXECUTE $q$
      SELECT
        count(*) FILTER (WHERE timezone('utc', r.created_at) >= $1)::bigint,
        count(*) FILTER (WHERE coalesce(r.status, 'pending') = 'pending')::bigint
      FROM public.post_reports r
    $q$
    INTO new_post_reports, pending_post_reports
    USING v_start;
  END IF;

  IF to_regclass('public.bug_reports') IS NOT NULL THEN
    EXECUTE $q$
      SELECT
        count(*) FILTER (WHERE timezone('utc', b.created_at) >= $1)::bigint,
        count(*) FILTER (WHERE coalesce(b.status, 'pending') = 'pending')::bigint
      FROM public.bug_reports b
    $q$
    INTO new_bug_reports, pending_bug_reports
    USING v_start;
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_reports_in_period(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_reports_in_period(integer) TO authenticated;

-- Premium in get_growth_dashboard: do NOT replace that function here (would break charts/KPIs).
-- juhd-admin should call get_admin_premium_upgrades_in_period(1|7|30) alongside growth fetch.

NOTIFY pgrst, 'reload schema';
