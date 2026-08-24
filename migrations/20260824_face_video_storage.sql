-- Private, per-user face-video cloud persistence.
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS face_video_storage_path TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('face-videos', 'face-videos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Users read their face videos" ON storage.objects;
DROP POLICY IF EXISTS "Users create their face videos" ON storage.objects;
DROP POLICY IF EXISTS "Users update their face videos" ON storage.objects;
DROP POLICY IF EXISTS "Users delete their face videos" ON storage.objects;

CREATE POLICY "Users read their face videos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'face-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users create their face videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'face-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users update their face videos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'face-videos' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'face-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete their face videos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'face-videos' AND (storage.foldername(name))[1] = auth.uid()::text);
