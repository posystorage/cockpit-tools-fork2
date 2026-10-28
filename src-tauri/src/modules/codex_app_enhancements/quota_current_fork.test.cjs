const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { parse } = require('@babel/parser');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Small independent contracts exercise the current three-module layout even
// when the installed desktop artifact used by upstream tests is unavailable.
const initialUrl = 'app://-/assets/app-initial-current.js';
const primaryUrl = 'app://-/assets/app-primary-current.js';
const adapterUrl = 'app://-/assets/codex-composer-adapter-current.js';
const initial = `
var family,hardSelector,threadProvider;
function initialize(){family=familyAtom(store,(host,{get:read})=>{let usage=read(status).data;
let identity=read(account);if(usage.user_id!==identity.userId||usage.account_id!==identity.authenticatedAccountId)return{hardBlocked:false};
return{hardBlocked:usage.rate_limit?.allowed===!1}}),hardSelector=familyAtom(store,(host,{get:read})=>read(family,host).hardBlocked);
threadProvider=atom(({summary:item})=>item.modelProvider||null)}
const dependencies=['./app-primary-current.js','./codex-composer-adapter-current.js','./composer-content-current.js'];
export{hardSelector as reserveExport,threadProvider as providerExport};`;
const primary = `
import{reserveExport as reserveAtom}from"./app-initial-current.js";
var quotaGuard=atom(store,({get:read})=>{let account=read(identity),usage=read(status).data;if(account.authMethod!==\`chatgpt\`||account.authLoading||account.accountLoading||account.authenticatedAccountId==null||usage.user_id!==account.userId||usage.plan_type==null||usage.rate_limit?.allowed!==!1)return!1;
let windows=usageWindows(usage).filter(({remainingPercent:p})=>p===0);return windows.every(({windowMinutes:w,resetsAt:r})=>w>0&&r>0)});
function SharedUsage(props){let memo=0,{banner:banner,fallbackContent:fallback,lastImpressionKeyRef:ref,onDismiss:dismiss,onShown:shown,onOwnerRequestComplete:owner,presentationKey:key,rateLimitStatus:usage,renderContent:render}=props;
let nativeRef=(0,React.useRef)(null);let special=banner.banner_type===\`luna_reserve\`||banner.banner_type===\`image_generation_limit_reached\`;
return usage.rate_limit.allowed?fallback:(0,JSX.jsx)("aside",{children:"native notice",fallbackContent:fallback})}
function UsageBanner(props){let memo=0,{canShowUsageBanners:enabled,hostId:hostProp,imageGenerationLimit:image,onDismissImageGenerationLimit:dismiss,rateLimit:usage,rateLimitWarningThreshold:threshold,lowerPriorityContent:fallback,selectedModel:model,sendBlocked:blocked}=props;
let host=hostProp===void 0?\`local\`:hostProp,ref=(0,React.useRef)(null),nativeNotice=useFamily(nativeNoticeAtom,host);if(!enabled)return fallback;
let imageType=usage?.rate_limit_upsell?.banner_type===\`image_generation_limit_reached\`;
return usage.rate_limit.allowed?fallback:(0,JSX.jsx)("aside",{children:"native notice",rateLimitStatus:usage,sendBlocked:blocked,imageType})}
export{quotaGuard as genericExport};`;
const adapter = `
import{reserveExport as reserveAtom}from"./app-initial-current.js";
import{genericExport as quotaGuard}from"./app-primary-current.js";
function Composer(props){let{onSubmitLocal:send,submitDisabled:other,useAsbDirect:direct,selectedProject:project}=props;
let scope=readScope(),isNew=scope.value.kind===\`new\`,ref=(0,React.useRef)(null);
let threadId=props.threadId,host=useFamily(hostAtom,threadId),reserve=useFamily(reserveAtom,host);
let settings=props.settings,saved=settings.isConfigDataPending?null:settings.resolvedConfig;
let generic=useValue(host===\`local\`&&quotaGuard);
let disabled=other||reserve||generic,next;
return (0,JSX.jsx)("composer",{submitDisabled:disabled,onSubmitLocal:send,saved})}`;
const settings = () => ({ isConfigDataPending: false, resolvedConfig: {
  model_provider: 'relay', model_providers: { relay: { requires_openai_auth: false,
    experimental_bearer_token: 'fixture-key', base_url: 'http://127.0.0.1:58554/v1' } },
} });
function harness({ compat = false, hide = false } = {}) {
  const raw = { rate_limit: { allowed: false, limit_reached: true, primary_window: { used_percent: 100 } },
    rate_limit_upsell: { banner_type: 'pro_rate_limit_reached' }, credits: { balance: 0 },
    spend_control: { limit_reached: true }, additional_rate_limits: [{ limit_name: 'image', rate_limit: { allowed: false } }] };
  const query = { queryKey: ['rate-limit-status'], state: { data: raw } };
  const image = { queryKey: ['rate-limit-status', 'image-generation'], state: { data: raw } };
  let subscriber = null, unsubscribed = 0;
  const client = { getQueryCache: () => ({ findAll: () => [query, image],
    subscribe(fn) { subscriber = fn; return () => { subscriber = null; unsubscribed++; }; } }),
    setQueryData(key, next) { const target = key[1] === 'image-generation' ? image : query;
      target.state.data = typeof next === 'function' ? next(target.state.data) : next; } };
  const setter = client.setQueryData;
  const root = { URL, module: { exports: {} }, setTimeout: () => 1, clearTimeout() {},
    __cockpitEnhancements: { apiService: true, quotaCompat: compat, apiKeyAuthVerified: false,
      nativeFast: false, nativePatchState: 'active', nativePatchMode: 'full',
      nativePatchFeatures: `0${Number(compat)}01`, nativePatchRequestedFeatures: `0${Number(compat)}01` },
    __cockpitNativeQuotaSuppression: hide ? {} : undefined,
    document: { getElementById: () => ({ __reactFiber$test: { memoizedProps: { client } } }), querySelectorAll: () => [] } };
  root.window = root; root.globalThis = root;
  for (const name of ['fast', 'quota', 'quota_current'])
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, `${name}.js`), 'utf8'), root);
  const api = root.__cockpitQuotaCompat;
  const i = api.transform(initial, initialUrl);
  assert.equal(i.ok, true, JSON.stringify(i.diagnostics));
  assert.equal(i.diagnostics.bindings.layout, 'adapter-v1');
  const p = api.transformComposer(primary, primaryUrl, initialUrl, i.diagnostics.bindings);
  assert.equal(p.ok, true, JSON.stringify(p.diagnostics));
  const a = api.transformAdapter(adapter, adapterUrl, initialUrl, primaryUrl, p.diagnostics.bindings);
  assert.equal(a.ok, true, JSON.stringify(a.diagnostics));
  for (const result of [i, p, a]) parse(result.patchedSource, { sourceType: 'module' });
  const values = { provider: 'relay', host: 'local', generic: true, reserve: true,
    scope: { value: { kind: 'local', conversationId: 'test-thread' } } };
  let shared = false;
  Object.assign(root, { React, JSX: { jsx(type, props) {
    if (type === 'composer') return React.createElement('main', { 'data-disabled': props.submitDisabled },
      shared ? React.createElement(root.SharedUsage, { banner: query.state.data.rate_limit_upsell,
        rateLimitStatus: query.state.data, fallbackContent: React.createElement('p', null, 'safety') })
        : React.createElement(root.UsageBanner, { canShowUsageBanners: true, hostId: values.host,
          rateLimit: query.state.data, lowerPriorityContent: React.createElement('p', null, 'safety') }));
    if (typeof type !== 'string') return React.createElement(type, props);
    // Drop diagnostic-only fixture props from actual DOM elements.
    return React.createElement(type, null, props.children);
  } }, store: {}, identity: {}, status: {}, atom: () => ({}), reserveAtom: 'reserve', hostAtom: 'host',
  __cockpitQuotaProviderAtom: 'provider', nativeNoticeAtom: 'notice',
  readScope: () => values.scope, useValue: () => values.generic,
  useFamily: atom => values[atom] });
  const withoutEdges = value => value.replace(/^import[^;]+;/gm, '').replace(/^export\{[^}]+\};/gm, '');
  vm.runInNewContext(withoutEdges(p.patchedSource), root);
  vm.runInNewContext(withoutEdges(a.patchedSource), root);
  return { root, api, i, p, a, raw, query, image, client, setter, values,
    render(props = {}, useShared = false) { shared = useShared; return renderToStaticMarkup(React.createElement(root.Composer, { settings: settings(), ...props })); },
    update(value) { query.state.data = value; subscriber?.({ query }); },
    unsubscribed: () => unsubscribed };
}

test('adapter-v1 keeps send, hide and cache independent for all four preference combinations', () => {
  for (const compat of [false, true]) for (const hide of [false, true]) {
    const h = harness({ compat, hide }), state = JSON.stringify(h.root.__cockpitEnhancements);
    assert.equal(h.api.installLiveQuotaGuard({}).preservedNativeModule, true);
    assert.equal(JSON.stringify(h.root.__cockpitEnhancements), state, 'cache installation preserves the complete graph state');
    assert.equal(h.query.state.data.rate_limit.allowed, compat);
    assert.equal(h.query.state.data.rate_limit.limit_reached, !compat);
    for (const key of ['credits', 'spend_control', 'additional_rate_limits']) assert.equal(h.query.state.data[key], h.raw[key]);
    assert.equal(h.query.state.data.rate_limit.primary_window, h.raw.rate_limit.primary_window);
    assert.equal(h.image.state.data, h.raw);
    for (const shared of [false, true]) {
      const output = h.render({}, shared);
      assert.match(output, /data-disabled="false"/, 'sending is enabled without Fast credential verification or cache compatibility');
      assert.equal(output.includes('native notice'), !hide, `both native presenters use the original exhausted snapshot: compat=${compat}, hide=${hide}, shared=${shared}; ${output}`);
      if (hide) assert.match(output, /safety/);
    }
    assert.match(h.render({ submitDisabled: true }), /data-disabled="true"/, 'other submit predicates stay native');
    h.api.disposeLiveQuotaGuard();
    assert.equal(h.client.setQueryData, h.setter);
    assert.equal(h.query.state.data, h.raw);
    assert.equal(h.unsubscribed(), Number(compat));
  }
});

test('current automatic send preserves official, remote, cloud, direct, pending and missing-provider gates', () => {
  const h = harness();
  for (const props of [{ useAsbDirect: true }, { selectedProject: { type: 'remote' } },
    { homeRunLocationRemoteProject: {} }, { settings: { ...settings(), isConfigDataPending: true } }])
    assert.match(h.render(props), /data-disabled="true"/);
  for (const [key, value] of [['provider', 'openai'], ['provider', null], ['host', 'remote'],
    ['scope', { value: { kind: 'cloud' } }], ['scope', { value: { kind: 'new', cloudThreadPrototype: {} } }]]) {
    const old = h.values[key]; h.values[key] = value;
    assert.match(h.render(), /data-disabled="true"/); h.values[key] = old;
  }
  const mixed = settings(); mixed.resolvedConfig.model_providers.relay.requires_openai_auth = true;
  assert.match(h.render({ settings: mixed }), /data-disabled="false"/, 'mixed API routes also send without cache opt-in');
});

test('complete current graph survives owner and cache preference changes and restores latest server data', () => {
  const h = harness(), rust = fs.readFileSync(path.join(__dirname, 'fast.rs'), 'utf8');
  const script = rust.match(/const STATE_SCRIPT: &str = r#"([\s\S]*?)"#;/)[1];
  h.root.__cockpitNativeEvaluatedGraph = Object.freeze({ version: 1, quota: true, fast: false });
  h.root.__cockpitEnhancements.apiService = false; // old worker cleanup
  const configure = compat => vm.runInNewContext(script.replace('__COCKPIT_STATE_OPTIONS__', JSON.stringify({
    nativeFast: false, quotaCompat: compat, apiKeyAuthVerified: false, apiService: true, owner: `worker-${compat}` })), h.root);
  configure(true);
  assert.equal(h.root.__cockpitEnhancements.nativePatchState, 'active');
  h.api.installLiveQuotaGuard({});
  const fresh = { ...h.raw, rate_limit: { ...h.raw.rate_limit, primary_window: { used_percent: 95 } } };
  h.update(fresh);
  assert.equal(h.query.state.data.rate_limit.allowed, true);
  assert.match(h.render(), /native notice/);
  h.api.disposeLiveQuotaGuard(); configure(false); h.api.installLiveQuotaGuard({});
  assert.equal(h.query.state.data, fresh);
  assert.equal(h.client.setQueryData, h.setter);
  assert.match(h.render(), /data-disabled="false"/);
  assert.match(h.render(), /native notice/);
  h.values.provider = 'openai'; h.root.__cockpitNativeQuotaSuppression = {};
  assert.match(h.render(), /data-disabled="true"/, 'the evaluated graph does not grant an official thread send authorization');
  assert.match(h.render(), /native notice/, 'the evaluated graph does not grant an official presenter scope');
  h.root.__cockpitNativeEvaluatedGraph = { version: 1, quota: false, fast: true };
  h.root.__cockpitEnhancements.nativePatchState = 'unsupported'; configure(true);
  assert.equal(h.root.__cockpitEnhancements.nativePatchState, 'pending', 'a Fast-only/partial graph cannot authorize cache adaptation');
});

test('current evaluated-graph receipt is published only after all modules and never inherited by a new document', async () => {
  const h = harness(), nodes = [], blobs = [], root = h.root;
  const files = new Map([[initialUrl, initial], [primaryUrl, primary], [adapterUrl, adapter],
    ['app://-/assets/index-current.js', `import './app-initial-current.js';`]]);
  root.document.scripts = [{ src: 'app://-/assets/index-current.js' }];
  root.fetch = async url => ({ ok: files.has(url), text: async () => files.get(url) });
  Object.assign(root, { AbortSignal, Blob, HTMLScriptElement: { supports: () => true },
    URL: class extends URL {
      static createObjectURL(blob) { blobs.push(blob); return `blob:current-${blobs.length}`; }
      static revokeObjectURL() {}
    } });
  Object.assign(root.document, {
    createElement(tag) { const node = { tag, relList: { supports: () => true }, appendChild(child) { nodes.push(child); } }; return node; },
    appendChild(node) { node.parentNode = this; this.documentElement = node; },
    removeChild(node) { node.parentNode = null; this.documentElement = null; },
    addEventListener() {}, removeEventListener() {},
  });
  const result = await root.__cockpitNativeFast.prepareDocument();
  assert.equal(result.ok, true, result.reason); assert.equal(result.mode, 'full'); assert.equal(result.modules.length, 2);
  assert.equal(root.__cockpitNativeFast.installModule(result.patchedSource, result.url, result.modules, result.mode).ok, true);
  root.__cockpitNativeFastComplete(); root.__cockpitNativeFastComplete('quota-primary');
  assert.equal(root.__cockpitNativeEvaluatedGraph, undefined);
  root.__cockpitNativeFastComplete('quota');
  assert.deepEqual(JSON.parse(JSON.stringify(root.__cockpitNativeEvaluatedGraph)), { version: 1, quota: true, fast: false });
  root.__cockpitNativeFastDispose();
  assert.equal(root.__cockpitNativeEvaluatedGraph.quota, true, 'cleanup preserves evaluated code while revoking runtime policy');
  const next = harness();
  assert.equal(next.root.__cockpitNativeEvaluatedGraph, undefined, 'new document has no inherited graph receipt');
  const rust = fs.readFileSync(path.join(__dirname, 'fast.rs'), 'utf8');
  const script = rust.match(/const STATE_SCRIPT: &str = r#"([\s\S]*?)"#;/)[1];
  next.root.__cockpitEnhancements.nativePatchState = 'unsupported';
  vm.runInNewContext(script.replace('__COCKPIT_STATE_OPTIONS__', JSON.stringify({
    nativeFast: false, quotaCompat: true, apiKeyAuthVerified: false, apiService: true, owner: 'new-document' })), next.root);
  assert.equal(next.root.__cockpitEnhancements.nativePatchState, 'pending');
});

test('hide preference changes notify mounted current composers without replacing their context', () => {
  const h = harness(); h.render();
  const refreshers = h.api.getComposerRefreshers(), context = h.api.getBannerContext();
  assert.ok(context);
  let refreshed = 0; refreshers.add(() => { refreshed++; });
  h.api.refreshCurrentComposers(); assert.equal(refreshed, 1);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'quota.js'), 'utf8'), h.root);
  assert.equal(h.root.__cockpitQuotaCompat.getComposerRefreshers(), refreshers);
  assert.equal(h.root.__cockpitQuotaCompat.getBannerContext(), context);
  h.root.__cockpitQuotaCompat.refreshCurrentComposers(); assert.equal(refreshed, 2);
  Object.assign(h.root, { setInterval: () => 1, clearInterval() {} });
  const suppression = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'codex_native_quota_banner.js'), 'utf8'), h.root);
  suppression(true, false, 'preference-test');
  assert.equal(refreshed, 3, 'enabling the hide preference refreshes source presenters');
  suppression(false, false, 'preference-test');
  assert.equal(refreshed, 4, 'disabling the hide preference restores source presenters');
  assert.equal(h.root.__cockpitNativeQuotaSuppression, undefined);
});

test('already opened current adapter requires restart without breakpoints, cache changes or navigation', async () => {
  const h = harness(), files = new Map([[initialUrl, initial], [primaryUrl, primary], [adapterUrl, adapter],
    ['app://-/assets/index-current.js', `import './app-initial-current.js';`]]);
  h.root.document.scripts = [{ src: 'app://-/assets/index-current.js' }];
  h.root.fetch = async url => ({ ok: files.has(url), text: async () => files.get(url) });
  const result = await h.api.prepareLiveQuotaGate();
  assert.equal(result.ok, false); assert.equal(result.reason, 'quota-restart-required');
  assert.equal(h.query.state.data, h.raw); assert.equal(h.client.setQueryData, h.setter);
});
