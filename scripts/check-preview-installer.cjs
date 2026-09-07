const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const asar = require(path.join(root, 'frontend/node_modules/@electron/asar'));
const config = require(path.join(root, 'frontend/electron/preview-builder.cjs'));
const output = config.directories.output;
const resources = path.join(output, 'win-unpacked/resources');
const archive = path.join(resources, 'app.asar');
const metadata = JSON.parse(asar.extractFile(archive, 'package.json'));
assert.equal(config.appId, 'com.qa.ai.platform.preview');
assert.equal(config.publish, null);
assert.equal(metadata.name, 'qa-ai-platform-preview');
assert.equal(metadata.productName, 'QA-AI Platform Preview');
assert.equal(metadata.version, config.extraMetadata.version);
assert.ok(require(path.join(root, 'frontend/electron/public-config.cjs')).validPublicConfig(JSON.parse(asar.extractFile(archive, path.join('electron', 'public-config.json')))));
const names = asar.listPackage(archive);
assert.ok(!names.some(name => /(?:^|[/\\])(?:\.env(?:\..*)?|.*service[-_]?account.*\.json|.*\.(?:pem|key))$/i.test(name)), 'Unexpected configuration or credential file in archive');
let compared = 0;
function compareTree(directory, prefix) {
  for (const item of fs.readdirSync(directory, {withFileTypes:true})) {
    const relative = path.join(prefix, item.name);
    const source = path.join(directory, item.name);
    if (item.isDirectory()) compareTree(source, relative);
    else {assert.deepEqual(asar.extractFile(archive, relative), fs.readFileSync(source), relative + ' differs from current source'); compared++;}
  }
}
compareTree(path.join(root, 'frontend/dist'), 'dist');
compareTree(path.join(root, 'frontend/electron'), 'electron');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(hash(path.join(resources, 'python_engine/qa-ai-engine.exe')), hash(path.join(root, '.test-results/frozen-v2/qa-ai-engine.exe')));
for (const prefix of ['chromium-', 'chromium_headless_shell-']) assert.ok(fs.readdirSync(path.join(resources, 'playwright-browsers')).some(name=>name.startsWith(prefix)), 'Missing browser mode: ' + prefix);
const installer = path.join(output, `QA-AI-Platform-Preview-${metadata.version}-x64.exe`);
assert.equal(fs.readFileSync(installer).subarray(0,2).toString(), 'MZ');
assert.ok(fs.statSync(installer).size > 1000000);
assert.ok(!/taskkill|nsExec::Exec/i.test(fs.readFileSync(path.join(root, 'frontend/electron/installer.nsh'), 'utf8')));
console.log(`Preview packaging checks passed: identity/version, ${compared} current UI/Electron files, engine hash, Chromium resources, installer executable and filename exclusions.`);
console.log('Clean installation, upgrade, uninstall and native application acceptance are separate checks.');
