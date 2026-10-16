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
  }
  assert.match(workflow, /RELEASE_VERSIONS=\("1[.]3[.]69" "1[.]3[.]68" "1[.]3[.]67" "1[.]3[.]66"\)/);
});
