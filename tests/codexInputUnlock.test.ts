import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Session } from 'node:inspector';
import test from 'node:test';
import vm from 'node:vm';

const parser = readFileSync(new URL('../src-tauri/src/modules/codex_input_unlock_gate.cjs', import.meta.url), 'utf8');
const moduleShim = { exports: {} as { locate: (source: string, url: string) => any; condition: (location: any) => string | null } };
vm.runInNewContext(parser, { module: moduleShim });
const gate = moduleShim.exports;
const atom = 'aA=Co($,({get:e})=>{let t=e(Auth),n=e(Usage).data;if(t.authMethod!==`chatgpt`||n.rate_limit?.allowed!==!1)return!1;return!0});';
const fixtures = {
  local: atom + 'function Composer(empty,upload){let nn=Q(aA)&&ht===`local`;let Mn=empty||upload||nn,Nn;return {submitDisabled:Mn};}',
  legacy: atom + 'function Composer(empty,upload){let nn=Q(aA)&&ht===`local`;let Mn;Mn=empty||upload||nn;return {submitDisabled:Mn};}',
  modern: atom + 'function Composer(){let quota=Q(aA)&&eligible;return {submitDisabled:disabled,rateLimitSendBlocked:conversation||quota,rateLimitConversationSendBlocked:conversation};}',
};
test('upstream locator recognizes three quota patterns without matching banner types', () => {
  for (const [mode, source] of Object.entries(fixtures)) {
    const found = gate.locate(source, 'app://-/assets/' + mode + '.js');
    assert.ok(found, mode);
    assert.ok(gate.condition(found)?.endsWith('false)'));
    assert.ok(!source.includes('workspace_member_credits_depleted'));
  }
});
test('ambiguous atom and unsafe variable names do not produce a patch', () => {
  assert.equal(gate.locate(fixtures.local + fixtures.local, 'app://-/ambiguous.js'), null);
  assert.equal(gate.locate('function Composer(){return {submitDisabled:true}}', 'app://-/unknown.js'), null);
  assert.equal(gate.condition({ mode: 'codex-local-quota', quotaVariable: 'nn);submit()' }), null);
});
test('real V8 conditional breakpoint clears only quota and restores on removal', async () => {
  const session = new Session();
  session.connect();
  const call = (method: string, params: any = {}): Promise<any> => new Promise((resolve, reject) => {
    (session.post as any)(method, params, (error: Error | null, result: unknown) => error ? reject(error) : resolve(result));
  });
  let scriptId: string | undefined;
  let paused = false;
  session.on('Debugger.paused', () => { paused = true; session.post('Debugger.resume'); });
  const url = 'app://-/assets/quota-probe.js';
  session.on('Debugger.scriptParsed', (event) => { if (event.params.url === url) scriptId = event.params.scriptId; });
  try {
    await call('Debugger.enable');
    const context = vm.createContext({
      $: {}, Auth: 'auth', Usage: 'usage', ht: 'local',
      Co: (_scope: unknown, fn: any) => fn({ get: (key: string) => key === 'auth'
        ? { authMethod: 'chatgpt' } : { data: { rate_limit: { allowed: false } } } }),
      Q: (value: unknown) => value,
    });
    new vm.Script(fixtures.local, { filename: url }).runInContext(context);
    assert.equal(vm.runInContext('Composer(false,false).submitDisabled', context), true);
    assert.ok(scriptId);
    const location = gate.locate(fixtures.local, url);
    const possible = await call('Debugger.getPossibleBreakpoints', {
      start: { scriptId, lineNumber: location.lineNumber, columnNumber: location.columnNumber },
      end: { scriptId, lineNumber: location.endLineNumber, columnNumber: location.endColumnNumber },
      restrictToFunction: true,
    });
    assert.ok(possible.locations.length);
    const armed = await call('Debugger.setBreakpoint', { location: possible.locations[0], condition: gate.condition(location) });
    assert.equal(vm.runInContext('Composer(false,false).submitDisabled', context), false);
    assert.equal(vm.runInContext('Composer(true,false).submitDisabled', context), true);
    assert.equal(vm.runInContext('Composer(false,true).submitDisabled', context), true);
    assert.equal(paused, false);
    await call('Debugger.removeBreakpoint', { breakpointId: armed.breakpointId });
    assert.equal(vm.runInContext('Composer(false,false).submitDisabled', context), true);
  } finally {
    await call('Debugger.disable');
    session.disconnect();
  }
});
