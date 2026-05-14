-- Lint 0028/0029: public.rls_auto_enable() is SECURITY DEFINER and was
-- exposed via /rest/v1/rpc to anon + authenticated. It's an event-trigger
-- function that auto-enables RLS on new public tables, so nothing should
-- ever call it directly. Event triggers run under the function owner
-- (postgres), so revoking these grants does not affect the trigger.

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
