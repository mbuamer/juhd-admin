-- Extend test-user exclusion to social/content/gym/top-users RPCs.
-- Prerequisite: admin_exclude_test_role.sql + admin_growth_dashboard_exclude_test.sql
-- Rule: activity counts only when the acting user (or both friendship ends) pass is_admin_dashboard_user(role).


-- Fix workouts today count (was missing test filter)
CREATE OR REPLACE FUNCTION public.get_admin_workouts_today_count()
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  caller_role text;
BEGIN
  SELECT role INTO caller_role FROM public.users WHERE id = auth.uid();
  IF caller_role IS NULL OR lower(caller_role) <> 'admin' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN (
    SELECT COUNT(*)::bigint
    FROM public.sessions s
    INNER JOIN public.users u ON u.id::text = s.user_id::text
    WHERE s.ended_at IS NOT NULL
      AND public.is_admin_dashboard_user(u.role)
      AND (s.ended_at AT TIME ZONE 'UTC')::date = (timezone('UTC', now()))::date
  );
END;
$func$;

-- Friendships: exclude edges where either user is role=test
DROP FUNCTION IF EXISTS public.get_admin_friends_stats();
CREATE OR REPLACE FUNCTION public.get_admin_friends_stats()
RETURNS TABLE (
  total_friendships bigint,
  pending_requests bigint,
  acceptance_rate_pct numeric,
  avg_friends_per_user numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_accepted bigint := 0;
  v_pending bigint := 0;
  v_eligible_users bigint := 0;
  v_friend_edges bigint := 0;
BEGIN
  PERFORM public._admin_require_admin();
  IF to_regclass('public.friendships') IS NULL THEN
    total_friendships := 0;
    pending_requests := 0;
    acceptance_rate_pct := 0;
    avg_friends_per_user := 0;
    RETURN NEXT;
    RETURN;
  END IF;
  SELECT count(*)::bigint INTO v_accepted
  FROM public.friendships f
  INNER JOIN public.users u1 ON u1.id = f.requester_id
  INNER JOIN public.users u2 ON u2.id = f.addressee_id
  WHERE lower(coalesce(f.status, '')) = 'accepted'
    AND public.is_admin_dashboard_user(u1.role)
    AND public.is_admin_dashboard_user(u2.role);
  SELECT count(*)::bigint INTO v_pending
  FROM public.friendships f
  INNER JOIN public.users u1 ON u1.id = f.requester_id
  INNER JOIN public.users u2 ON u2.id = f.addressee_id
  WHERE lower(coalesce(f.status, '')) = 'pending'
    AND public.is_admin_dashboard_user(u1.role)
    AND public.is_admin_dashboard_user(u2.role);
  SELECT count(*)::bigint INTO v_eligible_users
  FROM public.users u WHERE public.is_admin_dashboard_user(u.role);
  v_friend_edges := v_accepted;
  total_friendships := v_friend_edges;
  pending_requests := v_pending;
  acceptance_rate_pct := CASE
    WHEN (v_accepted + v_pending) > 0 THEN round(100.0 * v_accepted::numeric / (v_accepted + v_pending), 2)
    ELSE 0
  END;
  avg_friends_per_user := CASE
    WHEN v_eligible_users > 0 THEN round((2.0 * v_friend_edges::numeric) / v_eligible_users::numeric, 2)
    ELSE 0
  END;
  RETURN NEXT;
END;
$func$;
REVOKE ALL ON FUNCTION public.get_admin_friends_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_friends_stats() TO authenticated;

-- get_admin_top_users
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
      WHERE public.is_admin_dashboard_user(u.role) AND s.ended_at IS NOT NULL
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
      WHERE public.is_admin_dashboard_user(u.role) AND timezone('utc', p.created_at) >= v_start
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
      WHERE public.is_admin_dashboard_user(u.role) AND timezone('utc', g.checked_in_at) >= v_start
      GROUP BY u.id, u.username
      ORDER BY cnt DESC
      LIMIT v_lim
    ) t;
  END IF;

  RETURN v_result;
END;
$$;

-- get_admin_content_stats
DROP FUNCTION IF EXISTS public.get_admin_content_stats(text);

CREATE OR REPLACE FUNCTION public._admin_require_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND lower(u.role) = 'admin'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._admin_require_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._admin_require_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public._admin_period_start(p_period_days integer)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_period_days NOT IN (0, 1, 7, 30) THEN
    RAISE EXCEPTION 'invalid p_period_days';
  END IF;
  IF p_period_days = 0 THEN
    RETURN timestamptz '1970-01-01 00:00:00+00';
  END IF;
  RETURN date_trunc('day', timezone('utc', now())) - (p_period_days::text || ' days')::interval;
END;
$$;

REVOKE ALL ON FUNCTION public._admin_period_start(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._admin_period_start(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_content_stats(p_period text DEFAULT 'all')
RETURNS TABLE (
  posts_total bigint,
  posts_today bigint,
  posts_week bigint,
  posts_month bigint,
  comments_total bigint,
  comments_today bigint,
  comments_week bigint,
  comments_month bigint,
  likes_total bigint,
  likes_today bigint,
  likes_week bigint,
  likes_month bigint,
  reposts_total bigint,
  posts_by_type jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := timezone('utc', now());
  v_day_start timestamptz := date_trunc('day', v_now);
  v_week_start timestamptz := v_day_start - interval '6 days';
  v_month_start timestamptz := v_day_start - interval '29 days';
  v_posts_tbl regclass;
  v_comments_tbl regclass;
  v_likes_tbl regclass;
BEGIN
  PERFORM public._admin_require_admin();

  v_posts_tbl := to_regclass('public.posts');
  v_comments_tbl := to_regclass('public.post_comments');
  v_likes_tbl := to_regclass('public.post_likes');

  posts_total := 0;
  posts_today := 0;
  posts_week := 0;
  posts_month := 0;
  comments_total := 0;
  comments_today := 0;
  comments_week := 0;
  comments_month := 0;
  likes_total := 0;
  likes_today := 0;
  likes_week := 0;
  likes_month := 0;
  reposts_total := 0;
  posts_by_type := '{}'::jsonb;

  IF v_posts_tbl IS NOT NULL THEN
    EXECUTE $q$
      SELECT
        count(*)::bigint,
        count(*) FILTER (WHERE timezone('utc', p.created_at) >= $1)::bigint,
        count(*) FILTER (WHERE timezone('utc', p.created_at) >= $2)::bigint,
        count(*) FILTER (WHERE timezone('utc', p.created_at) >= $3)::bigint,
        count(*) FILTER (
          WHERE coalesce(p.is_repost, false) = true
             OR coalesce(p.post_type, '') = 'repost'
        )::bigint
      FROM public.posts p INNER JOIN public.users u ON u.id = p.user_id WHERE public.is_admin_dashboard_user(u.role)
    $q$
    INTO posts_total, posts_today, posts_week, posts_month, reposts_total
    USING v_day_start, v_week_start, v_month_start;

    EXECUTE $q$
      SELECT coalesce(
        jsonb_object_agg(x.post_type, x.cnt) FILTER (WHERE x.post_type IS NOT NULL),
        '{}'::jsonb
      )
      FROM (
        SELECT coalesce(nullif(trim(p.post_type::text), ''), 'unknown') AS post_type,
               count(*)::bigint AS cnt
        FROM public.posts p INNER JOIN public.users u ON u.id = p.user_id WHERE public.is_admin_dashboard_user(u.role)
        GROUP BY 1
      ) x
    $q$
    INTO posts_by_type;
  END IF;

  IF v_comments_tbl IS NOT NULL THEN
    EXECUTE $q$
      SELECT
        count(*)::bigint,
        count(*) FILTER (WHERE timezone('utc', c.created_at) >= $1)::bigint,
        count(*) FILTER (WHERE timezone('utc', c.created_at) >= $2)::bigint,
        count(*) FILTER (WHERE timezone('utc', c.created_at) >= $3)::bigint
      FROM public.post_comments c INNER JOIN public.users u ON u.id = c.user_id WHERE public.is_admin_dashboard_user(u.role)
    $q$
    INTO comments_total, comments_today, comments_week, comments_month
    USING v_day_start, v_week_start, v_month_start;
  END IF;

  IF v_likes_tbl IS NOT NULL THEN
    EXECUTE $q$
      SELECT
        count(*)::bigint,
        count(*) FILTER (WHERE timezone('utc', l.created_at) >= $1)::bigint,
        count(*) FILTER (WHERE timezone('utc', l.created_at) >= $2)::bigint,
        count(*) FILTER (WHERE timezone('utc', l.created_at) >= $3)::bigint
      FROM public.post_likes l INNER JOIN public.users u ON u.id = l.user_id WHERE public.is_admin_dashboard_user(u.role)
    $q$
    INTO likes_total, likes_today, likes_week, likes_month
    USING v_day_start, v_week_start, v_month_start;
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_content_stats(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_content_stats(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- get_admin_gym_checkins_stats
DROP FUNCTION IF EXISTS public.get_admin_gym_checkins_stats();
DROP FUNCTION IF EXISTS public.get_admin_gym_checkins_stats(integer);

CREATE OR REPLACE FUNCTION public.get_admin_gym_checkins_stats(p_period_days integer DEFAULT NULL)
RETURNS TABLE (
  checkins_today bigint,
  checkins_week bigint,
  checkins_month bigint,
  checkins_period bigint,
  top_gyms jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := timezone('utc', now());
  v_day_start timestamptz := date_trunc('day', v_now);
  v_week_start timestamptz := v_day_start - interval '6 days';
  v_month_start timestamptz := v_day_start - interval '29 days';
  v_period_start timestamptz;
  v_tbl regclass;
BEGIN
  PERFORM public._admin_require_admin();

  v_tbl := to_regclass('public.gym_checkins');
  checkins_today := 0;
  checkins_week := 0;
  checkins_month := 0;
  checkins_period := 0;
  top_gyms := '[]'::jsonb;

  IF v_tbl IS NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_period_days IS NOT NULL THEN
    v_period_start := public._admin_period_start(p_period_days);
  END IF;

  -- Prefer checked_in_at; fall back to created_at if present.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gym_checkins' AND column_name = 'checked_in_at'
  ) THEN
    IF p_period_days IS NULL THEN
      EXECUTE $q$
        SELECT
          count(*) FILTER (WHERE timezone('utc', g.checked_in_at) >= $1)::bigint,
          count(*) FILTER (WHERE timezone('utc', g.checked_in_at) >= $2)::bigint,
          count(*) FILTER (WHERE timezone('utc', g.checked_in_at) >= $3)::bigint
        FROM public.gym_checkins g INNER JOIN public.users u ON u.id = g.user_id WHERE public.is_admin_dashboard_user(u.role)
      $q$
      INTO checkins_today, checkins_week, checkins_month
      USING v_day_start, v_week_start, v_month_start;
    ELSE
      EXECUTE $q$
        SELECT
          count(*) FILTER (WHERE timezone('utc', g.checked_in_at) >= $1)::bigint,
          count(*) FILTER (WHERE timezone('utc', g.checked_in_at) >= $2)::bigint,
          count(*) FILTER (WHERE timezone('utc', g.checked_in_at) >= $3)::bigint,
          count(*) FILTER (WHERE timezone('utc', g.checked_in_at) >= $4)::bigint
        FROM public.gym_checkins g INNER JOIN public.users u ON u.id = g.user_id WHERE public.is_admin_dashboard_user(u.role)
      $q$
      INTO checkins_today, checkins_week, checkins_month, checkins_period
      USING v_day_start, v_week_start, v_month_start, v_period_start;
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gym_checkins' AND column_name = 'created_at'
  ) THEN
    IF p_period_days IS NULL THEN
      EXECUTE $q$
        SELECT
          count(*) FILTER (WHERE timezone('utc', g.created_at) >= $1)::bigint,
          count(*) FILTER (WHERE timezone('utc', g.created_at) >= $2)::bigint,
          count(*) FILTER (WHERE timezone('utc', g.created_at) >= $3)::bigint
        FROM public.gym_checkins g INNER JOIN public.users u ON u.id = g.user_id WHERE public.is_admin_dashboard_user(u.role)
      $q$
      INTO checkins_today, checkins_week, checkins_month
      USING v_day_start, v_week_start, v_month_start;
    ELSE
      EXECUTE $q$
        SELECT
          count(*) FILTER (WHERE timezone('utc', g.created_at) >= $1)::bigint,
          count(*) FILTER (WHERE timezone('utc', g.created_at) >= $2)::bigint,
          count(*) FILTER (WHERE timezone('utc', g.created_at) >= $3)::bigint,
          count(*) FILTER (WHERE timezone('utc', g.created_at) >= $4)::bigint
        FROM public.gym_checkins g INNER JOIN public.users u ON u.id = g.user_id WHERE public.is_admin_dashboard_user(u.role)
      $q$
      INTO checkins_today, checkins_week, checkins_month, checkins_period
      USING v_day_start, v_week_start, v_month_start, v_period_start;
    END IF;
  END IF;

  IF to_regclass('public.gyms') IS NOT NULL THEN
    EXECUTE $q$
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object('gym_name', t.gym_name, 'checkin_count', t.cnt)
          ORDER BY t.cnt DESC
        ),
        '[]'::jsonb
      )
      FROM (
        SELECT coalesce(nullif(trim(gy.name), ''), 'Unknown gym') AS gym_name,
               count(*)::bigint AS cnt
        FROM public.gym_checkins g INNER JOIN public.users u ON u.id = g.user_id WHERE public.is_admin_dashboard_user(u.role)
        LEFT JOIN public.gyms gy ON gy.id = g.gym_id
        WHERE (
          CASE
            WHEN EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'gym_checkins' AND column_name = 'checked_in_at'
            ) THEN timezone('utc', g.checked_in_at) >= $1
            ELSE timezone('utc', g.created_at) >= $1
          END
        )
        GROUP BY 1
        ORDER BY cnt DESC
        LIMIT 15
      ) t
    $q$
    INTO top_gyms
    USING v_month_start;
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_gym_checkins_stats(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_gym_checkins_stats(integer) TO authenticated;

-- Backward-compatible overload: no-arg call (existing juhd-admin / insights).
CREATE OR REPLACE FUNCTION public.get_admin_gym_checkins_stats()
RETURNS TABLE (
  checkins_today bigint,
  checkins_week bigint,
  checkins_month bigint,
  checkins_period bigint,
  top_gyms jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.get_admin_gym_checkins_stats(NULL::integer);
$$;

REVOKE ALL ON FUNCTION public.get_admin_gym_checkins_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_gym_checkins_stats() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- get_admin_metric_breakdown

CREATE OR REPLACE FUNCTION public.get_admin_metric_breakdown(
  p_metric text,
  p_period_days integer,
  p_dimension text DEFAULT 'city'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_dim text := lower(trim(coalesce(p_dimension, 'city')));
  v_metric text := lower(trim(coalesce(p_metric, '')));
  v_result jsonb := '[]'::jsonb;
BEGIN
  PERFORM public._admin_require_admin();
  v_start := public._admin_period_start(p_period_days);

  IF v_dim NOT IN ('city', 'gender') THEN
    RAISE EXCEPTION 'invalid p_dimension (use city or gender)';
  END IF;

  IF v_metric = 'signups' THEN
    IF v_dim = 'city' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'value', x.cnt) ORDER BY x.cnt DESC), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT coalesce(nullif(trim(u.city), ''), 'City not specified') AS label,
               count(*)::int AS cnt
        FROM public.users u
        WHERE public.is_admin_dashboard_user(u.role) AND u.created_at >= v_start
        GROUP BY 1
      ) x;
    ELSE
      SELECT coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'value', x.cnt) ORDER BY x.cnt DESC), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT coalesce(nullif(trim(u.gender), ''), 'Gender not specified') AS label,
               count(*)::int AS cnt
        FROM public.users u
        WHERE public.is_admin_dashboard_user(u.role) AND u.created_at >= v_start
        GROUP BY 1
      ) x;
    END IF;

  ELSIF v_metric = 'workouts' AND to_regclass('public.sessions') IS NOT NULL THEN
    IF v_dim = 'city' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'value', x.cnt) ORDER BY x.cnt DESC), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT coalesce(nullif(trim(u.city), ''), 'City not specified') AS label,
               count(*)::int AS cnt
        FROM public.sessions s
        JOIN public.users u ON u.id = s.user_id
        WHERE public.is_admin_dashboard_user(u.role) AND s.ended_at IS NOT NULL
          AND timezone('utc', s.ended_at) >= v_start
        GROUP BY 1
      ) x;
    ELSE
      SELECT coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'value', x.cnt) ORDER BY x.cnt DESC), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT coalesce(nullif(trim(u.gender), ''), 'Gender not specified') AS label,
               count(*)::int AS cnt
        FROM public.sessions s
        JOIN public.users u ON u.id = s.user_id
        WHERE public.is_admin_dashboard_user(u.role) AND s.ended_at IS NOT NULL
          AND timezone('utc', s.ended_at) >= v_start
        GROUP BY 1
      ) x;
    END IF;

  ELSIF v_metric = 'posts' AND to_regclass('public.posts') IS NOT NULL THEN
    IF v_dim = 'city' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'value', x.cnt) ORDER BY x.cnt DESC), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT coalesce(nullif(trim(u.city), ''), 'City not specified') AS label,
               count(*)::int AS cnt
        FROM public.posts p
        JOIN public.users u ON u.id = p.user_id
        WHERE public.is_admin_dashboard_user(u.role) AND timezone('utc', p.created_at) >= v_start
        GROUP BY 1
      ) x;
    ELSE
      SELECT coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'value', x.cnt) ORDER BY x.cnt DESC), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT coalesce(nullif(trim(u.gender), ''), 'Gender not specified') AS label,
               count(*)::int AS cnt
        FROM public.posts p
        JOIN public.users u ON u.id = p.user_id
        WHERE public.is_admin_dashboard_user(u.role) AND timezone('utc', p.created_at) >= v_start
        GROUP BY 1
      ) x;
    END IF;

  ELSIF v_metric = 'comments' AND to_regclass('public.post_comments') IS NOT NULL THEN
    IF v_dim = 'city' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'value', x.cnt) ORDER BY x.cnt DESC), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT coalesce(nullif(trim(u.city), ''), 'City not specified') AS label,
               count(*)::int AS cnt
        FROM public.post_comments c
        JOIN public.users u ON u.id = c.user_id
        WHERE public.is_admin_dashboard_user(u.role) AND timezone('utc', c.created_at) >= v_start
        GROUP BY 1
      ) x;
    ELSE
      SELECT coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'value', x.cnt) ORDER BY x.cnt DESC), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT coalesce(nullif(trim(u.gender), ''), 'Gender not specified') AS label,
               count(*)::int AS cnt
        FROM public.post_comments c
        JOIN public.users u ON u.id = c.user_id
        WHERE public.is_admin_dashboard_user(u.role) AND timezone('utc', c.created_at) >= v_start
        GROUP BY 1
      ) x;
    END IF;

  ELSIF v_metric = 'likes' AND to_regclass('public.post_likes') IS NOT NULL THEN
    IF v_dim = 'city' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'value', x.cnt) ORDER BY x.cnt DESC), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT coalesce(nullif(trim(u.city), ''), 'City not specified') AS label,
               count(*)::int AS cnt
        FROM public.post_likes l
        JOIN public.users u ON u.id = l.user_id
        WHERE public.is_admin_dashboard_user(u.role) AND timezone('utc', l.created_at) >= v_start
        GROUP BY 1
      ) x;
    ELSE
      SELECT coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'value', x.cnt) ORDER BY x.cnt DESC), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT coalesce(nullif(trim(u.gender), ''), 'Gender not specified') AS label,
               count(*)::int AS cnt
        FROM public.post_likes l
        JOIN public.users u ON u.id = l.user_id
        WHERE public.is_admin_dashboard_user(u.role) AND timezone('utc', l.created_at) >= v_start
        GROUP BY 1
      ) x;
    END IF;

  ELSIF v_metric = 'checkins' AND to_regclass('public.gym_checkins') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'gym_checkins' AND column_name = 'checked_in_at'
    ) THEN
      IF v_dim = 'city' THEN
        SELECT coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'value', x.cnt) ORDER BY x.cnt DESC), '[]'::jsonb)
        INTO v_result
        FROM (
          SELECT coalesce(nullif(trim(u.city), ''), 'City not specified') AS label,
                 count(*)::int AS cnt
          FROM public.gym_checkins g
          JOIN public.users u ON u.id = g.user_id
          WHERE public.is_admin_dashboard_user(u.role) AND timezone('utc', g.checked_in_at) >= v_start
          GROUP BY 1
        ) x;
      ELSE
        SELECT coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'value', x.cnt) ORDER BY x.cnt DESC), '[]'::jsonb)
        INTO v_result
        FROM (
          SELECT coalesce(nullif(trim(u.gender), ''), 'Gender not specified') AS label,
                 count(*)::int AS cnt
          FROM public.gym_checkins g
          JOIN public.users u ON u.id = g.user_id
          WHERE public.is_admin_dashboard_user(u.role) AND timezone('utc', g.checked_in_at) >= v_start
          GROUP BY 1
        ) x;
      END IF;
    END IF;

  ELSIF v_metric = 'premium_new' AND to_regclass('public.premium_upgrade_events') IS NOT NULL THEN
    IF v_dim = 'city' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'value', x.cnt) ORDER BY x.cnt DESC), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT coalesce(nullif(trim(u.city), ''), 'City not specified') AS label,
               count(*)::int AS cnt
        FROM public.premium_upgrade_events e
        JOIN public.users u ON u.id = e.user_id
        WHERE public.is_admin_dashboard_user(u.role) AND e.upgraded_at >= v_start
        GROUP BY 1
      ) x;
    ELSE
      SELECT coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'value', x.cnt) ORDER BY x.cnt DESC), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT coalesce(nullif(trim(u.gender), ''), 'Gender not specified') AS label,
               count(*)::int AS cnt
        FROM public.premium_upgrade_events e
        JOIN public.users u ON u.id = e.user_id
        WHERE public.is_admin_dashboard_user(u.role) AND e.upgraded_at >= v_start
        GROUP BY 1
      ) x;
    END IF;

  ELSIF v_metric = 'deletions' AND to_regclass('public.account_deletion_log') IS NOT NULL THEN
    IF v_dim = 'city' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'value', x.cnt) ORDER BY x.cnt DESC), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT coalesce(nullif(trim(d.city), ''), 'City not specified') AS label,
               count(*)::int AS cnt
        FROM public.account_deletion_log d
        WHERE d.deleted_at >= v_start
        GROUP BY 1
      ) x;
    ELSE
      SELECT coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'value', x.cnt) ORDER BY x.cnt DESC), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT coalesce(nullif(trim(d.gender), ''), 'Gender not specified') AS label,
               count(*)::int AS cnt
        FROM public.account_deletion_log d
        WHERE d.deleted_at >= v_start
        GROUP BY 1
      ) x;
    END IF;

  ELSE
    v_result := '[]'::jsonb;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_metric_breakdown(text, integer, text) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
