# Hosted development checkpoint — 4 September 2026

## Supabase

Project: `vedcjesnnfdaxrborqtj` (Qa-testing-appplication-new).
The user authorized updates to this development database. No row deletion was necessary.

Inspected the actual project table and ownership policies through the signed-in dashboard.
Projects, test_cases and executions had RLS enabled with authenticated user ownership policies.
These policies were not changed.

Migration 002 was trialled in a transaction ending with ROLLBACK. The trial returned four existing projects, all classified as web.
The same additive migration was then committed. The returned schema showed:

- `project_type`: text, non-null, default `'web'`.
- `app_url`: nullable, allowing future desktop metadata without a fake URL.
- Migration includes the web/desktop type constraint and a five-second lock timeout.

This is schema preparation, not completed desktop cloud synchronization. Desktop projects remain local-only in the client. No credentials, machine paths, handles or process IDs were uploaded.

## Render

Service: `srv-da3drcvlk1mc73fncd0g`.
Observed deployment: commit `887353f03927d9b6cac2d582242a0d4607247388` on main.
Root directory backend; pip requirements build; gunicorn startup; health path `/api/health`.
No environment secrets were opened and no Render settings or deployment were changed.

## Remaining rollout gates

Finish and test cloud/client compatibility before enabling desktop synchronization.
Build and test the frozen runner and local installer, including clean install and upgrade.
No public release, Git push or claim of universal Windows application support is justified by this checkpoint.
