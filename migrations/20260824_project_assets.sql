-- Private cross-device project asset synchronization.
CREATE TABLE IF NOT EXISTS public.project_assets (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    size_bytes BIGINT DEFAULT 0 NOT NULL,
    content_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_assets_project ON public.project_assets(project_id);
ALTER TABLE public.project_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their project assets" ON public.project_assets;
CREATE POLICY "Users manage their project assets" ON public.project_assets FOR ALL TO authenticated
USING (
  auth.uid() = user_id AND (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.desktop_workspaces d WHERE d.id = project_id AND d.user_id = auth.uid() AND NOT d.deleted)
  )
)
WITH CHECK (
  auth.uid() = user_id AND (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.desktop_workspaces d WHERE d.id = project_id AND d.user_id = auth.uid() AND NOT d.deleted)
  )
);

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-assets', 'project-assets', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Users read their project assets" ON storage.objects;
DROP POLICY IF EXISTS "Users create their project assets" ON storage.objects;
DROP POLICY IF EXISTS "Users update their project assets" ON storage.objects;
DROP POLICY IF EXISTS "Users delete their project assets" ON storage.objects;
CREATE POLICY "Users read their project assets" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'project-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users create their project assets" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'project-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update their project assets" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'project-assets' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'project-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete their project assets" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'project-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

