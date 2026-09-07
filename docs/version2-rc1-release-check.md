# Version 2 RC1 release check

The local release candidate passed 99 backend tests, 38 frontend tests, six browser UI scenarios, isolated PostgreSQL migration security checks, a live synthetic Gemini video-draft test, fresh frozen-engine validation, headless and visible packaged Chromium execution, installer source/hash checks, fresh-profile startup, corrupt-cache recovery and engine cleanup.

Artifact: `.test-results/installer-v2/QA-AI-Platform-Preview-2.0.0-rc.1-x64.exe`.

Live rollout remains gated on applying migration `003_desktop_cloud_workspaces.sql` to the existing Supabase project, pushing the tested source, setting Render `GEMINI_MODEL=gemini-2.5-flash`, and confirming deployed health and authenticated cloud synchronization. Do not describe the installer as cloud-ready before those checks pass.
