const fs = require('node:fs');
const https = require('node:https');

function validPublicConfig(value) {
  try {
    const url = new URL(value.supabase_url);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return false;
    const key = value.supabase_anon_key;
    if (typeof key !== 'string') return false;
    if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
    const parts = key.split('.');
    return parts.length === 3 && JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role === 'anon';
  } catch { return false; }
}
function publicFields(value) {
  return {supabase_url: value.supabase_url, supabase_anon_key: value.supabase_anon_key};
}
function downloadPublicConfig(url, timeoutMs = 60000, transport = https) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    const request = transport.get(`${url}/public-config`, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
        if (body.length > 100000) request.destroy(new Error('Cloud configuration response is too large'));
      });
      response.on('error', error => finish(error));
      response.on('aborted', () => finish(new Error('Cloud configuration response was interrupted')));
      response.on('end', () => {
        try {
          const value = JSON.parse(body);
          if (response.statusCode !== 200 || !validPublicConfig(value)) throw new Error('Cloud returned an invalid public configuration');
          finish(null, publicFields(value));
        } catch (error) { finish(error); }
      });
    });
    request.on('error', error => finish(error));
    timer = setTimeout(() => {
      const error = new Error('Cloud configuration request timed out. Check your connection and try again.');
      finish(error); request.destroy(error);
    }, timeoutMs);
  });
}
async function getPublicConfig({testConfig, env = process.env, cachePath, bundledPath, download}) {
  if (testConfig) return testConfig;
  const injected = {supabase_url: env.QA_AI_SUPABASE_URL, supabase_anon_key: env.QA_AI_SUPABASE_ANON_KEY};
  if (validPublicConfig(injected)) return publicFields(injected);
  for (const file of [cachePath, bundledPath]) {
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      if (validPublicConfig(value)) return publicFields(value);
    } catch { /* A missing or invalid cache must not block a valid bundled configuration. */ }
  }
  const value = await download();
  if (!validPublicConfig(value)) throw new Error('Valid public sign-in configuration is unavailable.');
  const clean = publicFields(value);
  try {
    fs.mkdirSync(require('node:path').dirname(cachePath), {recursive: true});
    fs.writeFileSync(cachePath, JSON.stringify(clean), {encoding: 'utf8', mode: 0o600});
  } catch { /* A cache write failure must not prevent startup. */ }
  return clean;
}
module.exports = {validPublicConfig, getPublicConfig, downloadPublicConfig};
