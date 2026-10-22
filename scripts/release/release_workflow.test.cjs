const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const workflowPath = path.join(__dirname, "..", "..", ".github", "workflows", "release.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");

function jobBody(name, nextName) {
  const startMarker = `  ${name}:`;
  const start = workflow.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${name} job`);
  const end = nextName ? workflow.indexOf(`  ${nextName}:`, start + startMarker.length) : workflow.length;
  assert.notEqual(end, -1, `missing ${nextName} job`);
  return workflow.slice(start, end);
}

test("fork builds remain drafts even after all platform jobs complete", () => {
  const prepare = jobBody("prepare-release", "build-windows");
  const publish = jobBody("publish-release", "update-homebrew-cask");
  assert.match(prepare, /--draft/);
  assert.doesNotMatch(workflow, /--draft=false/);
  assert.match(publish, /if: \$\{\{ false \}\}/);
  assert.doesNotMatch(publish, /gh release edit/);
  assert.match(prepare, /legacy-latest.json/);
});

test("fork retains Windows portable packaging and disables unrelated publication jobs", () => {
  assert.match(jobBody("build-windows", "build-macos-aarch64"), /build_windows_portable[.]cjs/);
  for (const name of ["build-linux", "finalize-legacy-latest", "upload-checksums", "update-homebrew-cask"]) {
    const body = jobBody(name).slice(0,190);
    assert.match(body, /if: \$\{\{ false \}\}/);
  }
});


test("enabled platform uploads use retry helper and the actual fork tag", () => {
  assert.doesNotMatch(workflow, /gh release upload/);
  for (const [job, next] of [
    ["build-windows", "build-macos-aarch64"],
    ["build-macos-aarch64", "build-macos-x86_64"],
    ["build-macos-x86_64", "build-macos-universal"],
    ["build-macos-universal", "build-linux"],
  ]) {
    const body = jobBody(job, next);
    assert.match(body, /upload_release_assets[.]cjs/);
    assert.doesNotMatch(body, /upload_release_assets[.]cjs "v/);
    assert.match(body, /RELEASE_TAG:/);
    assert.match(body, /actions\/checkout@v4/);
    assert.match(body, /actions\/setup-node@v4/);
    assert.match(body, /node scripts\/release\/upload_release_assets\.cjs/);
  }
});

test("macOS release builds use the wrapper that cleans temporary DMG mounts", () => {
  for (const [job, next, target] of [
    ["build-macos-aarch64", "build-macos-x86_64", "aarch64-apple-darwin"],
    ["build-macos-x86_64", "build-macos-universal", "x86_64-apple-darwin"],
  ]) {
    assert.ok(jobBody(job, next).includes(`node scripts/tauri.cjs build --ci --target ${target}`));
  }
  assert.match(jobBody("build-macos-universal", "build-linux"), /node scripts\/tauri.cjs bundle --ci --target universal-apple-darwin/);
});

test("Universal consumes this run's verified thin inputs and does not recompile", () => {
  const universal = jobBody("build-macos-universal", "build-linux");
  assert.match(universal, /needs:\s+- prepare-release\s+- build-macos-aarch64\s+- build-macos-x86_64/);
  assert.match(universal, /macos-universal.cjs --mode merge/);
  assert.doesNotMatch(universal, /tauri\.cjs build|npx tauri build|setup-go|host-build-cache/);
  for (const [job, next, name, target] of [
    ["build-macos-aarch64", "build-macos-x86_64", "aarch64", "aarch64-apple-darwin"],
    ["build-macos-x86_64", "build-macos-universal", "x86_64", "x86_64-apple-darwin"],
  ]) {
    const producer = jobBody(job, next);
    assert.match(producer, /macos-universal.cjs --mode stage/);
    assert.ok(producer.includes(`name: universal-inputs-${name}`));
    assert.ok(universal.includes(`name: universal-inputs-${name}`));
    assert.ok(universal.includes(`path: universal-inputs/${target}`));
    assert.match(producer, /if-no-files-found: error/);
  }
});

test("trusted main CI and release jobs share caches, with correct platform separation", () => {
  const ci = fs.readFileSync(path.join(__dirname, "../../.github/workflows/build-matrix.yml"), "utf8");
  const cache = fs.readFileSync(path.join(__dirname, "../../.github/actions/host-build-cache/action.yml"), "utf8");
  assert.match(ci, /push:\s+branches:[\s\S]*?- "main"/);
  assert.match(ci, /uses: \.\/.github\/actions\/host-build-cache\s+with:\s+target: \$\{\{ matrix.cache_target \}\}/);
  for (const target of ["windows", "macos-aarch64", "macos-x86_64", "linux-x86_64", "linux-aarch64"]) {
    assert.ok(ci.includes(`cache_target: "${target}"`));
  }
  assert.match(cache, /shared-key: host-release-v2-\$\{\{ inputs.target \}\}/);
  assert.match(cache, /workspaces: "\. -> target"/);
  assert.match(cache, /cache-workspace-crates: "false"/);
  assert.match(cache, /save-if: .*github.event_name != 'pull_request'.*refs\/heads\/main/);
  assert.match(cache, /if: runner.os != 'macOS'/);
  assert.doesNotMatch(workflow, /Library\/Caches\/tauri|uses: swatinem\/rust-cache/);
});

test("1.3.73 release notes include precisely the four new upstream releases", () => {
  const mapping = workflow.match(/"1[.]3[.]73"\)\s*RELEASE_VERSIONS=\(([^)]*)\)/);
  assert.ok(mapping);
  assert.equal(mapping[1], '"1.3.73" "1.3.72" "1.3.71" "1.3.70"');
});
