-- Migration 5/6: Account deletion audit log + stats RPC
-- Safe: new table + new functions. Does NOT change delete_user_data until edge function calls log_account_deletion_snapshot.
-- Wire from delete-account Edge Function AFTER this migration (separate deploy).

CREATE TABLE IF NOT EXISTS public.account_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  city text,
  gender text,
  age_bracket text,
  source text NOT NULL DEFAULT 'delete_account'
);

CREATE INDEX IF NOT EXISTS account_deletion_log_deleted_at_idx
  ON public.account_deletion_log (deleted_at DESC);

ALTER TABLE public.account_deletion_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_deletion_log_no_public ON public.account_deletion_log;
CREATE POLICY account_deletion_log_no_public ON public.account_deletion_log
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.log_account_deletion_snapshot(p_user_id uuid, p_source text DEFAULT 'delete_account')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_city text;
  v_gender text;
  v_age text;
BEGIN
  SELECT
    coalesce(nullif(trim(u.city), ''), 'City not specified'),
    coalesce(nullif(trim(u.gender), ''), 'Gender not specified'),
    CASE
      WHEN u.birthdate IS NULL THEN 'Age / birthdate not specified'
      WHEN date_part('year', age(u.birthdate::date))::int < 18 THEN 'Under 18'
      WHEN date_part('year', age(u.birthdate::date))::int < 25 THEN '18–24'
      WHEN date_part('year', age(u.birthdate::date))::int < 35 THEN '25–34'
      WHEN date_part('year', age(u.birthdate::date))::int < 45 THEN '35–44'
      ELSE '45+'
    END
  INTO v_city, v_gender, v_age
  FROM public.users u
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    v_city := 'City not specified';
    v_gender := 'Gender not specified';
    v_age := 'Age / birthdate not specified';
  END IF;

  INSERT INTO public.account_deletion_log (user_id, city, gender, age_bracket, source)
  VALUES (p_user_id, v_city, v_gender, v_age, coalesce(nullif(trim(p_source), ''), 'delete_account'));
END;
$$;

REVOKE ALL ON FUNCTION public.log_account_deletion_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_account_deletion_snapshot(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_admin_account_deletions_stats(p_period_days integer DEFAULT 0)
RETURNS TABLE (
  deletions_total bigint,
  deletions_period bigint,
  deletions_today bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := timezone('utc', now());
  v_day_start timestamptz := date_trunc('day', v_now);
  v_start timestamptz;
BEGIN
  PERFORM public._admin_require_admin();

  IF to_regclass('public.account_deletion_log') IS NULL THEN
    deletions_total := 0;
    deletions_period := 0;
    deletions_today := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  v_start := public._admin_period_start(coalesce(p_period_days, 0));

  SELECT count(*)::bigint INTO deletions_total FROM public.account_deletion_log;
  SELECT count(*)::bigint INTO deletions_period FROM public.account_deletion_log d WHERE d.deleted_at >= v_start;
  SELECT count(*)::bigint INTO deletions_today FROM public.account_deletion_log d WHERE d.deleted_at >= v_day_start;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_account_deletions_stats(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_account_deletions_stats(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
