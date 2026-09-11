-- Allow project assets for both web projects and owner-protected desktop workspaces.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.project_assets
  DROP CONSTRAINT IF EXISTS project_assets_project_id_fkey;

DROP POLICY IF EXISTS "Users manage their project assets" ON public.project_assets;
CREATE POLICY "Users manage their project assets" ON public.project_assets FOR ALL TO authenticated
USING (
  auth.uid() = user_id
  AND (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.desktop_workspaces d WHERE d.id = project_id AND d.user_id = auth.uid() AND NOT d.deleted)
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.desktop_workspaces d WHERE d.id = project_id AND d.user_id = auth.uid() AND NOT d.deleted)
  )
);

COMMIT;
