-- Applied to user-authorized development project vedcjesnnfdaxrborqtj on 2026-09-04.
-- A BEGIN/ROLLBACK trial passed first; no records or RLS policies were deleted.
-- Additive metadata; existing projects remain web projects. Existing RLS stays intact.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'web';
ALTER TABLE public.projects ALTER COLUMN app_url DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'projects_v2_type_check'
                   AND conrelid = 'public.projects'::regclass) THEN
    ALTER TABLE public.projects ADD CONSTRAINT projects_v2_type_check
      CHECK (project_type IN ('web', 'desktop'));
  END IF;
END $$;
-- Do not put machine-specific EXE paths, process IDs, or credentials in projects.
-- Device bindings will be stored locally by the desktop runner.
COMMIT;
