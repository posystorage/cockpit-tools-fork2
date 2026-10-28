import assert from 'node:assert/strict';
import test from 'node:test';
import { deferred, loadHookModule, settlePromises } from '../../tests/helpers/reactHookHarness';
import * as stats from '../utils/codexAccountWindowStats';
import type { CodexAccount } from '../types/codex';

test('overview stats refresh new requests periodically, ignore display-only rerenders, and isolate window changes', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const intervals = new Map<number, () => void>(); let intervalId = 0;
  const listeners = new Map<string, (event: any) => void>();
  const window = Object.assign(new EventTarget(), {
    setInterval(callback: () => void) { intervals.set(++intervalId, callback); return intervalId; },
    clearInterval(id: number) { intervals.delete(id); },
  });
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const reads: ReturnType<typeof deferred<any[]>>[] = [];
  const hook = loadHookModule(new URL('./useCodexAccountWindowStats.ts', import.meta.url), {
    '../utils/codexAccountWindowStats': { ...stats,
      createCodexAccountWindowStatsReader: (options: any) => stats.createCodexAccountWindowStatsReader({ ...options, minRefreshMs: 0 }),
    },
    '../services/codexLocalAccessService': { queryCodexLocalAccessAccountWindowStats() { const job = deferred<any[]>(); reads.push(job); return job.promise; } },
    '../utils/accountSyncEvents': { CURRENT_ACCOUNT_CHANGED_EVENT: 'current' },
    '../utils/tauriEventListener': { subscribeTauriEvent(name: string, handler: (event: any) => void) { listeners.set(name, handler); return () => listeners.delete(name); } },
  }, { window, document });
  const first = { id: 'a', quota: { hourly_percentage: 80, weekly_percentage: 90, hourly_reset_time: 2_000_000_000 } } as CodexAccount;
  let accounts = [first]; let active = true;
  const render = () => hook.exports.useCodexAccountWindowStats(active, accounts, ['a']);
  assert.equal(hook.render(render).ready, false);
  context.mock.timers.tick(250); assert.equal(reads.length, 1);
  const row = (count: number) => ({ accountId: 'a', windowKey: 'primary', requestCount: count, inputTokens: 100,
    cachedTokens: 50, outputTokens: 20, totalTokens: 120, estimatedCostUsd: 0.1 });
  reads[0].resolve([row(1)]); await settlePromises();
  assert.equal(hook.flush().byAccountId.a.primary.requestCount, 1);
  for (let i = 0; i < 10; i++) { accounts = [{ ...first, account_name: `display-${i}` }]; hook.flush(); }
  context.mock.timers.tick(1000); assert.equal(reads.length, 1);
  [...intervals.values()][0](); context.mock.timers.tick(250);
  reads[1].resolve([row(2)]); await settlePromises(); assert.equal(hook.flush().byAccountId.a.primary.requestCount, 2);
  listeners.get('codex:quota-updated')!({ payload: { account_id: 'a' } });
  document.visibilityState = 'hidden'; [...intervals.values()][0](); context.mock.timers.tick(250); assert.equal(reads.length, 2);
  document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange')); context.mock.timers.tick(250);
  reads[2].resolve([row(3)]); await settlePromises(); assert.equal(hook.flush().byAccountId.a.primary.requestCount, 3);
  accounts = [{ ...first, quota: { ...first.quota!, hourly_reset_time: 2_000_000_100 } }];
  assert.equal(hook.flush().byAccountId.a.primary.requestCount, 3, 'reset-time corrections retain visible counters before effects and while querying');
  context.mock.timers.tick(250);
  reads[3].resolve([row(4)]); await settlePromises(); assert.equal(hook.flush().byAccountId.a.primary.requestCount, 4);
  listeners.get('codex:quota-updated')!({ payload: { account_id: 'other' } }); context.mock.timers.tick(250); assert.equal(reads.length, 4);
  listeners.get('codex:quota-updated')!({ payload: { account_id: 'a' } }); context.mock.timers.tick(250); assert.equal(reads.length, 5);
  active = false; assert.equal(hook.flush().ready, false); assert.equal(intervals.size, 0); assert.equal(listeners.size, 0);
  active = true; assert.equal(hook.flush().ready, false); context.mock.timers.tick(1000);
  assert.equal(reads.length, 5, 'reopening waits for the old physical native query');
  reads[4].resolve([row(999)]); await settlePromises(); assert.equal(hook.flush().ready, false);
  context.mock.timers.tick(250); assert.equal(reads.length, 6);
  reads[5].resolve([row(6)]); await settlePromises(); assert.equal(hook.flush().byAccountId.a.primary.requestCount, 6);
  hook.unmount();
});

test('identity changes hide both old windows in the first render before effects and reject pending old reads', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const intervals: (() => void)[] = [];
  const window = Object.assign(new EventTarget(), {
    setInterval(callback: () => void) { intervals.push(callback); return intervals.length; },
    clearInterval() {},
  });
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const reads: ReturnType<typeof deferred<any[]>>[] = [];
  const queries: any[][] = [];
  const hook = loadHookModule(new URL('./useCodexAccountWindowStats.ts', import.meta.url), {
    '../utils/codexAccountWindowStats': { ...stats,
      createCodexAccountWindowStatsReader: (options: any) => stats.createCodexAccountWindowStatsReader({ ...options, minRefreshMs: 0 }),
    },
    '../services/codexLocalAccessService': { queryCodexLocalAccessAccountWindowStats(input: any[]) {
      queries.push(input); const job = deferred<any[]>(); reads.push(job); return job.promise;
    } },
    '../utils/accountSyncEvents': { CURRENT_ACCOUNT_CHANGED_EVENT: 'current' },
    '../utils/tauriEventListener': { subscribeTauriEvent() { return () => {}; } },
  }, { window, document });
  const first = { id: 'a', account_id: 'official-a', email: 'a@example.com', quota: {
    hourly_percentage: 80, weekly_percentage: 90, hourly_reset_time: 2_000_000_000, weekly_reset_time: 2_000_600_000,
  } } as CodexAccount;
  let accounts = [first];
  const frames: any[] = [];
  hook.render(() => {
    const result = hook.exports.useCodexAccountWindowStats(true, accounts, ['a']);
    frames.push(result); return result;
  });
  const rows = (count: number) => ['primary', 'secondary'].map(windowKey => ({ accountId: 'a', windowKey,
    requestCount: count, inputTokens: 100, cachedTokens: 50, outputTokens: 20, totalTokens: 120, estimatedCostUsd: 0.1 }));
  context.mock.timers.tick(250); reads[0].resolve(rows(7)); await settlePromises();
  assert.equal(hook.flush().byAccountId.a.secondary.requestCount, 7);
  intervals[0](); context.mock.timers.tick(250); assert.equal(reads.length, 2);
  accounts = [{ ...first, account_id: 'official-replacement' }];
  const changedFrame = frames.length;
  hook.flush();
  assert.equal(frames[changedFrame].byAccountId.a, undefined, 'identity filtering must happen before useEffect');
  reads[1].resolve(rows(999)); await settlePromises();
  assert.equal(hook.flush().byAccountId.a, undefined);
  context.mock.timers.tick(250); assert.equal(reads.length, 3);
  assert.ok(queries[2].every(query => query.officialAccountId === 'official-replacement'));
  reads[2].resolve(rows(2)); await settlePromises();
  assert.equal(hook.flush().byAccountId.a.primary.requestCount, 2);
  accounts = [{ ...accounts[0], email: 'replacement@example.com' }];
  const emailFrame = frames.length;
  hook.flush();
  assert.equal(frames[emailFrame].byAccountId.a, undefined, 'email changes also clear both windows in the first render');
  hook.unmount();
});
