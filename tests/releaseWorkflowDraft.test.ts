import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const workflowSource = readFileSync(
  `${process.cwd()}/.github/workflows/release.yml`,
  "utf8",
);

describe("fork draft release workflow", () => {
  it("accepts numeric beta tags and forwards the validated tag", () => {
    assert.ok(workflowSource.includes('- "[0-9]*"'));
    assert.ok(
      workflowSource.includes(
        "release_tag: ${{ steps.release_tag.outputs.RELEASE_TAG }}",
      ),
    );
    assert.ok(workflowSource.includes('TAG="${RELEASE_TAG}"'));
  });

  it("keeps cloud builds as drafts until manual publication", () => {
    assert.ok(workflowSource.includes("gh release create \"${TAG}\" \\"));
    assert.ok(workflowSource.includes("--draft \\"));
    assert.equal(
      workflowSource.includes("--draft=false"),
      false,
      "the cloud build workflow must never publish a draft automatically",
    );
    assert.ok(
      workflowSource.includes(
        "is already published; refusing to overwrite it as a draft",
      ),
    );
  });

  it("builds Windows only and leaves finalization disabled", () => {
    for (const job of [
      "build-macos-aarch64",
      "build-macos-x86_64",
      "build-macos-universal",
      "build-linux",
      "finalize-legacy-latest",
      "upload-checksums",
      "update-homebrew-cask",
    ]) {
      const jobStart = workflowSource.indexOf(`  ${job}:`);
      assert.ok(jobStart >= 0, `missing ${job} job`);
      const jobHeader = workflowSource.slice(jobStart, jobStart + 180);
      assert.ok(
        jobHeader.includes("if: ${{ false }}"),
        `${job} must stay disabled`,
      );
    }

    const windowsStart = workflowSource.indexOf("  build-windows:");
    const windowsHeader = workflowSource.slice(windowsStart, windowsStart + 180);
    assert.equal(windowsHeader.includes("if: ${{ false }}"), false);
  });
});
