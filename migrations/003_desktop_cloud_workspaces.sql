-- Desktop workspaces are separate from legacy web tables, so old clients remain compatible.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS public.desktop_workspaces (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  revision integer NOT NULL CHECK (revision > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 2097152),
  deleted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.desktop_workspaces ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='public' AND tablename='desktop_workspaces' AND policyname='desktop_owner') THEN
    CREATE POLICY desktop_owner ON public.desktop_workspaces FOR ALL TO authenticated
      USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
  END IF;
END $$;
REVOKE INSERT, UPDATE, DELETE ON public.desktop_workspaces FROM authenticated;
GRANT SELECT ON public.desktop_workspaces TO authenticated;
REVOKE ALL ON public.desktop_workspaces FROM anon;
CREATE TABLE IF NOT EXISTS public.desktop_workspace_versions (
  workspace_id uuid NOT NULL REFERENCES public.desktop_workspaces(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  revision integer NOT NULL,
  payload jsonb NOT NULL,
  deleted boolean NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id, revision)
);
ALTER TABLE public.desktop_workspace_versions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='public' AND tablename='desktop_workspace_versions' AND policyname='desktop_version_owner') THEN
    CREATE POLICY desktop_version_owner ON public.desktop_workspace_versions FOR ALL TO authenticated
      USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
  END IF;
END $$;
REVOKE INSERT, UPDATE, DELETE ON public.desktop_workspace_versions FROM authenticated;
GRANT SELECT ON public.desktop_workspace_versions TO authenticated;
REVOKE ALL ON public.desktop_workspace_versions FROM anon;
CREATE OR REPLACE FUNCTION public.save_desktop_workspace(p_id uuid, p_expected_revision integer, p_payload jsonb, p_deleted boolean DEFAULT false)
RETURNS public.desktop_workspaces
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE saved public.desktop_workspaces;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 OR p_payload->>'schema_version' IS DISTINCT FROM '1'
     OR p_payload->'project'->>'id' IS DISTINCT FROM p_id::text THEN
    RAISE EXCEPTION 'Invalid desktop workspace';
  END IF;
  IF p_expected_revision=0 THEN
    INSERT INTO desktop_workspaces(id,user_id,revision,payload,deleted)
      VALUES(p_id,auth.uid(),1,p_payload,p_deleted)
      ON CONFLICT(id) DO NOTHING RETURNING * INTO saved;
  ELSE
    UPDATE desktop_workspaces SET payload=p_payload,revision=revision+1,deleted=p_deleted,updated_at=now()
      WHERE id=p_id AND user_id=auth.uid() AND revision=p_expected_revision RETURNING * INTO saved;
  END IF;
  IF saved.id IS NULL THEN RAISE EXCEPTION 'Cloud workspace changed. Review the conflict before saving.' USING ERRCODE='40001'; END IF;
  INSERT INTO desktop_workspace_versions(workspace_id,user_id,revision,payload,deleted)
    VALUES(saved.id,saved.user_id,saved.revision,saved.payload,saved.deleted);
  RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.save_desktop_workspace(uuid,integer,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_desktop_workspace(uuid,integer,jsonb,boolean) TO authenticated;
COMMIT;
