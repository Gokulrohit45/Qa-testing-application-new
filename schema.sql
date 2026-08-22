-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROJECTS TABLE
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    app_name TEXT NOT NULL,
    app_url TEXT NOT NULL,
    description TEXT,
    face_auth_enabled BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. TEST CASES TABLE
CREATE TABLE IF NOT EXISTS public.test_cases (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'txt' NOT NULL, -- txt, csv, xlsx
    commands TEXT NOT NULL,           -- Raw natural language steps
    cached_json JSONB,                -- Translated Playwright JSON steps
    status TEXT DEFAULT 'pending' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. EXECUTIONS (RUNS) TABLE
CREATE TABLE IF NOT EXISTS public.executions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    test_id UUID REFERENCES public.test_cases(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL,             -- 'Passed', 'Failed', 'Running', 'Cancelled'
    duration_ms INTEGER DEFAULT 0 NOT NULL,
    browser TEXT DEFAULT 'Chromium' NOT NULL,
    headless BOOLEAN DEFAULT true NOT NULL,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. EXECUTION STEP LOGS TABLE
CREATE TABLE IF NOT EXISTS public.execution_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    execution_id UUID REFERENCES public.executions(id) ON DELETE CASCADE NOT NULL,
    step_number INTEGER NOT NULL,
    action TEXT NOT NULL,             -- 'goto', 'click', 'fill', 'wait', 'verify', 'upload_file'
    target TEXT,
    value TEXT,
    raw_command TEXT,
    args JSONB,
    status TEXT NOT NULL,             -- 'passed', 'failed', 'running'
    error_message TEXT,
    screenshot_url TEXT,
    duration_ms INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. OPENTELEMETRY SPANS TABLE
CREATE TABLE IF NOT EXISTS public.telemetry_spans (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    execution_id UUID REFERENCES public.executions(id) ON DELETE CASCADE,
    trace_id TEXT NOT NULL,
    span_id TEXT NOT NULL,
    parent_span_id TEXT,
    service_name TEXT DEFAULT 'local-playwright-runner',
    name TEXT NOT NULL,
    status_code TEXT DEFAULT 'OK',
    duration_ms INTEGER DEFAULT 0,
    attributes JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.password_reset_otps (
    email TEXT PRIMARY KEY,
    otp_hash TEXT NOT NULL,
    expires_at DOUBLE PRECISION NOT NULL,
    attempts INTEGER DEFAULT 0 NOT NULL,
    verified BOOLEAN DEFAULT false NOT NULL,
    request_count INTEGER DEFAULT 1 NOT NULL,
    window_started DOUBLE PRECISION NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- INDEXES FOR MAXIMUM QUERY PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_projects_user ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_testcases_project ON public.test_cases(project_id);
CREATE INDEX IF NOT EXISTS idx_executions_project ON public.executions(project_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_exec ON public.execution_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_spans_exec ON public.telemetry_spans(execution_id);

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_spans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_otps ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('execution-artifacts', 'execution-artifacts', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Users read execution artifacts" ON storage.objects;
DROP POLICY IF EXISTS "Users create execution artifacts" ON storage.objects;
DROP POLICY IF EXISTS "Users update execution artifacts" ON storage.objects;
DROP POLICY IF EXISTS "Users delete execution artifacts" ON storage.objects;
CREATE POLICY "Users read execution artifacts" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'execution-artifacts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users create execution artifacts" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'execution-artifacts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update execution artifacts" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'execution-artifacts' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'execution-artifacts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete execution artifacts" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'execution-artifacts' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Allow all actions for authenticated users" ON public.projects;
DROP POLICY IF EXISTS "Allow all actions for test_cases" ON public.test_cases;
DROP POLICY IF EXISTS "Allow all actions for executions" ON public.executions;
DROP POLICY IF EXISTS "Allow all actions for execution_logs" ON public.execution_logs;
DROP POLICY IF EXISTS "Allow all actions for telemetry_spans" ON public.telemetry_spans;
DROP POLICY IF EXISTS "Users manage their projects" ON public.projects;
DROP POLICY IF EXISTS "Users manage their test cases" ON public.test_cases;
DROP POLICY IF EXISTS "Users manage their executions" ON public.executions;
DROP POLICY IF EXISTS "Users manage their execution logs" ON public.execution_logs;
DROP POLICY IF EXISTS "Users manage their telemetry" ON public.telemetry_spans;

CREATE POLICY "Users manage their projects" ON public.projects FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage their test cases" ON public.test_cases FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
);
CREATE POLICY "Users manage their executions" ON public.executions FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
);
CREATE POLICY "Users manage their execution logs" ON public.execution_logs FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.executions e WHERE e.id = execution_id AND e.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.executions e WHERE e.id = execution_id AND e.user_id = auth.uid()));
CREATE POLICY "Users manage their telemetry" ON public.telemetry_spans FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.executions e WHERE e.id = execution_id AND e.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.executions e WHERE e.id = execution_id AND e.user_id = auth.uid()));
