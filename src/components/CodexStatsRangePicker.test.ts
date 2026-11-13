import assert from 'node:assert/strict';
import test from 'node:test';
import { loadHookModule } from '../../tests/helpers/reactHookHarness';
import { buildCodexStatsTimeRange, parseCodexStatsTimeRange, type CodexStatsRangeKey } from '../utils/codexStatsRange';

test('calendar presets refresh at every midnight while rolling and custom ranges keep their own timing', () => {
  let now = new Date(2026, 10, 13, 23, 59, 59).getTime();
  class Clock extends Date {
    constructor() { super(now); }
    static now() { return now; }
  }
  let id = 0;
  const timeouts = new Map<number, { callback: () => void; delay: number }>();
  const intervals = new Map<number, { callback: () => void; delay: number }>();
  const changes: Array<{ key: CodexStatsRangeKey; range: ReturnType<typeof buildCodexStatsTimeRange> }> = [];
  const h = loadHookModule(new URL('./CodexStatsRangePicker.tsx', import.meta.url), {
    'react-i18next': { useTranslation: () => ({ t: (_key: string, text: string) => text }) },
    '../utils/codexStatsRange': {
      buildCodexStatsTimeRange: (key: CodexStatsRangeKey) => buildCodexStatsTimeRange(key, new Date(now)),
      parseCodexStatsTimeRange,
    },
  }, { Date: Clock, window: {
    setTimeout(callback: () => void, delay: number) { timeouts.set(++id, { callback, delay }); return id; },
    clearTimeout(timer: number) { timeouts.delete(timer); },
    setInterval(callback: () => void, delay: number) { intervals.set(++id, { callback, delay }); return id; },
    clearInterval(timer: number) { intervals.delete(timer); },
  } });
  let value: CodexStatsRangeKey = 'daily';
  let range = buildCodexStatsTimeRange(value, new Date(now));
  h.render(() => h.exports.CodexStatsRangePicker({ value, range, onCustomApply() {},
    onPresetChange(key: CodexStatsRangeKey, next: typeof range) { value = key; range = next; changes.push({ key, range }); },
  }));
  for (let day = 0; day < 3; day++) {
    assert.equal(timeouts.size, 1);
    const [timer, pending] = [...timeouts.entries()][0];
    timeouts.delete(timer);
    now += pending.delay;
    pending.callback();
    h.flush();
    assert.equal(changes[day].key, 'daily');
    assert.equal(changes[day].range.startInput, `2026-11-${14 + day}`);
  }
  value = 'last24h';
  range = buildCodexStatsTimeRange(value, new Date(now));
  h.flush();
  assert.equal(timeouts.size, 0);
  assert.equal(intervals.size, 1);
  const rolling = [...intervals.values()][0];
  assert.equal(rolling.delay, 5000);
  const before = range;
  now += 5000;
  rolling.callback();
  h.flush();
  assert.equal(range.startAt - before.startAt, 5000);
  assert.equal(range.endAt - range.startAt, 86_400_000);
  value = 'custom';
  range = parseCodexStatsTimeRange('2026-10-01', '2026-10-03')!;
  h.flush();
  assert.equal(timeouts.size, 0);
  assert.equal(intervals.size, 0);
  h.unmount();
});
