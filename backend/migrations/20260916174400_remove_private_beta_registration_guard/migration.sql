-- Remove the obsolete private-beta registration lock from production.
-- Normal registration remains protected by backend validation, rate limiting,
-- password policy, unique email enforcement, JWT/session controls and endpoint guards.
DROP TRIGGER IF EXISTS private_beta_registration_guard_trigger ON public."User";
DROP FUNCTION IF EXISTS public.private_beta_registration_guard();
