import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { deferred, loadHookModule, settlePromises } from '../../tests/helpers/reactHookHarness';
import * as clientConfigs from '../utils/apikeyFunClientConfigs';
import type { ManagedApiKey } from '../services/apiKeyFunVault';

const t = (key: string, fallback?: string | { defaultValue?: string }) =>
  typeof fallback === 'string' ? fallback : fallback?.defaultValue ?? key;
const ConfigModal = () => null;
const keys: ManagedApiKey[] = [
  { id: 'a', key: 'private-key-a', name: 'Relay A', baseUrl: 'https://a.example.test/custom/v1', createdAt: 1, lastUsedAt: 1 },
  { id: 'b', key: 'private-key-b', name: 'Relay B', baseUrl: 'https://b.example.test/other/v1', createdAt: 1, lastUsedAt: 1 },
  { id: 'legacy', key: 'private-legacy-key', name: 'Legacy', createdAt: 1, lastUsedAt: 1 },
];

function nodes(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object' || !tree.props) return [];
  return [tree, ...nodes(tree.props.children)];
}

function page() {
  const requests: Array<{ baseUrl: string; apiKey: string; result: ReturnType<typeof deferred<any>> }> = [];
  const usageRequests: Array<ReturnType<typeof deferred<any>>> = [];
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const writes: ManagedApiKey[][] = [];
  const h = loadHookModule(new URL('./ApiKeyFunPage.tsx', import.meta.url), {
    '@tauri-apps/api/core': { isTauri: () => false },
    '@tauri-apps/plugin-dialog': {},
    'react-i18next': { useTranslation: () => ({ t }) },
    '../services/modelProviderUsageService': {
      queryModelProviderUsage: () => {
        const result = deferred<any>(); usageRequests.push(result); return result.promise;
      },
      listModelProviderModels: (input: { baseUrl: string; apiKey: string }) => {
        const result = deferred<any>();
        requests.push({ ...input, result });
        return result.promise;
      },
    },
    '../utils/apikeyFunLinks': { APIKEY_FUN_SOURCE_TAG: 'custom' },
    '../utils/apikeyFunClientConfigs': clientConfigs,
    '../utils/apiKeyFunPrefill': {},
    '../components/apiKeyFun/ApiKeyFunKeyConfigModal': { ApiKeyFunKeyConfigModal: ConfigModal },
    '../components/ModalErrorMessage': {
      ModalErrorMessage: 'ModalErrorMessage',
      useModalErrorState: () => {
        const [message, setMessage] = h.hooks.useState(null);
        return { message, clear: () => setMessage(null), report: setMessage };
      },
    },
    '../services/apiKeyFunVault': {
      initializeApiKeyFunVault: async () => {},
      subscribeApiKeyFunVault: (listener: (items: ManagedApiKey[]) => void) => { listener(keys); return () => {}; },
      updateApiKeyFunVault: async (update: (items: ManagedApiKey[]) => ManagedApiKey[]) => { writes.push(update(keys)); },
    },
  }, { window: {
    setTimeout(callback: () => void) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id: number) { timers.delete(id); },
  } });
  h.render(() => h.exports.ApiKeyFunPage());
  const open = (index: number) => {
    const button = nodes(h.flush()).filter((node) => node.props.title === '使用密钥')[index];
    assert.ok(button);
    button.props.onClick({ stopPropagation() {} });
    return h.flush();
  };
  const modal = () => nodes(h.flush()).find((node) => node.type === ConfigModal)?.props;
  return { h, requests, usageRequests, writes, open, modal,
    fireTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); },
  };
}

test('a saved key always queries and configures its own address while another relay is selected', async () => {
  const p = page();
  p.open(1);
  assert.equal(p.requests.length, 1);
  assert.equal(p.requests[0].baseUrl, keys[1].baseUrl);
  assert.equal(p.requests[0].apiKey, keys[1].key);
  assert.equal(p.modal().baseUrl, keys[1].baseUrl);
  assert.equal(p.modal().apiKey, keys[1].key);
  p.requests[0].result.resolve({ models: [{ id: 'model-b' }] });
  await settlePromises();
  assert.deepEqual(Array.from(p.modal().models), ['model-b']);
  p.h.unmount();
});

test('late results from another saved key or a closed modal cannot replace the current models', async () => {
  const p = page();
  p.open(1);
  p.open(0);
  p.requests[1].result.resolve({ models: [{ id: 'model-a' }] });
  await settlePromises();
  p.requests[0].result.resolve({ models: [{ id: 'stale-model-b' }] });
  await settlePromises();
  assert.equal(p.modal().apiKey, keys[0].key);
  assert.deepEqual(Array.from(p.modal().models), ['model-a']);
  p.open(1);
  p.modal().onClose();
  p.requests[2].result.resolve({ models: [{ id: 'closed-model-b' }] });
  await settlePromises();
  assert.equal(p.modal(), undefined);
  p.h.unmount();
});

test('a legacy saved key without an address opens safely without querying another relay', () => {
  const p = page();
  p.open(2);
  assert.equal(p.requests.length, 0);
  assert.equal(p.modal().baseUrl, undefined);
  assert.equal(p.modal().modelsLoading, false);
  p.h.unmount();
});

test('switching relays clears prior usage before the new key can be saved', async () => {
  const p = page();
  p.fireTimers();
  p.usageRequests[0].resolve({ remaining: 111, isValid: true });
  p.requests[0].result.resolve({ models: [] });
  await settlePromises();
  const selectB = nodes(p.h.flush()).filter((node) => node.props.className === 'apikey-fun-key-select')[1];
  selectB.props.onClick();
  const save = nodes(p.h.flush()).find((node) => node.props.className === 'btn apikey-fun-save-btn');
  await save.props.onClick();
  const savedB = p.writes[p.writes.length - 1].find((item) => item.id === 'b');
  assert.equal(savedB?.lastStatus, 'unknown');
  assert.equal(savedB?.lastRemaining, '--');
  p.h.unmount();
});

test('prefill rejects a legacy key even when the current input names another relay', () => {
  const source = ts.createSourceFile('page.tsx', readFileSync(new URL('./ApiKeyFunPage.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration: ts.VariableStatement | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some((item) => item.name.getText(source) === 'handlePrefillTarget')) declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(declaration);
  const actions: any[] = [];
  const navigation: any[] = [];
  const context = {
    useCallback: (callback: unknown) => callback,
    normalizeApiKeyFunClientBaseUrl: clientConfigs.normalizeApiKeyFunClientBaseUrl,
    providerBaseUrl: keys[0].baseUrl, apiKeyFunModelCatalog: ['gpt-6-sol'], t,
    setManagedKeyAction: (...args: unknown[]) => actions.push(args),
    getApiKeyFunPrefillPage: () => 'codex', APIKEY_FUN_SOURCE_TAG: 'custom',
    window: { dispatchEvent: (event: unknown) => navigation.push(event), setTimeout: (callback: () => void) => callback() },
    CustomEvent: class { constructor(public type: string, public options: unknown) {} },
    dispatchApiKeyFunPrefillEvent: (event: unknown) => navigation.push(event),
  };
  const prefill = vm.runInNewContext(ts.transpileModule(`(() => { ${declaration.getText(source)} return handlePrefillTarget; })`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context)();
  prefill('codex', keys[2]);
  assert.equal(navigation.length, 0);
  assert.equal(actions[0][1].status, 'error');
  prefill('codex', keys[1]);
  assert.equal(navigation.length, 2);
  assert.equal(navigation[1].baseUrl, keys[1].baseUrl);
  assert.equal(navigation[1].apiKey, keys[1].key);
});

test('the config modal requires an explicit address for legacy keys and forwards custom addresses', () => {
  const previewCalls: any[] = [];
  const h = loadHookModule(new URL('../components/apiKeyFun/ApiKeyFunKeyConfigModal.tsx', import.meta.url), {
    'react-i18next': { useTranslation: () => ({ t }) },
    '../SingleSelectDropdown': { SingleSelectDropdown: 'select' },
    '../../utils/apikeyFunClientConfigs': { ...clientConfigs,
      buildApiKeyFunClientPreview: (input: any) => {
        previewCalls.push(input);
        return clientConfigs.buildApiKeyFunClientPreview(input);
      },
    },
  });
  let baseUrl: string | undefined;
  h.render(() => h.exports.ApiKeyFunKeyConfigModal({ apiKey: 'private-legacy-key', keyName: 'Legacy',
    baseUrl, models: ['gpt-6-sol'], modelsLoading: false, onClose() {} }));
  assert.equal(previewCalls.length, 0);
  assert.equal(nodes(h.flush()).filter((node) => node.props.role === 'alert').length, 1);
  assert.ok(!JSON.stringify(h.flush()).includes('private-legacy-key'));
  baseUrl = 'https://custom.example.test/proxy/v1';
  h.flush();
  assert.ok(previewCalls.length > 0);
  assert.equal(previewCalls[previewCalls.length - 1].baseUrl, baseUrl);
  const config = nodes(h.flush()).find((node) => node.type === 'pre' && node.props.className.includes('toml'));
  assert.ok(config.props.children.includes(`base_url = "${baseUrl}"`));
  h.unmount();
});
