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
    if (job !== 'build-macos-universal') {
      assert.match(body, /tauri(?:\.cjs)? build .*--config src-tauri\/tauri\.prebuilt-frontend\.conf\.json/);
    }
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

test("macOS signing requires an explicit fork opt-in and complete credentials", () => {
  for (const [job, next] of [
    ["build-macos-aarch64", "build-macos-x86_64"],
    ["build-macos-x86_64", "build-macos-universal"],
    ["build-macos-universal", "build-linux"],
  ]) {
    const body = jobBody(job, next);
    assert.match(body, /APPLE_SIGNING_ENABLED: \$\{\{ vars\.APPLE_SIGNING_ENABLED == 'true'/);
    for (const name of ['APPLE_CERTIFICATE', 'APPLE_CERTIFICATE_PASSWORD', 'APPLE_SIGNING_IDENTITY', 'APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID']) {
      assert.ok(body.includes(`secrets.${name} != ''`), `${job}: missing credential gate for ${name}`);
    }
    assert.match(body, /Prepare Apple signing and notarization\s+if: env\.APPLE_SIGNING_ENABLED == 'true'/);
    assert.match(body, /Notarize final DMG and verify macOS assets\s+if: env\.APPLE_SIGNING_ENABLED == 'true'/);
    const prepare = body.indexOf('macos-signing.cjs prepare');
    const build = body.search(/node scripts\/tauri.cjs (build|bundle)/);
    const rebuild = body.indexOf('inject-dmg-readme.cjs');
    const verify = body.indexOf('macos-signing.cjs finalize');
    const stage = body.indexOf('stage_release_assets.cjs');
    const upload = body.indexOf('upload_release_assets.cjs');
    assert.ok(prepare >= 0 && prepare < build && build < rebuild && rebuild < verify && verify < stage && stage < upload, job);
    assert.match(body, /if: always\(\)\s+run: node scripts\/release\/macos-signing.cjs cleanup/);
    for (const name of ['APPLE_CERTIFICATE', 'APPLE_CERTIFICATE_PASSWORD', 'APPLE_SIGNING_IDENTITY', 'APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID']) {
      assert.ok(body.includes(`secrets.${name}`), `${job}: missing ${name}`);
    }
  }
  assert.doesNotMatch(jobBody('build-windows', 'build-macos-aarch64'), /APPLE_PASSWORD/);
  assert.doesNotMatch(jobBody('build-linux', 'finalize-legacy-latest'), /APPLE_PASSWORD/);
});

test("all required platforms build under the same draft tag with beta manifest URLs", () => {
  for (const [job, next] of [
    ['build-windows', 'build-macos-aarch64'], ['build-macos-aarch64', 'build-macos-x86_64'],
    ['build-macos-x86_64', 'build-macos-universal'], ['build-macos-universal', 'build-linux'],
  ]) {
    const body = jobBody(job, next);
    assert.doesNotMatch(body.slice(0, body.indexOf('    steps:')), /if: \$\{\{ false \}\}/);
    assert.match(body, /RELEASE_TAG: \$\{\{ needs\.prepare-release\.outputs\.release_tag \}\}/);
    if (job !== 'build-macos-universal') assert.match(body, /--release-tag "\$\{RELEASE_TAG\}"/);
  }
  assert.match(jobBody('build-windows', 'build-macos-aarch64'), /Preserve legacy updater in draft release\s+if: needs\.prepare-release\.outputs\.publish == 'true'/);
  assert.doesNotMatch(workflow, /setup-go|COCKPIT_SKIP_CLIPROXY_BUILD/);
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

test("macOS release builds use the same target cache as main prewarming", () => {
  const warm = fs.readFileSync(path.join(__dirname, "../../.github/workflows/warm-macos-release-cache.yml"), "utf8");
  assert.match(warm, /uses: \.\/.github\/actions\/macos-release-cache\s+with:\s+target: \$\{\{ matrix.target \}\}/);
  for (const [arch, next, target] of [
    ["aarch64", "build-macos-x86_64", "aarch64-apple-darwin"],
    ["x86_64", "build-macos-universal", "x86_64-apple-darwin"],
  ]) {
    assert.ok(warm.includes(target));
    assert.match(jobBody(`build-macos-${arch}`, next), new RegExp(`uses: ./\\.github/actions/macos-release-cache\\s+with:\\s+target: ${target}`));
  }
});

test("the fork validation bundle only waits for the packages the fork builds", () => {
  const body = jobBody("validate-release-artifacts");
  const needs = body.slice(body.indexOf("    needs:"), body.indexOf("    runs-on:"));
  assert.deepEqual([...needs.matchAll(/^      - (.+)$/gm)].map((match) => match[1]), [
    "prepare-release", "build-windows", "build-macos-aarch64", "build-macos-x86_64", "build-macos-universal",
  ]);
  assert.match(body, /--release-tag "\$\{RELEASE_TAG\}"/);
  assert.match(body, /--fork-validation/);
});

test("1.4.2 release notes include each newly merged upstream release in order", () => {
  const versions = ["1.4.2", "1.4.1", "1.4.0", "1.3.84", "1.3.83"];
  const mapping = workflow.match(/"1[.]4[.]2"\)\s*RELEASE_VERSIONS=\(([^)]*)\)/);
  assert.ok(mapping);
  assert.equal(mapping[1], versions.map((version) => `"${version}"`).join(" "));
  for (const file of ["CHANGELOG.md", "CHANGELOG.zh-CN.md"]) {
    const changelog = fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
    const headings = [...changelog.matchAll(/^## \[([\d.]+)] - /gm)].map((match) => match[1]);
    assert.deepEqual(headings.slice(0, versions.length), versions, file);
  }
});

test("1.3.73 release notes include precisely the four new upstream releases", () => {
  const mapping = workflow.match(/"1[.]3[.]73"\)\s*RELEASE_VERSIONS=\(([^)]*)\)/);
  assert.ok(mapping);
  assert.equal(mapping[1], '"1.3.73" "1.3.72" "1.3.71" "1.3.70"');
});

test("1.3.75 release notes include precisely the two newly merged upstream releases", () => {
  const mapping = workflow.match(/"1[.]3[.]75"\)\s*RELEASE_VERSIONS=\(([^)]*)\)/);
  assert.ok(mapping);
  assert.equal(mapping[1], '"1.3.75" "1.3.74"');
  for (const file of ["CHANGELOG.md", "CHANGELOG.zh-CN.md"]) {
    const changelog = fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
    for (const version of ["1.3.75", "1.3.74"]) {
      assert.equal(changelog.split(`## [${version}] -`).length - 1, 1, `${file}: ${version} must appear once`);
    }
  }
});

test("1.3.82 release notes contain all seven newly merged upstream releases", () => {
  const mapping = workflow.match(/"1[.]3[.]82"\)\s*RELEASE_VERSIONS=\(([^)]*)\)/);
  assert.ok(mapping);
  assert.equal(mapping[1], '"1.3.82" "1.3.81" "1.3.80" "1.3.79" "1.3.78" "1.3.77" "1.3.76"');
  for (const file of ['CHANGELOG.md', 'CHANGELOG.zh-CN.md']) {
    const changelog = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
    for (let minor = 76; minor <= 82; minor++) {
      assert.equal(changelog.split(`## [1.3.${minor}] -`).length - 1, 1, `${file}: 1.3.${minor}`);
    }
  }
});
