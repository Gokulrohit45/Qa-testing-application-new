# Full-flow test environment (not production)

The ordinary desktop preview isolates local files only. It can still connect to production cloud authentication/data. Do not use it for unrestricted cloud mutation tests.

Electron now supports explicit QA_AI_TEST_ENVIRONMENT=1. It requires QA_AI_TEST_CLOUD_API_URL, QA_AI_TEST_SUPABASE_URL, QA_AI_TEST_SUPABASE_ANON_KEY and QA_AI_TEST_PROJECT_REF. The URL must match the approved separate test project reference. The known production backend is refused; missing configuration fails closed without cached/downloaded production fallback.

These variables are configuration, not a sandbox for the backend. Before full-flow testing, independently provision/approve a separate Supabase test project and storage, and run a separate backend configured with that project's credentials and test-only external services. Never copy production service-role secrets or real user data into test fixtures. The operator must verify that the approved project reference is actually non-production.

No test database has been provisioned, no migration applied and no full-flow cloud isolation certified by this change. Do not claim the current preview is isolated merely because it uses a separate local profile. A test installer and backend checks remain pending.
