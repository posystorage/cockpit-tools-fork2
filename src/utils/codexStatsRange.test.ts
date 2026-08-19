import assert from "node:assert/strict";
import test from "node:test";

import { buildCodexStatsTimeRange } from "./codexStatsRange.ts";

const fixedNow = new Date("2026-08-20T12:34:56.789");

test("builds rolling 24h, 48h, and 7d ranges from the current instant", () => {
  const ranges = [
    ["last24h", 24],
    ["last48h", 48],
    ["last7d", 7 * 24],
  ] as const;

  for (const [key, hours] of ranges) {
    const range = buildCodexStatsTimeRange(key, fixedNow);
    assert.equal(range.endAt, fixedNow.getTime());
    assert.equal(range.startAt, fixedNow.getTime() - hours * 60 * 60 * 1000);
  }
});

test("keeps calendar presets aligned to local calendar boundaries", () => {
  const daily = buildCodexStatsTimeRange("daily", fixedNow);
  assert.equal(new Date(daily.startAt).getHours(), 0);
  assert.equal(new Date(daily.endAt).getHours(), 23);

  const weekly = buildCodexStatsTimeRange("weekly", fixedNow);
  assert.equal(new Date(weekly.startAt).getDay(), 1);
  assert.equal(new Date(weekly.endAt).getHours(), 23);
});
