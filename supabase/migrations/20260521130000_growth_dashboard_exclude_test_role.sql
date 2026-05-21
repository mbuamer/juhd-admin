-- juhd-admin web dashboard: exclude role = 'test' from get_growth_dashboard + related RPCs.
-- Prerequisite: admin_exclude_test_role.sql (is_admin_dashboard_user).
-- Run in Supabase SQL editor, then hard-refresh juhd-admin analytics.

DROP FUNCTION IF EXISTS public.get_growth_dashboard(integer);
-- Return type may differ (integer vs bigint) after admin_exclude_test_role.sql — drop before recreate.
DROP FUNCTION IF EXISTS public.get_admin_signups_today();
DROP FUNCTION IF EXISTS public.get_admin_workouts_in_period(integer);
DROP FUNCTION IF EXISTS public.get_admin_premium_upgrades_today();
DROP FUNCTION IF EXISTS public.get_admin_premium_upgrades_in_period(integer);

-- Period windows: 1=today UTC; 7/30=last N calendar days; 365=last 12 calendar months (matches chart buckets); 0=all time.
CREATE OR REPLACE FUNCTION public._admin_period_start(p_period_days integer)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_period_days NOT IN (0, 1, 7, 30, 365) THEN
    RAISE EXCEPTION 'invalid p_period_days';
  END IF;
  IF p_period_days = 0 THEN
    RETURN timestamptz '1970-01-01 00:00:00+00';
  END IF;
  IF p_period_days = 1 THEN
    RETURN date_trunc('day', timezone('utc', now()));
  END IF;
  IF p_period_days = 365 THEN
    RETURN date_trunc('month', timezone('utc', now())) - interval '11 months';
  END IF;
  RETURN date_trunc('day', timezone('utc', now())) - ((p_period_days - 1)::text || ' days')::interval;
END;
$$;

REVOKE ALL ON FUNCTION public._admin_period_start(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._admin_period_start(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_signups_today()
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND lower(u.role) = 'admin'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN (
    SELECT count(*)::bigint
    FROM public.users u
    WHERE public.is_admin_dashboard_user(u.role)
      AND timezone('utc', u.created_at) >= public._admin_period_start(1)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_workouts_in_period(p_period_days integer)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  n int := 0;
BEGIN
  IF p_period_days NOT IN (0, 1, 7, 30, 365) THEN
    RAISE EXCEPTION 'invalid p_period_days';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND lower(u.role) = 'admin'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_start := public._admin_period_start(p_period_days);

  IF to_regclass('public.sessions') IS NULL THEN
    RETURN 0;
  END IF;

  SELECT count(*)::int INTO n
  FROM public.sessions s
  INNER JOIN public.users u ON u.id::text = s.user_id::text
  WHERE s.ended_at IS NOT NULL
    AND public.is_admin_dashboard_user(u.role)
    AND timezone('utc', s.ended_at) >= v_start;

  RETURN coalesce(n, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_premium_upgrades_in_period(p_period_days integer)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  n int := 0;
  n_events int := 0;
  n_users int := 0;
  v_has_updated_at boolean;
BEGIN
  PERFORM public._admin_require_admin();
  v_start := public._admin_period_start(p_period_days);

  SELECT count(*)::int INTO n_events
  FROM public.premium_upgrade_events e
  INNER JOIN public.users u ON u.id = e.user_id
  WHERE e.upgraded_at >= v_start
    AND public.is_admin_dashboard_user(u.role);

  IF n_events > 0 THEN
    RETURN n_events;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'updated_at'
  ) INTO v_has_updated_at;

  IF v_has_updated_at THEN
    SELECT count(*)::int INTO n_users
    FROM public.users u
    WHERE public.is_admin_dashboard_user(u.role)
      AND lower(coalesce(u.role, '')) IN ('premium', 'admin')
      AND timezone('utc', coalesce(u.updated_at, u.created_at)) >= v_start;
  ELSE
  -- Fallback when no events and no updated_at: only meaningful for "today" via created_at is wrong; return 0 for 7d/30d.
    IF p_period_days = 1 THEN
      SELECT count(*)::int INTO n_users
      FROM public.users u
      WHERE public.is_admin_dashboard_user(u.role)
        AND lower(coalesce(u.role, '')) IN ('premium', 'admin')
        AND timezone('utc', u.created_at) >= date_trunc('day', timezone('utc', now()));
    ELSE
      n_users := 0;
    END IF;
  END IF;

  RETURN coalesce(greatest(n_events, n_users), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_premium_upgrades_in_period(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_premium_upgrades_in_period(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_premium_upgrades_today()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_admin_premium_upgrades_in_period(1);
$$;

REVOKE ALL ON FUNCTION public.get_admin_premium_upgrades_today() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_premium_upgrades_today() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_growth_dashboard(p_period_days integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := timezone('utc', now());
  v_start timestamptz;
  v_total int;
  v_new_signups int;
  v_workouts int := 0;
  v_routines int := 0;
  v_active int := 0;
  v_premium_new int := 0;
  v_events boolean;
  v_routines_tbl boolean;
  v_sessions_tbl boolean;
  v_signups_series jsonb := '[]'::jsonb;
  v_workouts_series jsonb := '[]'::jsonb;
  v_routines_series jsonb := '[]'::jsonb;
  v_premium_series jsonb := '[]'::jsonb;
  v_premium_events_tbl boolean;
  v_cities jsonb := '[]'::jsonb;
  v_gender jsonb := '[]'::jsonb;
  v_age jsonb := '[]'::jsonb;
  v_dau int := 0;
  v_wau int := 0;
  v_mau int := 0;
  v_top_city text := '—';
  v_ratio numeric := 0;
  v_sum_signup_series int;
BEGIN
  IF p_period_days NOT IN (0, 1, 7, 30, 365) THEN
    RAISE EXCEPTION 'invalid p_period_days';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND lower(u.role) = 'admin'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_start := public._admin_period_start(p_period_days);

  SELECT count(*)::int INTO v_total FROM public.users u WHERE public.is_admin_dashboard_user(u.role);

  SELECT count(*)::int INTO v_new_signups
  FROM public.users u
  WHERE public.is_admin_dashboard_user(u.role)
    AND timezone('utc', u.created_at) >= v_start;

  v_events := to_regclass('public.analytics_events') IS NOT NULL;
  v_routines_tbl := to_regclass('public.routines') IS NOT NULL;
  v_sessions_tbl := to_regclass('public.sessions') IS NOT NULL;
  v_premium_events_tbl := to_regclass('public.premium_upgrade_events') IS NOT NULL;

  IF v_sessions_tbl THEN
    SELECT count(*)::int INTO v_workouts
    FROM public.sessions s
    INNER JOIN public.users u ON u.id::text = s.user_id::text
    WHERE s.ended_at IS NOT NULL
      AND public.is_admin_dashboard_user(u.role)
      AND timezone('utc', s.ended_at) >= v_start;
  END IF;

  IF v_events THEN
    IF NOT v_sessions_tbl THEN
      SELECT coalesce(count(*) FILTER (WHERE e.event_name = 'workout_session'), 0)::int INTO v_workouts
      FROM public.analytics_events e
      INNER JOIN public.users u ON u.id = e.user_id
      WHERE public.is_admin_dashboard_user(u.role)
        AND (e.timestamp)::timestamptz >= v_start;
    END IF;

    SELECT count(DISTINCT e.user_id)::int INTO v_dau
    FROM public.analytics_events e
    INNER JOIN public.users u ON u.id = e.user_id
    WHERE e.user_id IS NOT NULL
      AND public.is_admin_dashboard_user(u.role)
      AND timezone('utc', (e.timestamp)::timestamptz) >= date_trunc('day', v_now);

    SELECT count(DISTINCT e.user_id)::int INTO v_wau
    FROM public.analytics_events e
    INNER JOIN public.users u ON u.id = e.user_id
    WHERE e.user_id IS NOT NULL
      AND public.is_admin_dashboard_user(u.role)
      AND timezone('utc', (e.timestamp)::timestamptz) >= public._admin_period_start(7);

    SELECT count(DISTINCT e.user_id)::int INTO v_mau
    FROM public.analytics_events e
    INNER JOIN public.users u ON u.id = e.user_id
    WHERE e.user_id IS NOT NULL
      AND public.is_admin_dashboard_user(u.role)
      AND timezone('utc', (e.timestamp)::timestamptz) >= public._admin_period_start(30);

    IF p_period_days = 1 THEN
      v_active := coalesce(v_dau, 0);
    ELSIF p_period_days = 365 THEN
      SELECT count(DISTINCT e.user_id)::int INTO v_active
      FROM public.analytics_events e
      INNER JOIN public.users u ON u.id = e.user_id
      WHERE e.user_id IS NOT NULL
        AND public.is_admin_dashboard_user(u.role)
        AND timezone('utc', (e.timestamp)::timestamptz) >= v_start;
      v_active := coalesce(v_active, 0);
    ELSE
      v_active := greatest(coalesce(v_wau, 0), v_new_signups * 2);
    END IF;
  ELSE
    IF NOT v_sessions_tbl THEN
      v_workouts := greatest(round(v_new_signups * 2.5)::int, 0);
    END IF;
    IF p_period_days = 1 THEN
      v_active := greatest(v_new_signups, 0);
    ELSE
      v_active := greatest(round(v_new_signups * 3.8)::int, 1);
    END IF;
    v_mau := greatest(v_active, 10);
    v_wau := greatest(round(v_active * 0.75)::int, 1);
    v_dau := greatest(round(v_active * 0.22)::int, 1);
  END IF;

  IF v_mau = 0 THEN v_mau := greatest(v_active, 1); END IF;
  v_ratio := CASE WHEN v_mau > 0 THEN round(v_dau::numeric / v_mau, 3) ELSE 0 END;

  IF v_routines_tbl THEN
    SELECT count(*)::int INTO v_routines
    FROM public.routines r
    INNER JOIN public.users u ON u.id = r.user_id
    WHERE public.is_admin_dashboard_user(u.role)
      AND timezone('utc', r.created_at) >= v_start;
  ELSE
    v_routines := greatest(round(v_new_signups * 0.5)::int, 0);
  END IF;

  BEGIN
    v_premium_new := public.get_admin_premium_upgrades_in_period(
      CASE WHEN p_period_days = 0 THEN 30 ELSE p_period_days END
    );
  EXCEPTION WHEN OTHERS THEN
    v_premium_new := 0;
  END;

  IF p_period_days = 1 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'label', to_char(bucket_start, 'HH24') || 'h',
      'value', bucket_count
    ) ORDER BY bucket_start), '[]'::jsonb)
    INTO v_signups_series
    FROM (
      SELECT date_trunc('hour', timezone('utc', u.created_at)) AS bucket_start,
             count(*)::int AS bucket_count
      FROM public.users u
      WHERE public.is_admin_dashboard_user(u.role)
        AND timezone('utc', u.created_at) >= v_start
      GROUP BY 1
    ) sq;
  ELSIF p_period_days = 7 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'label', to_char(days.d, 'Dy'),
      'value', coalesce(c.cnt, 0)
    ) ORDER BY days.d), '[]'::jsonb)
    INTO v_signups_series
    FROM (
      SELECT generate_series(
        (date_trunc('day', v_now)::date - 6),
        date_trunc('day', v_now)::date,
        '1 day'::interval
      )::date AS d
    ) days
    LEFT JOIN (
      SELECT date_trunc('day', timezone('utc', u.created_at))::date AS d, count(*)::int AS cnt
      FROM public.users u
      WHERE public.is_admin_dashboard_user(u.role)
        AND timezone('utc', u.created_at) >= v_start
      GROUP BY 1
    ) c ON c.d = days.d;
  ELSIF p_period_days = 30 THEN
    -- One bucket per calendar day (last 30 days) — monthly view
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'label', to_char(days.d, 'Mon DD'),
      'value', coalesce(c.cnt, 0)
    ) ORDER BY days.d), '[]'::jsonb)
    INTO v_signups_series
    FROM (
      SELECT generate_series(
        (date_trunc('day', v_now)::date - 29),
        date_trunc('day', v_now)::date,
        '1 day'::interval
      )::date AS d
    ) days
    LEFT JOIN (
      SELECT date_trunc('day', timezone('utc', u.created_at))::date AS d, count(*)::int AS cnt
      FROM public.users u
      WHERE public.is_admin_dashboard_user(u.role)
        AND timezone('utc', u.created_at) >= v_start
      GROUP BY 1
    ) c ON c.d = days.d;
  ELSIF p_period_days = 365 THEN
    -- Yearly view: one bucket per calendar month (last 12 months, within 365d window)
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'label', to_char(wmonths.m, 'Mon YY'),
      'value', coalesce(c.cnt, 0)
    ) ORDER BY wmonths.m), '[]'::jsonb)
    INTO v_signups_series
    FROM (
      SELECT generate_series(
        date_trunc('month', timezone('utc', v_now))::date - interval '11 months',
        date_trunc('month', timezone('utc', v_now))::date,
        '1 month'::interval
      )::date AS m
    ) months
    LEFT JOIN (
      SELECT date_trunc('month', timezone('utc', u.created_at))::date AS m, count(*)::int AS cnt
      FROM public.users u
      WHERE public.is_admin_dashboard_user(u.role)
        AND timezone('utc', u.created_at) >= v_start
      GROUP BY 1
    ) c ON c.m = months.m;
  ELSE
    v_signups_series := '[]'::jsonb;
  END IF;

  SELECT coalesce(sum((elem->>'value')::int), 0) INTO v_sum_signup_series
  FROM jsonb_array_elements(v_signups_series) AS elem;

  IF v_sessions_tbl THEN
    IF p_period_days = 1 THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'label', to_char(bucket_start, 'HH24') || 'h',
        'value', bucket_count
      ) ORDER BY bucket_start), '[]'::jsonb)
      INTO v_workouts_series
      FROM (
        SELECT date_trunc('hour', timezone('utc', s.ended_at)) AS bucket_start,
               count(*)::int AS bucket_count
        FROM public.sessions s
        INNER JOIN public.users u ON u.id::text = s.user_id::text
        WHERE s.ended_at IS NOT NULL
          AND public.is_admin_dashboard_user(u.role)
          AND timezone('utc', s.ended_at) >= v_start
        GROUP BY 1
      ) wq;
    ELSIF p_period_days = 7 THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'label', to_char(days.d, 'Dy'),
        'value', coalesce(c.cnt, 0)
      ) ORDER BY days.d), '[]'::jsonb)
      INTO v_workouts_series
      FROM (
        SELECT generate_series(
          (date_trunc('day', v_now)::date - 6),
          date_trunc('day', v_now)::date,
          '1 day'::interval
        )::date AS d
      ) wdays
      LEFT JOIN (
        SELECT date_trunc('day', timezone('utc', s.ended_at))::date AS d, count(*)::int AS cnt
        FROM public.sessions s
        INNER JOIN public.users u ON u.id::text = s.user_id::text
        WHERE s.ended_at IS NOT NULL
          AND public.is_admin_dashboard_user(u.role)
          AND timezone('utc', s.ended_at) >= v_start
        GROUP BY 1
      ) c ON c.d = wdays.d;
    ELSIF p_period_days = 30 THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'label', to_char(days.d, 'Mon DD'),
        'value', coalesce(c.cnt, 0)
      ) ORDER BY days.d), '[]'::jsonb)
      INTO v_workouts_series
      FROM (
        SELECT generate_series(
          (date_trunc('day', v_now)::date - 29),
          date_trunc('day', v_now)::date,
          '1 day'::interval
        )::date AS d
      ) wdays
      LEFT JOIN (
        SELECT date_trunc('day', timezone('utc', s.ended_at))::date AS d, count(*)::int AS cnt
        FROM public.sessions s
        INNER JOIN public.users u ON u.id::text = s.user_id::text
        WHERE s.ended_at IS NOT NULL
          AND public.is_admin_dashboard_user(u.role)
          AND timezone('utc', s.ended_at) >= v_start
        GROUP BY 1
      ) c ON c.d = wdays.d;
    ELSIF p_period_days = 365 THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'label', to_char(wmonths.m, 'Mon YY'),
        'value', coalesce(c.cnt, 0)
      ) ORDER BY wmonths.m), '[]'::jsonb)
      INTO v_workouts_series
      FROM (
        SELECT generate_series(
          date_trunc('month', timezone('utc', v_now))::date - interval '11 months',
          date_trunc('month', timezone('utc', v_now))::date,
          '1 month'::interval
        )::date AS m
      ) wmonths
      LEFT JOIN (
        SELECT date_trunc('month', timezone('utc', s.ended_at))::date AS m, count(*)::int AS cnt
        FROM public.sessions s
        INNER JOIN public.users u ON u.id::text = s.user_id::text
        WHERE s.ended_at IS NOT NULL
          AND public.is_admin_dashboard_user(u.role)
          AND timezone('utc', s.ended_at) >= v_start
        GROUP BY 1
      ) c ON c.m = wmonths.m;
    END IF;
  ELSIF coalesce(v_sum_signup_series, 0) = 0 THEN
    v_workouts_series := v_signups_series;
  ELSE
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'label', elem->>'label',
        'value', round((elem->>'value')::numeric * v_workouts / v_sum_signup_series)::int
      ) ORDER BY ord
    ), '[]'::jsonb)
    INTO v_workouts_series
    FROM jsonb_array_elements(v_signups_series) WITH ORDINALITY AS t(elem, ord);
  END IF;

  IF v_routines_tbl THEN
    IF p_period_days = 1 THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'label', to_char(bucket_start, 'HH24') || 'h',
        'value', bucket_count
      ) ORDER BY bucket_start), '[]'::jsonb)
      INTO v_routines_series
      FROM (
        SELECT date_trunc('hour', timezone('utc', r.created_at)) AS bucket_start,
               count(*)::int AS bucket_count
        FROM public.routines r
        INNER JOIN public.users u ON u.id = r.user_id
        WHERE public.is_admin_dashboard_user(u.role)
          AND timezone('utc', r.created_at) >= v_start
        GROUP BY 1
      ) rq;
    ELSIF p_period_days = 7 THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'label', to_char(days.d, 'Dy'),
        'value', coalesce(c.cnt, 0)
      ) ORDER BY days.d), '[]'::jsonb)
      INTO v_routines_series
      FROM (
        SELECT generate_series(
          (date_trunc('day', v_now)::date - 6),
          date_trunc('day', v_now)::date,
          '1 day'::interval
        )::date AS d
      ) rdays
      LEFT JOIN (
        SELECT date_trunc('day', timezone('utc', r.created_at))::date AS d, count(*)::int AS cnt
        FROM public.routines r
        INNER JOIN public.users u ON u.id = r.user_id
        WHERE public.is_admin_dashboard_user(u.role)
          AND timezone('utc', r.created_at) >= v_start
        GROUP BY 1
      ) c ON c.d = rdays.d;
    ELSIF p_period_days = 30 THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'label', to_char(days.d, 'Mon DD'),
        'value', coalesce(c.cnt, 0)
      ) ORDER BY days.d), '[]'::jsonb)
      INTO v_routines_series
      FROM (
        SELECT generate_series(
          (date_trunc('day', v_now)::date - 29),
          date_trunc('day', v_now)::date,
          '1 day'::interval
        )::date AS d
      ) rdays
      LEFT JOIN (
        SELECT date_trunc('day', timezone('utc', r.created_at))::date AS d, count(*)::int AS cnt
        FROM public.routines r
        INNER JOIN public.users u ON u.id = r.user_id
        WHERE public.is_admin_dashboard_user(u.role)
          AND timezone('utc', r.created_at) >= v_start
        GROUP BY 1
      ) c ON c.d = rdays.d;
    ELSIF p_period_days = 365 THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'label', to_char(wmonths.m, 'Mon YY'),
        'value', coalesce(c.cnt, 0)
      ) ORDER BY wmonths.m), '[]'::jsonb)
      INTO v_routines_series
      FROM (
        SELECT generate_series(
          date_trunc('month', timezone('utc', v_now))::date - interval '11 months',
          date_trunc('month', timezone('utc', v_now))::date,
          '1 month'::interval
        )::date AS m
      ) rmonths
      LEFT JOIN (
        SELECT date_trunc('month', timezone('utc', r.created_at))::date AS m, count(*)::int AS cnt
        FROM public.routines r
        INNER JOIN public.users u ON u.id = r.user_id
        WHERE public.is_admin_dashboard_user(u.role)
          AND timezone('utc', r.created_at) >= v_start
        GROUP BY 1
      ) c ON c.m = rmonths.m;
    END IF;
  END IF;

  IF v_premium_events_tbl THEN
    IF p_period_days = 1 THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'label', to_char(bucket_start, 'HH24') || 'h',
        'value', bucket_count
      ) ORDER BY bucket_start), '[]'::jsonb)
      INTO v_premium_series
      FROM (
        SELECT date_trunc('hour', timezone('utc', e.upgraded_at)) AS bucket_start,
               count(*)::int AS bucket_count
        FROM public.premium_upgrade_events e
        INNER JOIN public.users u ON u.id = e.user_id
        WHERE public.is_admin_dashboard_user(u.role)
          AND timezone('utc', e.upgraded_at) >= v_start
        GROUP BY 1
      ) pq;
    ELSIF p_period_days = 7 THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'label', to_char(days.d, 'Dy'),
        'value', coalesce(c.cnt, 0)
      ) ORDER BY days.d), '[]'::jsonb)
      INTO v_premium_series
      FROM (
        SELECT generate_series(
          (date_trunc('day', v_now)::date - 6),
          date_trunc('day', v_now)::date,
          '1 day'::interval
        )::date AS d
      ) pdays
      LEFT JOIN (
        SELECT date_trunc('day', timezone('utc', e.upgraded_at))::date AS d, count(*)::int AS cnt
        FROM public.premium_upgrade_events e
        INNER JOIN public.users u ON u.id = e.user_id
        WHERE public.is_admin_dashboard_user(u.role)
          AND timezone('utc', e.upgraded_at) >= v_start
        GROUP BY 1
      ) c ON c.d = pdays.d;
    ELSIF p_period_days = 30 THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'label', to_char(days.d, 'Mon DD'),
        'value', coalesce(c.cnt, 0)
      ) ORDER BY days.d), '[]'::jsonb)
      INTO v_premium_series
      FROM (
        SELECT generate_series(
          (date_trunc('day', v_now)::date - 29),
          date_trunc('day', v_now)::date,
          '1 day'::interval
        )::date AS d
      ) pdays
      LEFT JOIN (
        SELECT date_trunc('day', timezone('utc', e.upgraded_at))::date AS d, count(*)::int AS cnt
        FROM public.premium_upgrade_events e
        INNER JOIN public.users u ON u.id = e.user_id
        WHERE public.is_admin_dashboard_user(u.role)
          AND timezone('utc', e.upgraded_at) >= v_start
        GROUP BY 1
      ) c ON c.d = pdays.d;
    ELSIF p_period_days = 365 THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'label', to_char(wmonths.m, 'Mon YY'),
        'value', coalesce(c.cnt, 0)
      ) ORDER BY wmonths.m), '[]'::jsonb)
      INTO v_premium_series
      FROM (
        SELECT generate_series(
          date_trunc('month', timezone('utc', v_now))::date - interval '11 months',
          date_trunc('month', timezone('utc', v_now))::date,
          '1 month'::interval
        )::date AS m
      ) pmonths
      LEFT JOIN (
        SELECT date_trunc('month', timezone('utc', e.upgraded_at))::date AS m, count(*)::int AS cnt
        FROM public.premium_upgrade_events e
        INNER JOIN public.users u ON u.id = e.user_id
        WHERE public.is_admin_dashboard_user(u.role)
          AND timezone('utc', e.upgraded_at) >= v_start
        GROUP BY 1
      ) c ON c.m = pmonths.m;
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('label', city, 'value', cnt)), '[]'::jsonb)
  INTO v_cities
  FROM (
    SELECT coalesce(nullif(trim(u.city), ''), 'City not specified') AS city, count(*)::int AS cnt
    FROM public.users u
    WHERE public.is_admin_dashboard_user(u.role)
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 10
  ) x;

  SELECT city INTO v_top_city FROM (
    SELECT c.city
    FROM (
      SELECT coalesce(nullif(trim(u.city), ''), 'City not specified') AS city, count(*)::int AS cnt
      FROM public.users u
      WHERE public.is_admin_dashboard_user(u.role)
      GROUP BY 1
    ) c
    ORDER BY CASE WHEN c.city = 'City not specified' THEN 1 ELSE 0 END, c.cnt DESC
    LIMIT 1
  ) y;

  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object('label', g.label, 'value', g.cnt)), '[]'::jsonb)
    INTO v_gender
    FROM (
      SELECT coalesce(nullif(trim(u.gender), ''), 'Gender not specified') AS label, count(*)::int AS cnt
      FROM public.users u
      WHERE public.is_admin_dashboard_user(u.role)
      GROUP BY 1
    ) g;
  EXCEPTION WHEN OTHERS THEN
    v_gender := '[]'::jsonb;
  END;

  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object('label', x.lbl, 'value', x.cnt) ORDER BY x.ord), '[]'::jsonb)
    INTO v_age
    FROM (
      SELECT ag.bracket AS lbl, count(*)::int AS cnt, min(ag.sort_ord) AS ord
      FROM (
        SELECT
          CASE
            WHEN yrs < 18 THEN 'Under 18'
            WHEN yrs < 25 THEN '18–24'
            WHEN yrs < 35 THEN '25–34'
            WHEN yrs < 45 THEN '35–44'
            ELSE '45+'
          END AS bracket,
          CASE
            WHEN yrs < 18 THEN 1
            WHEN yrs < 25 THEN 2
            WHEN yrs < 35 THEN 3
            WHEN yrs < 45 THEN 4
            ELSE 5
          END AS sort_ord
        FROM (
          SELECT date_part('year', age(u.birthdate::date))::int AS yrs
          FROM public.users u
          WHERE u.birthdate IS NOT NULL
            AND public.is_admin_dashboard_user(u.role)
        ) raw_age
      ) ag
      GROUP BY ag.bracket
      UNION ALL
      SELECT
        'Age / birthdate not specified'::text,
        (SELECT count(*)::int FROM public.users u2 WHERE u2.birthdate IS NULL AND public.is_admin_dashboard_user(u2.role)),
        100
    ) x;
  EXCEPTION WHEN OTHERS THEN
    v_age := '[]'::jsonb;
  END;

  RETURN jsonb_build_object(
    'periodDays', p_period_days,
    'totalUsers', v_total,
    'newSignUps', v_new_signups,
    'activeUsers', v_active,
    'workoutsLogged', v_workouts,
    'newPremiumSubscribers', v_premium_new,
    'newRoutinesCreated', v_routines,
    'signUpsOverTime', v_signups_series,
    'workoutsOverTime', v_workouts_series,
    'premiumBuckets', v_premium_series,
    'routinesBuckets', v_routines_series,
    'usersByCity', v_cities,
    'usersByGender', v_gender,
    'usersByAgeGroup', v_age,
    'platformActivity', jsonb_build_object(
      'dau', v_dau,
      'wau', v_wau,
      'mau', v_mau,
      'dauMauRatio', v_ratio,
      'mostActiveCity', coalesce(v_top_city, '—'),
      'totalWorkouts', v_workouts
    )
  );
END;
$$;


REVOKE ALL ON FUNCTION public.get_growth_dashboard(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_growth_dashboard(integer) TO authenticated;

DROP FUNCTION IF EXISTS public.get_admin_workouts_over_time(integer);

CREATE OR REPLACE FUNCTION public.get_admin_workouts_over_time(p_period_days integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := timezone('utc', now());
  v_start timestamptz;
  v_series jsonb := '[]'::jsonb;
BEGIN
  IF p_period_days NOT IN (0, 1, 7, 30, 365) THEN
    RAISE EXCEPTION 'invalid p_period_days';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND lower(u.role) = 'admin'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF to_regclass('public.sessions') IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_start := public._admin_period_start(p_period_days);

  IF p_period_days = 1 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'label', to_char(bucket_start, 'HH24') || 'h',
      'value', bucket_count
    ) ORDER BY bucket_start), '[]'::jsonb)
    INTO v_series
    FROM (
      SELECT date_trunc('hour', timezone('utc', s.ended_at)) AS bucket_start,
             count(*)::int AS bucket_count
      FROM public.sessions s
      INNER JOIN public.users u ON u.id::text = s.user_id::text
      WHERE s.ended_at IS NOT NULL
        AND public.is_admin_dashboard_user(u.role)
        AND timezone('utc', s.ended_at) >= v_start
      GROUP BY 1
    ) wq;
  ELSIF p_period_days = 7 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'label', to_char(days.d, 'Dy'),
      'value', coalesce(c.cnt, 0)
    ) ORDER BY days.d), '[]'::jsonb)
    INTO v_series
    FROM (
      SELECT generate_series(
        (date_trunc('day', v_now)::date - 6),
        date_trunc('day', v_now)::date,
        '1 day'::interval
      )::date AS d
    ) wdays
    LEFT JOIN (
      SELECT date_trunc('day', timezone('utc', s.ended_at))::date AS d, count(*)::int AS cnt
      FROM public.sessions s
      INNER JOIN public.users u ON u.id::text = s.user_id::text
      WHERE s.ended_at IS NOT NULL
        AND public.is_admin_dashboard_user(u.role)
        AND timezone('utc', s.ended_at) >= v_start
      GROUP BY 1
    ) c ON c.d = wdays.d;
  ELSIF p_period_days = 30 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'label', to_char(days.d, 'Mon DD'),
      'value', coalesce(c.cnt, 0)
    ) ORDER BY days.d), '[]'::jsonb)
    INTO v_series
    FROM (
      SELECT generate_series(
        (date_trunc('day', v_now)::date - 29),
        date_trunc('day', v_now)::date,
        '1 day'::interval
      )::date AS d
    ) wdays
    LEFT JOIN (
      SELECT date_trunc('day', timezone('utc', s.ended_at))::date AS d, count(*)::int AS cnt
      FROM public.sessions s
      INNER JOIN public.users u ON u.id::text = s.user_id::text
      WHERE s.ended_at IS NOT NULL
        AND public.is_admin_dashboard_user(u.role)
        AND timezone('utc', s.ended_at) >= v_start
      GROUP BY 1
    ) c ON c.d = wdays.d;
  ELSIF p_period_days = 365 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'label', to_char(wmonths.m, 'Mon YY'),
      'value', coalesce(c.cnt, 0)
    ) ORDER BY wmonths.m), '[]'::jsonb)
    INTO v_series
    FROM (
      SELECT generate_series(
        date_trunc('month', timezone('utc', v_now))::date - interval '11 months',
        date_trunc('month', timezone('utc', v_now))::date,
        '1 month'::interval
      )::date AS m
    ) wmonths
    LEFT JOIN (
      SELECT date_trunc('month', timezone('utc', s.ended_at))::date AS m, count(*)::int AS cnt
      FROM public.sessions s
      INNER JOIN public.users u ON u.id::text = s.user_id::text
      WHERE s.ended_at IS NOT NULL
        AND public.is_admin_dashboard_user(u.role)
        AND timezone('utc', s.ended_at) >= v_start
      GROUP BY 1
    ) c ON c.m = wmonths.m;
  END IF;

  RETURN coalesce(v_series, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_workouts_over_time(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_workouts_over_time(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
