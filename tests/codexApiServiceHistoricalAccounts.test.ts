import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const controllerSource = readFileSync(
  `${process.cwd()}/src/pages/CodexApiServicePage.tsx`,
  "utf8",
);
const viewSource = readFileSync(
  `${process.cwd()}/src/pages/CodexApiServiceView.tsx`,
  "utf8",
);
const commandSource = readFileSync(
  `${process.cwd()}/src-tauri/src/commands/codex_local_access_commands.rs`,
  "utf8",
);
const moduleSource = readFileSync(
  `${process.cwd()}/src-tauri/src/modules/codex_local_access_commands.rs`,
  "utf8",
);
const styleSource = readFileSync(
  `${process.cwd()}/src/pages/CodexApiServicePage.css`,
  "utf8",
);

describe("Codex API service historical accounts", () => {
  it("builds history from selected-range stats outside the live member set", () => {
    assert.ok(controllerSource.includes("const historicalAccountRows = useMemo"));
    assert.ok(
      controllerSource.includes(
        ".filter((stat) => !memberAccountIdSet.has(stat.accountId))",
      ),
    );
    assert.ok(controllerSource.includes('? ("not-joined" as const)'));
    assert.ok(controllerSource.includes(': ("deleted" as const)'));
  });

  it("keeps current and historical accounts in separate sections", () => {
    assert.ok(viewSource.includes('"codex.localAccess.historicalAccounts"'));
    assert.ok(viewSource.includes('"codex.localAccess.historyNotJoined"'));
    assert.ok(viewSource.includes('"codex.localAccess.historyDeleted"'));
    assert.ok(viewSource.includes('renderHistoricalAccountSection("overview-history")'));
    assert.ok(viewSource.includes('renderHistoricalAccountSection("stats-history")'));
  });

  it("renders the plan badge before the historical state badge", () => {
    const historyCardStart = viewSource.indexOf(
      'key={`${keyPrefix}-${stat.accountId}`}',
    );
    const planBadge = viewSource.indexOf("presentation.planLabel", historyCardStart);
    const statusBadge = viewSource.indexOf(
      "codex-api-service-history-account-tag",
      historyCardStart,
    );
    assert.ok(historyCardStart >= 0 && planBadge > historyCardStart);
    assert.ok(statusBadge > planBadge);
  });

  it("uses distinct styles for not-joined and deleted tags", () => {
    assert.ok(
      styleSource.includes(
        ".codex-api-service-history-account-tag.is-not-joined",
      ),
    );
    assert.ok(
      styleSource.includes(".codex-api-service-history-account-tag.is-deleted"),
    );
  });

  it("places the lowest-priority switch beside account-card actions", () => {
    assert.ok(viewSource.includes("codex-api-service-account-card-actions"));
    assert.ok(controllerSource.includes("handleToggleBackupDispatch"));
    assert.ok(
      controllerSource.includes(
        "codexLocalAccessService.updateCodexLocalAccessBackupDispatch(",
      ),
    );
    assert.ok(
      styleSource.includes(".codex-api-service-backup-dispatch-switch"),
    );
  });

  it("rejects stale full-table model-rule drafts", () => {
    assert.ok(controllerSource.includes("accountModelRulesBaseUpdatedAt"));
    assert.ok(controllerSource.includes("collection?.updatedAt ?? null"));
    assert.ok(
      controllerSource.includes("accountModelRulesBaseUpdatedAt ?? undefined"),
    );
    assert.ok(commandSource.includes("expected_updated_at: Option<i64>"));
    assert.ok(moduleSource.includes("collection.updated_at != expected_updated_at"));
  });

  it("labels in-flight requests selected before fallback was paused", () => {
    assert.ok(viewSource.includes("const activityPredatesPause ="));
    assert.ok(
      viewSource.includes('"codex.localAccess.backupDispatchDraining"'),
    );
  });
});
