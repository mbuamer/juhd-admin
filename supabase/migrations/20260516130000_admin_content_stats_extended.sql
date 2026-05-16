-- Migration 1/6: Extended get_admin_content_stats
-- Safe: DROP + CREATE (Postgres cannot change OUT/RETURN TABLE columns via CREATE OR REPLACE).
-- Keeps p_period + all existing column names; adds comments/likes today/week/month.
-- Apply in Supabase SQL Editor, then NOTIFY (included at bottom).

-- Required when the live function has fewer RETURN TABLE columns than this version.
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
      FROM public.posts p
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
        FROM public.posts p
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
      FROM public.post_comments c
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
      FROM public.post_likes l
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
