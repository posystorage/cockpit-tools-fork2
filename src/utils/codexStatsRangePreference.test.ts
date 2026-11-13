import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCodexStatsTimeRange,
  parseCodexStatsTimeRange,
} from "./codexStatsRange.ts";
import {
  isValidCodexStatsRangePreference,
  normalizeCodexSessionUsageRange,
  readCodexStatsRangeSelection,
  serializeCodexStatsRangeSelection,
} from "./codexStatsRangePreference.ts";

const NOW = new Date(2026, 8, 6, 13, 20, 0);

test("defaults to rolling seven days when no range was saved", () => {
  const selection = readCodexStatsRangeSelection(null, NOW);

  assert.equal(selection.key, "rolling7d");
  assert.deepEqual(selection.range, buildCodexStatsTimeRange("rolling7d", NOW));
});

test("restores every preset instead of treating daily as the default", () => {
  for (const key of ["daily", "rolling7d", "weekly", "monthly"] as const) {
    const selection = readCodexStatsRangeSelection(key, NOW);
    assert.equal(selection.key, key);
    assert.deepEqual(selection.range, buildCodexStatsTimeRange(key, NOW));
  }
});

test("shared modal migrates the legacy exact seven-day preset to calendar days", () => {
  const selection = readCodexStatsRangeSelection("last7d", NOW);
  assert.equal(selection.key, "rolling7d");
  assert.deepEqual(selection.range, buildCodexStatsTimeRange("rolling7d", NOW));
});

test("standalone API stats restore exact rolling presets through durable migration", () => {
  for (const key of ["last24h", "last48h", "last7d"] as const) {
    const saved = serializeCodexStatsRangeSelection({ key, range: buildCodexStatsTimeRange(key, NOW) });
    assert.ok(saved && isValidCodexStatsRangePreference(saved));
    const restored = readCodexStatsRangeSelection(saved, NOW, true);
    assert.equal(restored.key, key);
    assert.deepEqual(restored.range, buildCodexStatsTimeRange(key, NOW));
    assert.equal(readCodexStatsRangeSelection(saved, NOW).key, "rolling7d");
    const later = new Date(NOW.getTime() + 30000);
    assert.equal(readCodexStatsRangeSelection(saved, later, true).range.endAt, later.getTime());
  }
});

test("round-trips custom start and end dates", () => {
  const range = parseCodexStatsTimeRange("2026-08-01", "2026-08-17");
  assert.ok(range);

  const saved = serializeCodexStatsRangeSelection({ key: "custom", range });
  assert.ok(saved && isValidCodexStatsRangePreference(saved));
  const restored = readCodexStatsRangeSelection(saved, NOW);
  assert.equal(restored.key, "custom");
  assert.equal(restored.range.startInput, "2026-08-01");
  assert.equal(restored.range.endInput, "2026-08-17");
});

test("falls back safely when a saved custom range is invalid", () => {
  const saved = JSON.stringify({ key: "custom", startInput: "2026-02-31", endInput: "2026-03-02" });
  assert.equal(isValidCodexStatsRangePreference(saved), false);
  assert.equal(readCodexStatsRangeSelection(saved, NOW).key, "rolling7d");
});

test("session usage supports today and preserves its seven-day default", () => {
  assert.equal(normalizeCodexSessionUsageRange("month"), "month");
  assert.equal(normalizeCodexSessionUsageRange("today"), "today");
  assert.equal(normalizeCodexSessionUsageRange("invalid"), "7d");
  assert.equal(normalizeCodexSessionUsageRange(null), "7d");
});
