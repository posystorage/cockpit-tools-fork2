import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCodexLocalAccessBackupDispatchEnabled,
  setCodexLocalAccessBackupDispatchEnabled,
} from "./codexLocalAccessBackupDispatch.ts";

describe("Codex API service backup dispatch", () => {
  it("pauses an account without replacing its model exclusions", () => {
    const next = setCodexLocalAccessBackupDispatchEnabled(
      [{ accountId: "backup", excludedModels: ["gpt-5.4-mini"] }],
      "backup",
      false,
    );

    assert.deepEqual(next, [
      {
        accountId: "backup",
        excludedModels: ["gpt-5.4-mini", "*"],
      },
    ]);
    assert.equal(isCodexLocalAccessBackupDispatchEnabled(next, "backup"), false);
  });

  it("resumes an account without removing its other model exclusions", () => {
    const next = setCodexLocalAccessBackupDispatchEnabled(
      [{ accountId: "backup", excludedModels: ["gpt-5.4-mini", "*"] }],
      "backup",
      true,
    );

    assert.deepEqual(next, [
      { accountId: "backup", excludedModels: ["gpt-5.4-mini"] },
    ]);
    assert.equal(isCodexLocalAccessBackupDispatchEnabled(next, "backup"), true);
  });

  it("removes an empty rule after resuming", () => {
    assert.deepEqual(
      setCodexLocalAccessBackupDispatchEnabled(
        [{ accountId: "backup", excludedModels: ["*"] }],
        "backup",
        true,
      ),
      [],
    );
  });
});
