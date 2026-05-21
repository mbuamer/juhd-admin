-- Charts tab: goal distribution + activity patterns (excludes role=test).
-- Prerequisite: admin_exclude_test_role.sql (is_admin_dashboard_user).
-- Run in Supabase SQL editor after other admin migrations.

CREATE OR REPLACE FUNCTION public.get_admin_goal_distribution()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '[]'::jsonb;
BEGIN
  PERFORM public._admin_require_admin();
  IF to_regclass('public.user_body_settings') IS NULL THEN
    RETURN v_result;
  END IF;

  SELECT coalesce(
    jsonb_agg(jsonb_build_object('label', x.label, 'value', x.cnt) ORDER BY x.cnt DESC),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT
      CASE lower(trim(ubs.goal_type))
        WHEN 'lose_fat' THEN 'Lose fat'
        WHEN 'build_muscle' THEN 'Build muscle'
        WHEN 'recomp' THEN 'Recomp'
        WHEN 'maintain' THEN 'Maintain'
        ELSE initcap(replace(coalesce(ubs.goal_type, 'unknown'), '_', ' '))
      END AS label,
      count(*)::int AS cnt
    FROM public.user_body_settings ubs
    INNER JOIN public.users u ON u.id = ubs.user_id
    WHERE public.is_admin_dashboard_user(u.role)
    GROUP BY 1
  ) x;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_activity_patterns(p_period_days integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_hours jsonb := '[]'::jsonb;
  v_weekdays jsonb := '[]'::jsonb;
BEGIN
  PERFORM public._admin_require_admin();
  IF p_period_days NOT IN (7, 30, 365) THEN
    RAISE EXCEPTION 'invalid p_period_days';
  END IF;
  v_start := public._admin_period_start(p_period_days);

  IF to_regclass('public.analytics_events') IS NULL THEN
    RETURN jsonb_build_object('byHour', v_hours, 'byWeekday', v_weekdays);
  END IF;

  SELECT coalesce(
    jsonb_agg(jsonb_build_object('label', to_char(h, 'FM00') || ':00', 'value', cnt) ORDER BY h),
    '[]'::jsonb
  )
  INTO v_hours
  FROM (
    SELECT extract(hour FROM timezone('utc', (e.timestamp)::timestamptz))::int AS h,
           count(*)::int AS cnt
    FROM public.analytics_events e
    INNER JOIN public.users u ON u.id = e.user_id
    WHERE e.user_id IS NOT NULL
      AND public.is_admin_dashboard_user(u.role)
      AND timezone('utc', (e.timestamp)::timestamptz) >= v_start
    GROUP BY 1
  ) hr;

  SELECT coalesce(
    jsonb_agg(jsonb_build_object('label', wd, 'value', cnt) ORDER BY ord),
    '[]'::jsonb
  )
  INTO v_weekdays
  FROM (
    SELECT
      CASE extract(dow FROM timezone('utc', (e.timestamp)::timestamptz))::int
        WHEN 0 THEN 'Sun'
        WHEN 1 THEN 'Mon'
        WHEN 2 THEN 'Tue'
        WHEN 3 THEN 'Wed'
        WHEN 4 THEN 'Thu'
        WHEN 5 THEN 'Fri'
        ELSE 'Sat'
      END AS wd,
      CASE extract(dow FROM timezone('utc', (e.timestamp)::timestamptz))::int
        WHEN 0 THEN 0 WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 3
        WHEN 4 THEN 4 WHEN 5 THEN 5 ELSE 6
      END AS ord,
      count(*)::int AS cnt
    FROM public.analytics_events e
    INNER JOIN public.users u ON u.id = e.user_id
    WHERE e.user_id IS NOT NULL
      AND public.is_admin_dashboard_user(u.role)
      AND timezone('utc', (e.timestamp)::timestamptz) >= v_start
    GROUP BY 1, 2
  ) wd;

  RETURN jsonb_build_object('byHour', v_hours, 'byWeekday', v_weekdays);
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_goal_distribution() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_activity_patterns(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_goal_distribution() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_activity_patterns(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
