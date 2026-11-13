import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { deferred, loadHookModule, settlePromises } from '../../tests/helpers/reactHookHarness';
import { buildCodexStatsTimeRange, parseCodexStatsTimeRange } from '../utils/codexStatsRange';
import { readCodexStatsRangeSelection, serializeCodexStatsRangeSelection } from '../utils/codexStatsRangePreference';

function modalStats() {
  const source = ts.createSourceFile('modal.tsx', readFileSync(new URL('./CodexLocalAccessModal.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const owner = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'CodexLocalAccessModal');
  assert.ok(owner?.body);
  const names = new Set(['savedStatsRange', 'statsRangeRefresh', 'statsSelection', 'statsRange', 'filteredStatsWindow',
    'statsRangeError', 'statsRequestSeqRef', 'handleStatsPresetChange', 'handleCustomStatsRangeApply']);
  const bindings = (name: ts.BindingName): string[] => ts.isIdentifier(name) ? [name.text]
    : name.elements.flatMap((entry) => ts.isBindingElement(entry) ? bindings(entry.name) : []);
  const statements = owner.body.statements.filter((node) => {
    if (ts.isVariableStatement(node)) return node.declarationList.declarations.some((item) => bindings(item.name).some((name) => names.has(name)));
    return ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(source) === 'useEffect'
      && node.expression.arguments[0].getText(source).includes('queryCodexLocalAccessStats(');
  });
  const h = loadHookModule(new URL('../hooks/useRefreshSafeDraft.ts', import.meta.url), {});
  let now = new Date(2026, 10, 13, 23, 59, 59).getTime();
  let saved = 'daily';
  const queries: Array<{ startAt: number; endAt: number; result: ReturnType<typeof deferred<any>> }> = [];
  const context = {
    ...h.hooks, isOpen: true,
    useDurableUiSetting: () => saved, CODEX_LOCAL_ACCESS_STATS_RANGE_STORAGE_KEY: 'modal-stats',
    readCodexStatsRangeSelection: (raw: string) => readCodexStatsRangeSelection(raw, new Date(now)),
    serializeCodexStatsRangeSelection,
    previewDurableUiSetting: (_key: string, value: string) => { saved = value; },
    stats: { updatedAt: 1 },
    queryCodexLocalAccessStats: (startAt: number, endAt: number) => {
      const result = deferred<any>(); queries.push({ startAt, endAt, result }); return result.promise;
    },
  };
  const render = vm.runInNewContext(ts.transpileModule(`(() => { ${statements.map((node) => node.getText(source)).join('\n')}
    return {statsSelection, filteredStatsWindow, statsRangeError, handleStatsPresetChange, handleCustomStatsRangeApply}; })`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  h.render(render);
  return { h, queries, context, read: () => h.flush(), saved: () => saved,
    advance() { now += 2_000; }, date: () => new Date(now),
  };
}

test('an unchanged durable daily preset advances at midnight and stale or closed modal queries cannot overwrite it', async () => {
  const p = modalStats();
  const before = p.read().statsSelection.range;
  p.advance();
  p.read().handleStatsPresetChange('daily', buildCodexStatsTimeRange('daily', p.date()));
  const after = p.read().statsSelection.range;
  assert.equal(p.saved(), 'daily');
  assert.equal(after.startAt - before.startAt, 86_400_000);
  assert.equal(p.queries.length, 2);
  const current = { totals: { requestCount: 2 } };
  p.queries[1].result.resolve(current);
  await settlePromises();
  p.queries[0].result.resolve({ totals: { requestCount: 999 } });
  await settlePromises();
  assert.equal(p.read().filteredStatsWindow, current);
  p.context.stats = { updatedAt: 2 };
  p.read();
  assert.equal(p.queries.length, 3);
  p.context.isOpen = false;
  p.read();
  p.queries[2].result.reject(new Error('closed query error'));
  await settlePromises();
  assert.equal(p.read().filteredStatsWindow, current);
  assert.equal(p.read().statsRangeError, '');
  p.h.unmount();
});

test('custom modal ranges retain their explicit dates across midnight and reopened sessions', () => {
  const p = modalStats();
  const range = parseCodexStatsTimeRange('2026-10-01', '2026-10-03')!;
  p.read().handleCustomStatsRangeApply(range);
  assert.equal(p.read().statsSelection.key, 'custom');
  p.advance();
  p.context.isOpen = false;
  p.read();
  p.context.isOpen = true;
  assert.deepEqual({ ...p.read().statsSelection.range }, range);
  assert.equal(p.read().statsSelection.key, 'custom');
  p.h.unmount();
});
