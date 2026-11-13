import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function productionCallback(file: string, name: string, context: Record<string, any>) {
  const source = ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback = '';
  ts.forEachChild(source, function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name &&
        node.initializer && ts.isCallExpression(node.initializer)) {
      callback = node.initializer.arguments[0].getText(source);
    }
    ts.forEachChild(node, visit);
  });
  assert.ok(callback, name);
  vm.runInNewContext(ts.transpileModule(`globalThis.execute = ${callback}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.execute as (...args: any[]) => Promise<any>;
}

function delayed() {
  let resolve!: (value: any) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function reached(calls: string[], boundary: string) {
  for (let i = 0; i < 30 && !calls.includes(boundary); i++) await Promise.resolve();
  assert.ok(calls.includes(boundary), boundary);
}

const providerFile = '../components/codex/CodexModelProviderManager.tsx';
for (const boundary of ['access', 'bind', 'start', 'switch', 'reload-account', 'reload-api', 'reload-instances']) {
  for (const failed of [false, true]) {
    test(`provider desktop ${boundary} ${failed ? 'failure' : 'completion'} cannot touch a replacement preview`, async () => {
      const calls: string[] = [], gate = delayed();
      let current = true;
      const account = { id: 'old-account' };
      const operation = (name: string, result?: any) => async () => {
        calls.push(name); return name === boundary ? gate.promise : result;
      };
      const context = {
        providerLaunchPreview: { account, provider: { id: 'old-provider', baseUrl: 'https://example.invalid' }, instanceId: 'old-instance' },
        setNotice: () => calls.push('notice'), isCodexApiKeyAccount: () => true,
        updateAccountInstanceAccess: operation('access', account),
        resolveCodexApiProviderPresetId: () => 'custom', resolveGatewayModeByWireApi: () => 'gateway',
        resolveProviderWireApi: () => 'responses', buildCodexProviderGatewayBindId: () => 'old-binding',
        resolveCodexProviderBindAccountId: () => 'old-binding',
        updateCodexInstance: operation('bind'), startCodexInstance: operation('start'),
        switchInstanceAccount: operation('switch', false), reloadCurrentAccount: operation('reload-account'),
        reloadLocalAccessState: operation('reload-api'), reloadCodexInstances: operation('reload-instances'),
        setLastEnabledProviderId: () => calls.push('provider-state'),
        setProviderLaunchPreview: () => calls.push('close'), t: (key: string) => key,
        parseServiceError: String,
      };
      const execute = productionCallback(providerFile, 'executeProviderLaunchPreview', context);
      const pending = execute(boundary !== 'switch', { providerAccessMode: 'gateway' }, () => current);
      await reached(calls, boundary);
      current = false;
      const before = [...calls];
      if (failed) gate.reject(Error('old operation failed')); else gate.resolve(boundary === 'access' ? account : false);
      assert.equal(await pending, false);
      assert.deepEqual(calls, before, 'no later start, refresh, notice or close is dispatched');
    });
  }
}

for (const boundary of ['access', 'bind']) {
  for (const fenceChanges of [false, true]) {
    test(`instance ${boundary} completion preserves a replacement resolver with session invalidation=${fenceChanges}`, async () => {
      const calls: string[] = [], gate = delayed();
      let current = true;
      const account = { id: 'old-account' }, replacement = () => calls.push('resolve-new');
      const pendingLaunchResolve = { current: () => calls.push('resolve-old') };
      const context = {
        launchPreview: { instance: { id: 'old-instance', bindAccountId: 'old' }, account }, pendingLaunchResolve,
        isCodexApiKeyAccount: () => true,
        updateAccountInstanceAccess: async () => { calls.push('access'); return boundary === 'access' ? gate.promise : account; },
        resolveCodexProviderBindAccountId: () => 'new-binding',
        instanceStore: { updateInstance: async () => { calls.push('bind'); return gate.promise; } },
        setLaunchPreview: () => calls.push('close'),
      };
      const execute = productionCallback('./CodexInstancesPage.tsx', 'executeLaunchPreview', context);
      const pending = execute(true, { providerAccessMode: 'gateway' }, () => current);
      await reached(calls, boundary);
      pendingLaunchResolve.current = replacement;
      if (fenceChanges) current = false;
      const before = [...calls];
      gate.resolve(account);
      assert.equal(await pending, false);
      assert.equal(pendingLaunchResolve.current, replacement);
      assert.deepEqual(calls, before);
    });
  }
}

for (const boundary of ['access', 'bind', 'switch', 'refresh']) {
  test(`account desktop ${boundary} completion cannot launch or close a later preview`, async () => {
    const calls: string[] = [], gate = delayed();
    let current = true;
    const account = { id: 'old-account' };
    const operation = (name: string, result?: any) => async () => {
      calls.push(name); return name === boundary ? gate.promise : result;
    };
    const context = {
      activeLaunchPreviewAccount: account, launchPreviewInstanceId: 'old-instance', launchPreviewCliIntent: false,
      persistCodexLaunchPreviewLastInstanceId() {}, isCodexApiKeyAccount: () => true,
      updateAccountInstanceAccess: operation('access', account), DEFAULT_CODEX_INSTANCE_ID: '__default__',
      resolveCodexProviderBindAccountId: () => 'old-binding',
      codexInstanceService: { switchInstanceAccount: operation('switch', false) },
      codexInstanceStore: { updateInstance: operation('bind'), startInstance: operation('start'), fetchInstances: operation('refresh') },
      setLaunchPreviewAccount: () => calls.push('close'),
    };
    const execute = productionCallback('./useCodexAccountsAccessController.tsx', 'handleExecuteLaunchPreview', context);
    const pending = execute(boundary !== 'switch' && boundary !== 'refresh', { providerAccessMode: 'gateway' }, () => current);
    await reached(calls, boundary);
    current = false;
    const before = [...calls];
    gate.resolve(boundary === 'access' ? account : false);
    assert.equal(await pending, false);
    assert.deepEqual(calls, before);
  });
}

test('an account launch already dispatched before closing continues without touching the replacement preview', async () => {
  const calls: string[] = [], gate = delayed();
  let current = true;
  const context = {
    activeLaunchPreviewAccount: { id: 'old-account' }, launchPreviewInstanceId: 'old-instance', launchPreviewCliIntent: false,
    persistCodexLaunchPreviewLastInstanceId() {}, isCodexApiKeyAccount: () => false,
    DEFAULT_CODEX_INSTANCE_ID: '__default__', resolveCodexProviderBindAccountId: () => 'old-binding',
    codexInstanceStore: { updateInstance: async () => { calls.push('bind'); },
      startInstance: () => { calls.push('start'); return gate.promise; } },
    setLaunchPreviewAccount: () => { calls.push('close'); current = false; },
  };
  const execute = productionCallback('./useCodexAccountsAccessController.tsx', 'handleExecuteLaunchPreview', context);
  const pending = execute(true, undefined, () => current);
  await reached(calls, 'start');
  assert.deepEqual(calls, ['bind', 'start', 'close']);
  gate.resolve(true);
  assert.equal(await pending, true);
  assert.deepEqual(calls, ['bind', 'start', 'close']);
});

for (const boundary of ['bind', 'activate']) {
  for (const failed of [false, true]) {
    test(`API Service ${boundary} ${failed ? 'failure' : 'completion'} cannot close or update a replacement preview`, async () => {
      const calls: string[] = [], gate = delayed();
      let current = true;
      const context = {
        launchPreviewInstanceId: 'old-instance', DEFAULT_CODEX_INSTANCE_ID: '__default__',
        CODEX_API_SERVICE_BIND_ID: '__api_service__', CODEX_LAUNCH_PREVIEW_API_SERVICE_CARD_KEY: 'api',
        persistCodexLaunchPreviewLastInstanceId() {},
        codexInstanceStore: { updateInstance: async () => { calls.push('bind'); if (boundary === 'bind') await gate.promise; } },
        handleActivateLocalAccess: async () => { calls.push('activate'); return boundary === 'activate' ? gate.promise : {}; },
        setLocalAccessLaunchPreviewOpen: () => calls.push('close'), reloadLocalAccessState: () => calls.push('reload'),
        isCodexLaunchUnconfirmed: () => false, presentWindowsOperationError: () => { calls.push('error-dialog'); return true; },
        t: (key: string) => key,
      };
      const execute = productionCallback('./useCodexAccountsLocalAccessController.tsx', 'handleExecuteLocalAccessLaunchPreview', context);
      const pending = execute(true, undefined, () => current);
      await reached(calls, boundary);
      current = false;
      const before = [...calls];
      if (failed) gate.reject(Error('old activation failed')); else gate.resolve({});
      assert.equal(await pending, false);
      assert.deepEqual(calls, before);
    });
  }
}
