import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("codex batch import single-session rendering", () => {
  it("renders the active batch import modal through document.body", () => {
    const source = readFileSync(
      `${process.cwd()}/src/pages/CodexAccountsView.tsx`,
      "utf8",
    );

    const overlayIndex = source.indexOf(
      'className="modal-overlay codex-batch-import-overlay"',
    );
    const createPortalIndex = source.lastIndexOf("createPortal(", overlayIndex);
    const documentBodyIndex = source.indexOf("document.body", overlayIndex);

    assert.notEqual(overlayIndex, -1, "batch import overlay should exist");
    assert.ok(
      /\{batchImportOpen\s*&&\s*createPortal\(/.test(source) &&
        createPortalIndex !== -1 &&
        documentBodyIndex !== -1 &&
        createPortalIndex < overlayIndex &&
        overlayIndex < documentBodyIndex,
      "the single active batch import should render in a document.body portal",
    );
  });

  it("keeps a minimized batch import task on the Codex accounts page", () => {
    const source = readFileSync(
      `${process.cwd()}/src/pages/CodexAccountsOverviewPanel.tsx`,
      "utf8",
    );

    assert.ok(
      source.includes("batchImportSessionId &&") &&
        source.includes("!batchImportOpen") &&
        source.includes("!batchImportResult"),
      "a live single-session task should stay visible after the modal is minimized",
    );
    assert.ok(
      source.includes('className="codex-batch-import-task"'),
      "the minimized task should render on the Codex accounts page",
    );
    assert.ok(
      source.includes("setBatchImportOpen(true)"),
      "the minimized task should reopen the batch import modal",
    );
    assert.ok(
      source.includes("handleDismissBatchImportTask"),
      "the minimized task should support dismissing the current session",
    );
  });
});
