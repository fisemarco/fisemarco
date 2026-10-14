BEGIN;

-- Cover the referencing side of foreign keys used during privacy erasure.
CREATE INDEX idx_oauth_agent ON ftai_private.oauth_tokens(agent);
CREATE INDEX idx_sphere_edges_target ON ftai_private.sphere_edges(target);
CREATE INDEX idx_sphere_invite_claims_agent ON ftai_private.sphere_invite_claims(agent);
CREATE INDEX idx_sphere_invites_agent ON ftai_private.sphere_invites(agent);

-- Supabase's automatic-RLS event trigger is an internal database function.
-- Preserve its owner, definition and trigger; remove browser RPC execution.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END
$$;

COMMIT;
