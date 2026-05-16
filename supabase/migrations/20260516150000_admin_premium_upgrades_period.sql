-- Migration 3/6: Premium upgrades in period + optional event log
-- Safe: new table + new RPC. Does not change grant-premium until you wire an INSERT (see comment).
-- get_admin_premium_upgrades_today unchanged if it already exists; we (re)define it to match period logic for 1d.

CREATE TABLE IF NOT EXISTS public.premium_upgrade_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id text,
  source text NOT NULL DEFAULT 'unknown',
  upgraded_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS premium_upgrade_events_upgraded_at_idx
  ON public.premium_upgrade_events (upgraded_at DESC);

CREATE INDEX IF NOT EXISTS premium_upgrade_events_user_id_idx
  ON public.premium_upgrade_events (user_id);

ALTER TABLE public.premium_upgrade_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS premium_upgrade_events_no_public ON public.premium_upgrade_events;
CREATE POLICY premium_upgrade_events_no_public ON public.premium_upgrade_events
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.log_premium_upgrade_event(
  p_user_id uuid,
  p_product_id text DEFAULT NULL,
  p_source text DEFAULT 'grant_premium'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.premium_upgrade_events (user_id, product_id, source, upgraded_at)
  VALUES (p_user_id, p_product_id, coalesce(nullif(trim(p_source), ''), 'unknown'), timezone('utc', now()));
EXCEPTION
  WHEN unique_violation THEN
    NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_premium_upgrade_event(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_premium_upgrade_event(uuid, text, text) TO service_role;

-- Old DB may use a different return type (e.g. bigint / setof row); drop before recreate.
DROP FUNCTION IF EXISTS public.get_admin_premium_upgrades_today();
DROP FUNCTION IF EXISTS public.get_admin_premium_upgrades_in_period(integer);

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
  WHERE e.upgraded_at >= v_start;

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
    WHERE lower(coalesce(u.role, '')) IN ('premium', 'admin')
      AND timezone('utc', coalesce(u.updated_at, u.created_at)) >= v_start;
  ELSE
  -- Fallback when no events and no updated_at: only meaningful for "today" via created_at is wrong; return 0 for 7d/30d.
    IF p_period_days = 1 THEN
      SELECT count(*)::int INTO n_users
      FROM public.users u
      WHERE lower(coalesce(u.role, '')) IN ('premium', 'admin')
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

NOTIFY pgrst, 'reload schema';
