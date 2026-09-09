const path = require('path');
const base = require('../package.json').build;
const root = path.resolve(__dirname, '../..');
if (!require('./public-config.cjs').validPublicConfig(require('./public-config.json'))) throw new Error('A valid public-only sign-in configuration must be bundled.');
const browsers = require('fs').readdirSync(path.join(root, '.test-browsers'));
for (const prefix of ['chromium-', 'chromium_headless_shell-']) {
  if (!browsers.some(name => name.startsWith(prefix))) {
    throw new Error('Preview packaging requires both Chromium modes. Install matching browsers with the test environment: python -m playwright install chromium');
  }
}

// A separate identity prevents the development installer from replacing the
// installed application or sharing its local session/database.
module.exports = {
  ...base,
  appId: 'com.qa.ai.platform.preview',
  productName: 'QA-AI Platform Preview',
  extraMetadata: { name: 'qa-ai-platform-preview', productName: 'QA-AI Platform Preview', version: '2.0.0-rc.4' },
  directories: { output: path.join(root, '.test-results/installer-v2') },
  extraResources: [
    { from: path.join(root, '.test-results/frozen-v2/qa-ai-engine.exe'), to: 'python_engine/qa-ai-engine.exe' },
    { from: path.join(root, '.test-browsers'), to: 'playwright-browsers', filter: ['**/*'] }
  ],
  win: { ...base.win, icon: path.join(__dirname, 'assets/app-icon.ico'), target: ['nsis'], artifactName: 'QA-AI-Platform-Preview-${version}-${arch}.${ext}' },
  publish: null
};
