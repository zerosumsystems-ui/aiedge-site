-- broker_connections had two issues:
--
-- 1. SECURITY: The "Service role full access" policy from 001 was applied
--    to role `public` (not `service_role` as the name implied) with
--    USING (true) / WITH CHECK (true) FOR ALL. Combined with the default
--    SELECT/INSERT/UPDATE/DELETE grants Supabase gives `anon`, this meant
--    anyone with the public anon key could wipe or rewrite the table.
--    service_role bypasses RLS at the engine level, so it doesn't need a
--    policy at all — drop it.
--
-- 2. PERFORMANCE (lint 0003): "Users can view own broker connections"
--    called auth.uid() per row. Wrap in (select auth.uid()) so Postgres
--    evaluates it once per query.
--
-- Also restrict the per-user policy to `authenticated` so anon can't see
-- any rows (previously `public`, which included anon).

DROP POLICY IF EXISTS "Service role full access" ON public.broker_connections;
DROP POLICY IF EXISTS "Users can view own broker connections" ON public.broker_connections;

CREATE POLICY "Users can view own broker connections"
  ON public.broker_connections
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);
