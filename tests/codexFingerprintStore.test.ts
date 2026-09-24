import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { create } from 'zustand';
import * as helpers from '../src/utils/codexFingerprint.ts';
import * as challenges from '../src/vendor/modeltrace/challenge-browser.js';
import * as engine from '../src/vendor/modeltrace/fingerprint-core.js';
import bank from '../src/vendor/modeltrace/unified_bank.json';

function loadStore(storage: Map<string, string>, invoke: (command: string, args: any) => Promise<unknown>) {
  const source = readFileSync(new URL('../src/stores/useCodexFingerprintStore.ts', import.meta.url), 'utf8')
    .replace('import.meta.env.VITE_COCKPIT_TOOLS_PROFILE', 'undefined');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: any = {};
  const modules: Record<string, unknown> = {
    zustand: { create }, '@tauri-apps/api/core': { invoke }, '../utils/codexFingerprint': helpers,
    '../vendor/modeltrace/challenge-browser.js': challenges, '../vendor/modeltrace/fingerprint-core.js': engine,
    '../vendor/modeltrace/unified_bank.json': { default: bank },
  };
  vm.runInNewContext(output, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; },
    crypto: globalThis.crypto, localStorage: { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value) } });
  return exports.useCodexFingerprintStore;
}
const target = { id: 'provider:test:key', kind: 'provider', label: 'Test upstream', baseUrl: 'https://example.test/v1', apiKey: 'secret-test-key', wireApi: 'responses' };
const reply = Array.from({ length: 312 }, (_, i) => (i * 37) % 355 + 1).join(' ');

test('test matrix sends every selected model and exactly the configured probes', async () => {
  const storage = new Map<string, string>(); const calls: { command: string; args: any }[] = [];
  const store = loadStore(storage, async (command, args) => { calls.push({ command, args }); return command.endsWith('_probe') ? { reply, responseModel: args.model } : undefined; });
  store.getState().configure({ targetIds: [target.id], models: ['gpt-5.5', 'gpt-6-sol'], samples: 2 });
  await store.getState().start([target]);
  assert.equal(calls.filter((call) => call.command.endsWith('_probe')).length, 4);
  assert.deepEqual(calls.filter((call) => call.command.endsWith('_probe')).map((call) => call.args.model).sort(), ['gpt-5.5', 'gpt-5.5', 'gpt-6-sol', 'gpt-6-sol']);
  assert.equal(store.getState().running, false);
  assert.ok(store.getState().results.every((item: any) => item.status === 'completed' && item.analysis.used_outputs === 2), JSON.stringify(store.getState().results.map((item: any) => ({ status: item.status, error: item.error }))));
  const serialized = [...storage.values()].join('');
  assert.ok(!serialized.includes(target.apiKey));
  assert.ok(!JSON.stringify(store.getState().results).includes(target.apiKey));
  assert.equal(loadStore(storage, async () => undefined).getState().preferences.targetIds[0], target.id);
});

test('account edits do not replace last tested accounts before a new test starts', async () => {
  const storage = new Map<string, string>();
  const store = loadStore(storage, async (command) => command.endsWith('_probe') ? { reply } : undefined);
  store.getState().configure({ targetIds: [target.id], samples: 1 });
  assert.equal(loadStore(storage, async () => undefined).getState().preferences.targetIds.length, 0);
  await store.getState().start([target]);
  store.getState().configure({ targetIds: [], models: [] });
  const restored = loadStore(storage, async () => undefined).getState().preferences;
  assert.equal(restored.targetIds[0], target.id); assert.equal(restored.models.length, 0);
});

test('one valid sample followed by quota exhaustion is partial and is not retried', async () => {
  let probes = 0;
  const store = loadStore(new Map(), async (command) => {
    if (!command.endsWith('_probe')) return;
    if (++probes === 1) return { reply };
    throw new Error('HTTP 429: quota exhausted');
  });
  store.getState().configure({ targetIds: [target.id], models: ['gpt-6-sol'] });
  await store.getState().start([target]);
  assert.equal(probes, 2);
  const result = store.getState().results[0];
  assert.equal(result.status, 'partial'); assert.equal(result.requestedSamples, 3); assert.equal(result.analysis.used_outputs, 1);
  assert.match(result.error, /429/);
});

test('stop cancels the in-flight probe and leaves queued combinations cancelled', async () => {
  let rejectProbe: ((error: Error) => void) | undefined;
  let started!: () => void;
  const probeStarted = new Promise<void>((resolve) => { started = resolve; });
  let probes = 0;
  const store = loadStore(new Map(), async (command) => {
    if (command.endsWith('_probe')) {
      probes++; started();
      return new Promise((_resolve, reject) => { rejectProbe = reject; });
    }
    if (command.endsWith('_cancel')) rejectProbe?.(new Error('cancelled'));
  });
  store.getState().configure({ targetIds: [target.id], models: ['gpt-6-sol', 'gpt-6-astra'], concurrency: 1 });
  const running = store.getState().start([target]);
  await probeStarted;
  await store.getState().cancel();
  await running;
  assert.equal(probes, 1);
  assert.equal(store.getState().running, false);
  assert.ok(store.getState().results.every((item: any) => item.status === 'cancelled'));
});
