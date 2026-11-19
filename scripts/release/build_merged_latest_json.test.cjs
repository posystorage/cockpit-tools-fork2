const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('fork validation builds a beta manifest from signed Windows x64 and macOS inputs', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-merged-manifest-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const notes = path.join(root, 'notes.md');
  const output = path.join(root, 'latest.json');
  const assets = {
    'darwin-aarch64': 'Cockpit.Tools_aarch64.app.tar.gz',
    'darwin-x86_64': 'Cockpit.Tools_x64.app.tar.gz',
    'windows-x86_64': 'Cockpit.Tools_1.4.2_x64_en-US.msi',
    'windows-x86_64-nsis': 'Cockpit.Tools_1.4.2_x64-setup.exe',
  };
  for (const [platform, asset] of Object.entries(assets)) {
    fs.writeFileSync(path.join(root, asset), 'fixture');
    fs.writeFileSync(path.join(root, `${asset}.sig`), `signature-${platform}\n`);
  }
  fs.writeFileSync(notes, 'Draft notes');
  const run = (...extra) => spawnSync(process.execPath, [
    path.join(__dirname, 'build_merged_latest_json.cjs'),
    '--version', '1.4.2', '--release-tag', '1.4.2b1', '--repo', 'owner/fork',
    '--assets-dir', root, '--notes-file', notes, '--published-at', '2026-11-19T00:00:00Z',
    '--output', output, ...extra,
  ], { encoding: 'utf8' });

  const result = run('--fork-validation');
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(manifest.version, '1.4.2');
  assert.equal(Object.keys(manifest.platforms).length, 7);
  for (const [platform, asset] of Object.entries(assets)) {
    assert.deepEqual(manifest.platforms[platform], {
      signature: `signature-${platform}`,
      url: `https://github.com/owner/fork/releases/download/1.4.2b1/${asset}`,
    });
  }

  const upstream = run();
  assert.equal(upstream.status, 1);
  assert.match(upstream.stderr, /Missing required updater asset for windows-aarch64-nsis/);

  fs.writeFileSync(path.join(root, `${assets['windows-x86_64-nsis']}.sig`), '\n');
  const missingSignature = run('--fork-validation');
  assert.equal(missingSignature.status, 1);
  assert.match(missingSignature.stderr, /Missing signature file for asset .*x64-setup\.exe/);
});
