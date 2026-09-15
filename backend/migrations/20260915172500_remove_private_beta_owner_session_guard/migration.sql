-- Remove the temporary private-beta restriction that prevented normal USER
-- accounts from creating authenticated sessions in production.
-- Authentication authorization remains enforced by the backend JWT/session
-- validation and per-endpoint guards.
DROP TRIGGER IF EXISTS private_beta_owner_session_guard_trigger ON "AuthSession";
DROP FUNCTION IF EXISTS public.private_beta_owner_session_guard();
