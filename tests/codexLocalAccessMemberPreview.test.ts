import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const rendererSource = readFileSync(
  `${process.cwd()}/src/pages/useCodexAccountsRenderers.tsx`,
  "utf8",
);
const controllerSource = readFileSync(
  `${process.cwd()}/src/pages/useCodexAccountsLocalAccessController.tsx`,
  "utf8",
);
const styleSource = readFileSync(
  `${process.cwd()}/src/styles/pages/codex-accounts-overview.css`,
  "utf8",
);

describe("Codex API service member preview", () => {
  it("renders every API service member in the ordinary Codex card", () => {
    assert.ok(
      rendererSource.includes("const localAccessDisplayAccounts = useMemo"),
      "the preview must use the complete sorted member list",
    );
    assert.ok(
      rendererSource.includes(
        "localAccessDisplayAccounts.map(({ account, activity }) =>",
      ),
      "the card must render every member instead of slicing a fixed preview",
    );
    assert.equal(
      rendererSource.includes("localAccessDisplayAccounts.slice("),
      false,
      "the complete member list must not be truncated",
    );
  });

  it("sorts running and recently dispatched accounts first", () => {
    const runningSortIndex = rendererSource.indexOf(
      "if (leftRunning !== rightRunning) return rightRunning - leftRunning",
    );
    const recentSortIndex = rendererSource.indexOf(
      "if (leftRecent !== rightRecent) return rightRecent - leftRecent",
    );
    const stableSortIndex = rendererSource.indexOf(
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
    assert.match(previewRule[1], /overflow-x:\s*hidden/);
  });

  it("shows routing priority without changing activity-based sorting", () => {
    assert.ok(
      rendererSource.includes("localAccessMemberPriorityByAccountId.get(account.id)"),
      "the member row should resolve its static routing priority",
    );
    assert.ok(
      rendererSource.includes("codex.localAccess.memberPriorityHighest") &&
        rendererSource.includes("codex.localAccess.memberPriorityLowest"),
      "the member row should render both highest and lowest markers",
    );
    assert.ok(
      styleSource.includes(".codex-local-access-member-priority"),
      "the compact priority marker should have a stable style",
    );
  });

  it("removes one member through the atomic backend command", () => {
    assert.equal(
      controllerSource.match(/const handleRemoveLocalAccessAccount = useCallback/g)
        ?.length,
      1,
      "the merge must not leave duplicate removal handlers",
    );
    assert.ok(
      controllerSource.includes(
        "codexLocalAccessService.removeCodexLocalAccessAccount",
      ),
      "member removal should use the backend command that updates references atomically",
    );
  });

  it("keeps dispatch activity and priority visible in the member row", () => {
    assert.ok(rendererSource.includes("codex-local-access-member-activity"));
    assert.ok(rendererSource.includes("codex-local-access-member-priority"));
  });

  it("shows the backup switch only for lowest-priority members", () => {
    assert.ok(rendererSource.includes('memberPriority === "lowest"'));
    assert.ok(rendererSource.includes("handleToggleLocalAccessBackupDispatch"));
    assert.ok(
      controllerSource.includes(
        "codexLocalAccessService.updateCodexLocalAccessBackupDispatch",
      ),
    );
    assert.ok(
      styleSource.includes(".codex-local-access-backup-dispatch-switch"),
    );
    assert.equal(
      rendererSource.includes("backup-dispatch-switch-placeholder"),
      false,
    );
  });

  it("does not label pre-pause activity as a new dispatch", () => {
    assert.ok(rendererSource.includes("const activityPredatesPause ="));
    assert.ok(
      rendererSource.includes('"codex.localAccess.backupDispatchDraining"'),
    );
    assert.ok(
      rendererSource.includes("recentAt > 0 && !activityPredatesPause"),
    );
  });
});
