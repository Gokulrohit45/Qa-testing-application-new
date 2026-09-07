// Pure validation: no credentials are logged and no network requests are made.
function testEnvironment(env) {
  if (env.QA_AI_TEST_ENVIRONMENT !== '1') return null;
  const cloud = env.QA_AI_TEST_CLOUD_API_URL;
  const supabase = env.QA_AI_TEST_SUPABASE_URL;
  const key = env.QA_AI_TEST_SUPABASE_ANON_KEY;
  const approved = env.QA_AI_TEST_PROJECT_REF;
  let cloudUrl, databaseUrl;
  try { cloudUrl = new URL(cloud); databaseUrl = new URL(supabase); }
  catch { throw new Error('Test mode requires explicit test backend and database URLs. Production fallback is disabled.'); }
  if (!approved || databaseUrl.hostname !== `${approved}.supabase.co` || databaseUrl.protocol !== 'https:') {
    throw new Error('Test database must match the explicitly approved test project reference.');
  }
  if (cloudUrl.hostname === 'qa-testing-application-new.onrender.com' ||
      !['http:', 'https:'].includes(cloudUrl.protocol) ||
      (cloudUrl.protocol === 'http:' && !['127.0.0.1', 'localhost'].includes(cloudUrl.hostname)) ||
      cloudUrl.username || cloudUrl.password || databaseUrl.username || databaseUrl.password ||
      typeof key !== 'string' || key.length < 20) {
    throw new Error('Invalid test configuration or production backend selected.');
  }
  return {cloudApiUrl: cloud.replace(/\/$/, ''), supabase_url: supabase, supabase_anon_key: key};
}
module.exports = {testEnvironment};
