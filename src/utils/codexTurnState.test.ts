import assert from "node:assert/strict";
import { it } from "node:test";
import { selectRecentTurnStates } from "./codexTurnState.ts";

it("shows only observed lengths, newest first, at most two per account", () => {
  const observations = [
    { accountId: "a", length: 292, observedAt: 10, model: "" },
    { accountId: "a", length: 312, observedAt: 40, model: "" },
    { accountId: "a", length: 332, observedAt: 30, model: "" },
    { accountId: "a", length: 311, observedAt: 50, model: "" },
    { accountId: "b", length: 356, observedAt: 60, model: "" },
  ];
  assert.deepEqual(selectRecentTurnStates(observations, "a").map((item) => item.length), [311, 312]);
  assert.deepEqual(selectRecentTurnStates(observations, "b").map((item) => item.length), [356]);
  assert.deepEqual(selectRecentTurnStates(observations, "missing"), []);
});
