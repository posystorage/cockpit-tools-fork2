import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(
  `${process.cwd()}/src/pages/CodexAccountsPage.tsx`,
  "utf8",
);
const styleSource = readFileSync(
  `${process.cwd()}/src/styles/pages/codex.css`,
  "utf8",
);

describe("Codex API service member preview", () => {
  it("renders every API service member in the ordinary Codex card", () => {
    assert.ok(
      pageSource.includes("const previewAccounts = localAccessDisplayAccounts"),
      "the preview must use the complete sorted member list",
    );
    assert.ok(
      pageSource.includes("previewAccounts.map((account) =>"),
      "the card must render every member instead of slicing a fixed preview",
    );
    assert.equal(
      pageSource.includes("localAccessDisplayAccounts.slice("),
      false,
      "the complete member list must not be truncated",
    );
  });

  it("sorts running and recently dispatched accounts first", () => {
    const runningSortIndex = pageSource.indexOf(
      "if (leftRunning !== rightRunning) return rightRunning - leftRunning",
    );
    const recentSortIndex = pageSource.indexOf(
      "if (leftRecent !== rightRecent) return rightRecent - leftRecent",
    );
    const stableSortIndex = pageSource.indexOf(
      "return left.index - right.index",
    );

    assert.ok(runningSortIndex >= 0, "running requests should be sorted first");
    assert.ok(
      recentSortIndex > runningSortIndex,
      "recent activity should be the second sort key",
    );
    assert.ok(
      stableSortIndex > recentSortIndex,
      "inactive accounts should retain collection order",
    );
  });

  it("keeps overflow inside a scrollable member list", () => {
    const previewRule = styleSource.match(
      /\.codex-local-access-preview\s*\{([\s\S]*?)\}/,
    );

    assert.ok(previewRule, "the member preview style should exist");
    assert.match(previewRule[1], /overflow-y:\s*auto/);
    assert.match(previewRule[1], /min-height:\s*50px/);
    assert.ok(
      pageSource.includes("data-local-access-member-row") &&
        pageSource.includes("new ResizeObserver(scheduleUpdate)"),
      "the card should report members outside the visible scroll viewport",
    );
  });
});
