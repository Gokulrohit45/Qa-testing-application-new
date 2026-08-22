# QA-AI Autonomous Testing Platform

QA-AI is a Windows desktop application with an Electron interface, a bundled
local Playwright engine, and Supabase-backed user data. Release builds do not
require users to install Python, Node.js, Chromium, or FFmpeg.

## Security and configuration

Repository `.env` files are intentionally excluded from Vite and from desktop
release artifacts. Never place the Supabase service-role key, Gemini key, or
Brevo key in the frontend or desktop installer.

The cloud service requires these server-side environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`
- `CORS_ALLOWED_ORIGINS` (comma-separated deployed frontend origins)

Deploy the updated cloud backend and apply `schema.sql` before distributing the
desktop installer. The desktop retrieves `/api/public-config` on first launch
and caches only the public Supabase URL and anonymous key; it never receives or
stores server secrets.

The Windows build receives only public frontend configuration through its
process environment:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_CLOUD_API_URL`

Apply [schema.sql](schema.sql) to Supabase before deploying the updated client.
Existing rows with a missing `user_id` must be assigned to their correct owner
or removed before enforcing non-null ownership.

## Windows release

Use GitHub Actions `Windows release`, or run from PowerShell on a Windows build
machine with Python 3.11+ and Node.js 20+:

```powershell
./scripts/build-windows.ps1
```

Artifacts are written to `frontend/release`. Both an NSIS installer and a ZIP
build are produced. The script bundles the Python backend, Playwright Chromium,
and FFmpeg support; end-user laptops do not need those prerequisites.

## Verification

```powershell
py -3 -m unittest discover -s backend/tests -v
Set-Location frontend
npm.cmd ci
npm.cmd run build
```

Release acceptance should additionally cover: install/uninstall on a clean
Windows 10 and Windows 11 VM, login, offline restart with an existing session,
project synchronization across two accounts, headed/headless execution, stop,
video conversion, screenshot display, PDF export, and upgrade installation.
