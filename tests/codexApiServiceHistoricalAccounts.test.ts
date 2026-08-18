import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(
  `${process.cwd()}/src/pages/CodexApiServicePage.tsx`,
  "utf8",
);
const styleSource = readFileSync(
  `${process.cwd()}/src/pages/CodexApiServicePage.css`,
  "utf8",
);

describe("Codex API service historical accounts", () => {
  it("builds history from selected-range stats outside the live member set", () => {
    assert.ok(pageSource.includes("const historicalAccountRows = useMemo"));
    assert.ok(
      pageSource.includes(
        ".filter((stat) => !memberAccountIdSet.has(stat.accountId))",
      ),
    );
    assert.ok(pageSource.includes('? ("not-joined" as const)'));
    assert.ok(pageSource.includes(': ("deleted" as const)'));
  });

  it("keeps current and historical accounts in separate sections", () => {
    assert.ok(pageSource.includes('"codex.localAccess.currentAccounts"'));
    assert.ok(pageSource.includes('"codex.localAccess.historicalAccounts"'));
    assert.ok(pageSource.includes('"codex.localAccess.historyNotJoined"'));
    assert.ok(pageSource.includes('"codex.localAccess.historyDeleted"'));
  });

  it("renders the plan badge before the historical state badge", () => {
    const historyCardStart = pageSource.indexOf(
      'key={`history-${stat.accountId}`}',
    );
    const planBadge = pageSource.indexOf("presentation.planLabel", historyCardStart);
    const statusBadge = pageSource.indexOf(
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
    assert.ok(pageSource.includes("codex-api-service-account-card-actions"));
    assert.ok(pageSource.includes("handleToggleBackupDispatch"));
    assert.ok(
      pageSource.includes(
        "codexLocalAccessService.updateCodexLocalAccessBackupDispatch(",
      ),
    );
    assert.ok(
      styleSource.includes(".codex-api-service-backup-dispatch-switch"),
    );
  });

  it("rejects stale full-table model-rule drafts", () => {
    assert.ok(pageSource.includes("accountModelRulesBaseUpdatedAt"));
    assert.ok(pageSource.includes("collection?.updatedAt ?? null"));
    assert.ok(
      pageSource.includes("accountModelRulesBaseUpdatedAt ?? undefined"),
    );
  });

  it("labels in-flight requests selected before fallback was paused", () => {
    assert.ok(pageSource.includes("const activityPredatesPause ="));
    assert.ok(
      pageSource.includes('"codex.localAccess.backupDispatchDraining"'),
    );
  });
});
