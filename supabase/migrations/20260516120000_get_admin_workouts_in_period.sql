-- Canonical finished-workout count per growth period (same window as get_growth_dashboard).
-- juhd-admin calls this so 7d/30d totals match SQL even when client ISO windows drift.

CREATE OR REPLACE FUNCTION public.get_admin_workouts_in_period(p_period_days integer)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := timezone('utc', now());
  v_start timestamptz;
  n int := 0;
BEGIN
  IF p_period_days NOT IN (0, 1, 7, 30) THEN
    RAISE EXCEPTION 'invalid p_period_days';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND lower(u.role) = 'admin'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_period_days = 0 THEN
    v_start := timestamptz '1970-01-01 00:00:00+00';
  ELSE
    v_start := date_trunc('day', v_now) - (p_period_days::text || ' days')::interval;
  END IF;

  IF to_regclass('public.sessions') IS NULL THEN
    RETURN 0;
  END IF;

  SELECT count(*)::int INTO n
  FROM public.sessions s
  WHERE s.ended_at IS NOT NULL
    AND timezone('utc', s.ended_at) >= v_start;

  RETURN coalesce(n, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_workouts_in_period(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_workouts_in_period(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
