-- Migration 2/6: Extended get_admin_gym_checkins_stats
-- Safe: DROP + CREATE when RETURN TABLE columns change. Keeps checkins_today/week/month + top_gyms.

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
        FROM public.gym_checkins g
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
        FROM public.gym_checkins g
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
        FROM public.gym_checkins g
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
        FROM public.gym_checkins g
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
        FROM public.gym_checkins g
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
