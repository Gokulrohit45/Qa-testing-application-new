BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.desktop_workspaces
  DROP CONSTRAINT IF EXISTS desktop_workspaces_user_id_fkey,
  ADD CONSTRAINT desktop_workspaces_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.desktop_workspace_versions
  DROP CONSTRAINT IF EXISTS desktop_workspace_versions_user_id_fkey,
  ADD CONSTRAINT desktop_workspace_versions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

COMMIT;
