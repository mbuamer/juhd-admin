-- Migration 4/6: Breakdown tables for analytics hub (city / gender)
-- Safe: new RPC only. p_metric + p_period_days + p_dimension.

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
        WHERE u.created_at >= v_start
        GROUP BY 1
      ) x;
    ELSE
      SELECT coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'value', x.cnt) ORDER BY x.cnt DESC), '[]'::jsonb)
      INTO v_result
      FROM (
        SELECT coalesce(nullif(trim(u.gender), ''), 'Gender not specified') AS label,
               count(*)::int AS cnt
        FROM public.users u
        WHERE u.created_at >= v_start
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
        WHERE s.ended_at IS NOT NULL
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
        WHERE s.ended_at IS NOT NULL
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
        WHERE timezone('utc', p.created_at) >= v_start
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
        WHERE timezone('utc', p.created_at) >= v_start
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
        WHERE timezone('utc', c.created_at) >= v_start
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
        WHERE timezone('utc', c.created_at) >= v_start
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
        WHERE timezone('utc', l.created_at) >= v_start
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
        WHERE timezone('utc', l.created_at) >= v_start
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
          WHERE timezone('utc', g.checked_in_at) >= v_start
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
          WHERE timezone('utc', g.checked_in_at) >= v_start
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
        WHERE e.upgraded_at >= v_start
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
        WHERE e.upgraded_at >= v_start
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
GRANT EXECUTE ON FUNCTION public.get_admin_metric_breakdown(text, integer, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
