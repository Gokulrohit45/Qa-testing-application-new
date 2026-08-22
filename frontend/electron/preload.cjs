const { contextBridge } = require('electron');

const portArg = process.argv.find(value => value.startsWith('--qa-ai-port='));
const tokenArg = process.argv.find(value => value.startsWith('--qa-ai-token='));
const supabaseUrlArg = process.argv.find(value => value.startsWith('--qa-ai-supabase-url='));
const supabaseKeyArg = process.argv.find(value => value.startsWith('--qa-ai-supabase-anon-key='));
const cloudApiArg = process.argv.find(value => value.startsWith('--qa-ai-cloud-api-url='));
const port = portArg ? Number(portArg.split('=')[1]) : 5000;
const token = tokenArg ? tokenArg.slice('--qa-ai-token='.length) : '';

contextBridge.exposeInMainWorld('qaDesktop', Object.freeze({
  isDesktop: true,
  localApiUrl: `http://127.0.0.1:${port}/api`,
  localApiToken: token,
  supabaseUrl: supabaseUrlArg ? supabaseUrlArg.slice('--qa-ai-supabase-url='.length) : '',
  supabaseAnonKey: supabaseKeyArg ? supabaseKeyArg.slice('--qa-ai-supabase-anon-key='.length) : '',
  cloudApiUrl: cloudApiArg ? cloudApiArg.slice('--qa-ai-cloud-api-url='.length) : ''
}));
