import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("codex batch import single-session rendering", () => {
  it("renders the active batch import modal inside the accounts page", () => {
    const source = readFileSync(
      `${process.cwd()}/src/pages/CodexAccountsPage.tsx`,
      "utf8",
    );

    assert.ok(
      source.includes("{batchImportOpen && (") &&
        source.includes('className="modal-overlay codex-batch-import-overlay"'),
      "the single active batch import should render from page state",
    );
  });

  it("keeps one hidden task on the accounts page while its modal is closed", () => {
    const source = readFileSync(
      `${process.cwd()}/src/pages/CodexAccountsPage.tsx`,
      "utf8",
    );

    assert.ok(
      source.includes("batchImportSessionId &&") &&
        source.includes("!batchImportOpen &&") &&
        source.includes('className="codex-batch-import-task"'),
      "a closed active session should remain visible as an in-page task",
    );
    assert.ok(
      source.includes("onClick={() => setBatchImportOpen(true)}"),
      "the hidden task should reopen its modal directly",
    );
  });

  it("does not restore the removed multi-session queue state", () => {
    const source = readFileSync(
      `${process.cwd()}/src/pages/CodexAccountsPage.tsx`,
      "utf8",
    );

    assert.equal(source.includes("batchImportTasks"), false);
    assert.equal(source.includes("activeBatchImportTaskId"), false);
    assert.equal(source.includes("handledBatchImportReopenNonceRef"), false);
    assert.ok(
      source.includes("setBatchImportSessionId") &&
        source.includes("batchImportSessionIdRef"),
      "the page should own one active import session",
    );
  });
});
