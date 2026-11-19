// Rspack duplicates factories in independent lazy routes. Keep the native
// selectors and submission pipeline, changing only their gates.
(() => {
  "use strict";
  const root = typeof window === "object" ? window : globalThis;
  const N = "[A-Za-z_$][\\w$]*";
  const fast = "globalThis.__cockpitNativeFast";
  const service = "globalThis.__cockpitServiceRspack";
  const composerChunks = [543778, 634303];
  const pattern = source => new RegExp(source, "g");
  const escape = value => value.replace(/\$/g, "\\$");
  function speedCandidates(reader, state) {
    const assets = state?.rspackSpeedAssets;
    if (!assets) throw Error("speed-assets-unavailable");
    if (assets.entryScripts.length !== reader.entryScripts.length ||
        !assets.entryScripts.every((name, index) => name === reader.entryScripts[index])) {
      throw Error("speed-assets-build-mismatch");
    }
    const ids = names => names.flatMap(name => {
      const id = name.split(".")[0];
      return reader.has(id) && reader.urlFor(id).endsWith("/" + name) ? [id] : [];
    });
    return {
      hosts: ids(assets.hosts),
      menus: ids(assets.menus),
      modelQueries: ids(assets.modelQueries),
    };
  }

  function transformChunk({ url, source }, transform) {
    const patched = transform(source);
    return patched === null ? null : { url, source: patched };
  }

  function compileSpeed(candidates, patch) {
    const hosts = candidates.hosts.flatMap(id => {
      const module = patch(id, speedQueue);
      return module ? [{ id, module }] : [];
    });
    if (hosts.length !== 1) throw Error("speed-host-contract");
    const menus = candidates.menus.map(id => patch(id, speedMenu)).filter(Boolean);
    if (!menus.length) throw Error("speed-menu-contract");
    return { host: hosts[0].id, modules: [hosts[0].module, ...menus] };
  }

  function one(source, re, reason, optional = false) {
    const matches = [...source.matchAll(re)];
    if (optional && matches.length === 0) return null;
    if (matches.length !== 1) throw Error(reason);
    return matches[0];
  }

  function edit(source, match, value) {
    return source.slice(0, match.index) + value + source.slice(match.index + match[0].length);
  }

  function speedMenu(source) {
    const match = one(source, pattern(String.raw`\b(?<host>${N})=${N}\?\.hostId\?\?${N},(?<account>${N})=\(0,${N}\.${N}\)\(\k<host>\),${N}=(?<native>\k<account>\?\.authMethod==="chatgpt"\|\|\k<account>\?\.authMethod==="personalAccessToken"\|\|\k<account>\?\.authMethod==="amazonBedrock")(?=,${N}=\k<account>\?\.authMethod\?\?null;[\s\S]{0,650}serviceTierAccess:)`), "speed-menu-contract", true);
    if (!match) return null;
    const { host, account, native } = match.groups;
    return edit(source, match, match[0].replace(native, () => `(${native}||${fast}.allow(${host},${account}?.authMethod))`));
  }

  function speedQueue(source) {
    const queued = one(source, pattern(String.raw`async\(\)=>\{if\("local"===(?<manager>${N})\.getHostId\(\)&&await ${N}\.isUsingCopilotInference\(\)\)return!1;let (?<account>${N})=await \k<manager>\.getAccount\(\{priority:"critical"\}\);return (?<native>\k<account>\.account\?\.type==="chatgpt"\|\|\k<account>\.account\?\.type==="amazonBedrock")(?=\}\)\},async writeServiceTier\()`), "speed-saved-request-contract", true);
    if (!queued) return null;
    const { manager, account, native } = queued.groups;
    source = edit(source, queued, queued[0].replace(native, () => `(${native}||${fast}.allow(${manager}.getHostId(),${account}.account?.type))`));

    const explicit = one(source, pattern(String.raw`let (?<options>${N})=${N}\.submissionOptions,[\s\S]{0,240}?(?<host>${N})=\k<options>\?\.executionHostId\?\?(?<manager>${N})\.getHostId\(\);[\s\S]{0,1700}?if\(null==\k<options>\.serviceTier\)return null;let\{account:(?<account>${N})\}=await \k<manager>\.getAccount\(\{priority:"critical"\}\);return (?<native>\k<account>\?\.type==="chatgpt"\|\|\k<account>\?\.type==="amazonBedrock")(?=\?\k<options>\.serviceTier:null\}\)\(\),)`), "speed-explicit-request-contract");
    const runtime = source.slice(explicit.index - 180, explicit.index)
      .match(new RegExp(String.raw`\{settings:${N},storage:${N},filesystem:${N},runtime:(${N})\}`))?.[1];
    if (!runtime) throw Error("speed-explicit-runtime-contract");
    const vars = explicit.groups;
    const allow = `${vars.host}==="local"&&!${vars.manager}.isCloudHost&&${fast}.allow(${vars.manager}.getHostId(),${vars.account}?.type)&&!await ${runtime}.isUsingCopilotInference()`;
    return edit(source, explicit, explicit[0].replace(vars.native, () => `(${vars.native}||${allow})`));
  }

  function wantsPredictions(state) {
    return state?.nativePredictions === true
      && (state.apiKeyAuthVerified === true || state.apiService === true);
  }

  async function verifyRequestedDocument() {
    const state = root.__cockpitEnhancements;
    const wantSpeed = state?.nativeFast === true;
    const wantPredictions = wantsPredictions(state);
    if (!wantSpeed && !wantPredictions) return { ok: false, reason: "disabled" };
    const entries = [...(root.document?.scripts ?? [])].map(script => script.src)
      .filter(url => /^app:\/\/-\/assets\/\d+\.[a-f0-9]+\.js$/.test(url));
    if (!entries.length || entries.length > 8) return { ok: false, reason: "unsupported-entry" };
    const read = async url => {
      const response = await root.fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw Error("asset-unavailable");
      const source = await response.text();
      if (source.length > 24 * 1024 * 1024) throw Error("source-limit");
      return source;
    };
    try {
      const roots = new Map(await Promise.all(entries.map(async url => [url, await read(url)])));
      const html = entries.map(url => '<script src="' + url + '"></script>').join("");
      const rspack = root.__cockpitPredictionRspack;
      const reader = rspack.chunkReader(html, url => roots.get(url));
      const verifySpeed = async () => {
        const candidates = speedCandidates(reader, state);
        await Promise.all([...new Set([...candidates.hosts, ...candidates.menus])].map(async id => {
          const url = reader.urlFor(id);
          roots.set(url, await read(url));
        }));
        compileSpeed(candidates, (id, transform) => transformChunk(reader(id), transform));
      };
      const verifyPredictions = async () => {
        await Promise.all(Object.entries(rspack.selectLayout(reader)).map(async ([kind, id]) => {
          const source = await read(reader.urlFor(id));
          const result = rspack.transform(source, kind, id);
          if (!result.ok) throw Error(result.reason);
        }));
      };
      const checks = [];
      if (wantPredictions) checks.push(verifyPredictions());
      if (wantSpeed) checks.push(verifySpeed());
      const outcomes = await Promise.allSettled(checks);
      if (outcomes.some(result => result.status === "fulfilled")) return { ok: true };
      return { ok: false, reason: outcomes[0].reason?.message || "rspack-contract-failed" };
    } catch (error) {
      return { ok: false, reason: error.message || "rspack-contract-failed" };
    }
  }

  function ultraReasoning(source) {
    const match = one(source, pattern(String.raw`authMethod:(?<host>${N}\.hostId)===${N}\.${N}\?(?<auth>${N}\.authMethod):null,[^;]{0,900}includeUltraReasoningEffort:(?<gate>\(0,${N}\.${N}\)\(${N},"1186680773"\)),isAuthLoading:[\s\S]{0,550}?isCustomModelProvider:(?<custom>\(0,${N}\.${N}\)\(${N}\)),workspaceDependenciesEnabled:`), "ultra-reasoning-contract");
    const { host, auth, gate, custom } = match.groups;
    return edit(source, match, match[0].replace(gate,
      () => `${fast}.includeUltra(${gate},${host},${auth},${custom},null)`));
  }

  function ultraModelQuery(source) {
    const match = one(source, pattern(String.raw`\{additionalAvailableModels:${N},authMethod:(?<auth>${N}),enabledReasoningEfforts:${N},hostId:(?<host>${N}),includeUltraReasoningEffort:(?<requested>${N})=!0,limit:${N}=100,specialty:${N},teamCatalog:(?<team>${N})\},\{get:(?<get>${N}),queryClient:${N},scope:${N}\}\)=>\{[^;]{1,1200}?(?<custom>${N})=\(0,${N}\.${N}\)\(${N}\),[^;]{1,1200}?(?<selected>${N})=(?<native>\k<requested>&&\k<get>\(${N}\.${N},"1186680773"\));(?=return\{queryKey:)`), "ultra-model-query-contract", true);
    if (!match) return null;
    const { auth, host, requested, team, custom, selected, native } = match.groups;
    if (!source.slice(match.index, match.index + 3500).includes(`includeUltraReasoningEffort:${selected},isCustomModelProvider:${custom}`))
      throw Error("ultra-model-selector-contract");
    return edit(source, match, match[0].replace(native,
      () => `${requested}&&${fast}.includeUltra(${native},${host},${auth},${custom},${team})`));
  }

  function quotaContract(source) {
    const guards = one(source, pattern(String.raw`,(?<reserve>${N})=\(0,(?<reader>${N})\._U\)\((?<limit>${N})\.F9,(?<host>${N})\),${N}=\(0,\k<reader>\._U\)\(${N}\.M,null==(?<thread>${N})\?null:\{hostId:\k<host>,threadId:\k<thread>\}\)`), "quota-reserve-contract");
    const { reserve, reader, limit, host, thread } = guards.groups;
    const prefix = source.slice(source.lastIndexOf("itX7(", guards.index), guards.index);
    const aliases = one(prefix, pattern(String.raw`(?<provider>${N})=${N}\("tl5a"\)[\s\S]{0,600}?\b${escape(limit)}=${N}\("eLmE"\)[\s\S]{0,220}?\b(?<usage>${N})=${N}\("a6kU"\)`), "quota-atoms-contract").groups;
    const props = one(prefix, pattern(String.raw`\{atMentionRankingContext:${N},[^}]{1,2200}useAsbDirect:${N},[^}]{1,2200}homeRunLocationRemoteProject:${N},[^}]{1,2200}selectedProject:${N},[^}]{1,300}\}=(?<props>${N}),`), "quota-props-contract").groups.props;
    const scope = one(prefix, pattern(String.raw`"local"===(?<scope>${N})\.value\.kind\?${N}\.k:${N}\.ComposerContent,${escape(host)}=`), "quota-scope-contract").groups.scope;
    const config = one(source, pattern(String.raw`let (?<settings>${N})=\(0,${N}\.Fc\)\(${N}\);(?=[\s\S]{0,8500}\k<settings>\.isConfigDataPending\?null:\k<settings>\.resolvedConfig)`), "quota-settings-contract");
    const usage = one(source, pattern(String.raw`,(?<blocked>${N})=\(0,${escape(reader)}\.Ul\)\("local"===${escape(host)}&&${escape(aliases.usage)}\.U\)`), "quota-usage-contract").groups.blocked;
    const R = escape(reserve), U = escape(usage);
    // macOS names the reasons, while Windows keeps them in a boolean chain.
    const mac = source.includes('&&"reserve-limit"');
    const gate = mac
      ? one(source, pattern(String.raw`${R}&&"reserve-limit",(?<label>${N})=${U}&&"usage-limit"`), "quota-mac-submit-contract")
      : one(source, pattern(String.raw`(?<=\.isLoading===!0)\|\|${R}\|\|${U};`), "quota-windows-submit-contract");
    return { reserve, usage, reader, host, thread, provider: aliases.provider, props, scope, config, gate, mac };
  }

  function quotaComposer(source) {
    const { reserve, usage, reader, host, thread, provider, props, scope, config, gate, mac } = quotaContract(source);
    const check = `${service}.quotaRoute(${host},${config.groups.settings},__cockpitThreadProvider,${props},${scope})`;
    source = edit(source, gate, mac
      ? `${reserve}&&!${check}&&"reserve-limit",${gate.groups.label}=${usage}&&!${check}&&"usage-limit"`
      : `||((${reserve}||${usage})&&!${check});`);
    return edit(source, config, config[0].slice(0, -1) + `,__cockpitThreadProvider=(0,${reader}._U)(${provider}.jR,${thread});`);
  }

  function bannerScope(source, original) {
    const { host, props, scope, config } = quotaContract(original);
    const render = one(source, pattern(String.raw`(?<result>${N})=\(0,(?<jsx>${N})\.jsxs\)\("div",\{className:${N},"data-codex-composer-root":"","data-composer-placement":`), "quota-banner-root-contract");
    const last = one(source, pattern(String.raw`,${escape(render.groups.result)}(?=\}function ${N}\(${N}\)\{return"plan-mode"===${N}\.id\})`), "quota-banner-return-contract");
    const before = source.slice(source.lastIndexOf("itX7(", render.index), render.index);
    const react = new RegExp(String.raw`(?:^|,)(${N})=${N}\("zd8w"\)`).exec(before)?.[1];
    if (!react) throw Error("quota-banner-react-contract");
    const settings = config.groups.settings;
    const check = `${service}.quotaRoute(${host},${settings},__cockpitThreadProvider,${props},${scope})`;
    return edit(source, last, `,globalThis.__cockpitQuotaCompat.wrapCurrentComposer(${react},${render.groups.jsx}.jsx,${host},${settings},__cockpitThreadProvider,${check},${render.groups.result})`);
  }

  function quotaBanner(source) {
    const context = one(source, pattern(String.raw`\{canShowUsageBanners:(?<show>${N}),hostId:${N},imageGenerationLimit:(?<image>${N}),onDismissImageGenerationLimit:[^}]{1,600}\}=${N},(?<host>${N})=[^;]{1,600}?\(0,(?<react>${N})\.useRef\)\(null\);`), "quota-banner-props-contract");
    const { host, react, image } = context.groups;
    const gate = one(source, pattern(String.raw`(?<banner>${N})=(?<usage>${N})\?\.rate_limit_upsell;(?=if\(null!=\k<usage>&&null!=\k<banner>&&)`), "quota-banner-usage-contract");
    const { banner, usage } = gate.groups;
    const api = "globalThis.__cockpitQuotaCompat";
    const modelNotice = `${usage}?.rate_limit_upsell?.model_slug!=null||${usage}?.rate_limit_upsell?.blocked_model_slug!=null`;
    const patched = edit(source, gate, `${banner}=(${usage}=${api}.originalUsage(${usage}),!(${modelNotice})&&${api}.shouldHideCurrentBanner(__cockpitBannerScope,${host},${usage},${image})?null:${usage}?.rate_limit_upsell);`);
    return edit(patched, context, context[0] + `const __cockpitBannerScope=${api}.useBannerScope(${react});`);
  }

  function liveLocation(source, url) {
    const { reserve, usage, host, thread, provider, props, scope, config, gate } = quotaContract(source);
    const start = source.lastIndexOf("let ", gate.index);
    if (start < config.index + config[0].length || /;/.test(source.slice(start, gate.index)))
      throw Error("quota-live-statement-contract");
    const before = source.slice(0, start);
    return { url, lineNumber: before.split("\n").length - 1, columnNumber: start - before.lastIndexOf("\n") - 1,
      hardVariable: reserve, guardVariable: usage, host, thread, provider, props, scope, settings: config.groups.settings };
  }

  async function prepareLiveQuotaGate() {
    const entries = [...(root.document?.scripts ?? [])].map(script => script.src)
      .filter(url => /^app:\/\/-\/assets\/\d+\.[a-f0-9]+\.js$/.test(url));
    if (!entries.length) return null;
    if (entries.length > 8) return { ok: false, reason: "quota-location-invalid" };
    const read = async url => {
      const response = await root.fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw Error("quota-location-failed");
      return response.text();
    };
    try {
      const roots = new Map(await Promise.all(entries.map(async url => [url, await read(url)])));
      const reader = root.__cockpitPredictionRspack.chunkReader(
        entries.map(url => '<script src="' + url + '"></script>').join(""), url => roots.get(url));
      const plans = await Promise.all(composerChunks.map(async id => {
        const url = reader.urlFor(id);
        const source = await read(url);
        if (source.length > 24 * 1024 * 1024 || !source.includes(`export const __rspack_esm_ids=[${id}];`))
          throw Error("quota-location-invalid");
        return liveLocation(source, url);
      }));
      return { ok: true, rspackPlans: plans };
    } catch (error) {
      return { ok: false, reason: error.message || "quota-location-failed" };
    }
  }

  function quotaRoute(host, settings, threadProvider, props, scope) {
    const config = settings?.resolvedConfig;
    const id = threadProvider ?? config?.model_provider;
    if (root.__cockpitEnhancements?.apiService !== true || id !== "codex_local_access"
      || !root.__cockpitQuotaCompat.enabledForComposer(host, settings, threadProvider, props, scope)) return false;
    const provider = config?.model_providers?.[id];
    if (!provider?.experimental_bearer_token?.trim().startsWith("agt_codex_")) return false;
    try {
      const url = new URL(provider.base_url);
      // The gateway owns Key ACLs and can inspect the actual request for
      // a safe continuation before making any upstream attempt.
      return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)
        && url.pathname === "/v1";
    } catch { return false; }
  }

  function preload(html, read) {
    const state = root.__cockpitEnhancements;
    const rspack = root.__cockpitPredictionRspack;
    const reader = rspack.chunkReader(html, read);
    if (!reader) return null;
    const chunks = new Map();
    const readChunk = id => {
      if (!chunks.has(id)) chunks.set(id, reader(id));
      return chunks.get(id);
    };
    readChunk.has = reader.has;
    const wantSpeed = state?.nativeFast === true;
    const wantQuota = state?.apiService === true;
    const wantPredictions = wantsPredictions(state);
    const modules = new Map();
    const prepare = (enabled, build) => {
      if (!enabled) return { ok: false, reason: "disabled" };
      try {
        const batch = build();
        for (const module of batch) modules.set(module.url, module);
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: error.message };
      }
    };
    const patch = (id, transform) => {
      const chunk = readChunk(id);
      return transformChunk(modules.get(chunk.url) ?? chunk, transform);
    };
    let candidates, host;
    const speed = prepare(wantSpeed, () => {
      candidates = speedCandidates(reader, state);
      const compiled = compileSpeed(candidates, patch);
      host = compiled.host;
      return compiled.modules;
    });
    const ultra = prepare(speed.ok, () => {
      const queries = candidates.modelQueries.map(id => patch(id, ultraModelQuery)).filter(Boolean);
      if (!queries.length) throw Error("ultra-model-query-contract");
      return [patch(host, ultraReasoning), ...queries];
    });
    const quota = prepare(wantQuota, () => composerChunks.map(id => patch(id, quotaComposer)));
    const banners = prepare(quota.ok, () => [
      patch(39017, quotaBanner),
      ...composerChunks.map(id => patch(id, source => bannerScope(source, readChunk(id).source))),
    ]);
    const predictions = prepare(wantPredictions, () => {
      const readWithPreparedModules = id => {
        const chunk = readChunk(id);
        return modules.get(chunk.url) ?? chunk;
      };
      readWithPreparedModules.has = readChunk.has;
      const result = rspack.prepare(html, read, readWithPreparedModules);
      if (!result.ok) throw Error(result.reason);
      return result.modules;
    });
    // Validate and install every lazy route, then require this document's
    // actual composer chain and raw-usage presenter to evaluate. The alternate
    // lazy composer is not required to execute in the same document.
    const quotaUrls = new Set(wantQuota && quota.ok && banners.ok
      ? [39017, ...composerChunks].map(id => readChunk(id).url) : []);
    const evaluated = new Set();
    const bannerUrl = quotaUrls.size === 3 ? readChunk(39017).url : null;
    const token = String(state?.owner ?? '') + ':' + modules.size;
    let installed = false;
    root.__cockpitServiceRspackModuleEvaluated = (receipt, url) => {
      if (!installed || receipt !== token || !modules.has(url)) return;
      evaluated.add(url);
      const routes = [...quotaUrls].filter(url => url !== bannerUrl && evaluated.has(url));
      if (quotaUrls.size !== 3 || !evaluated.has(bannerUrl) || !routes.length) return;
      root.__cockpitNativeEvaluatedGraph = Object.freeze({
        version: 1, mode: 'rspack', quota: true, fast: speed.ok, routes: Object.freeze(routes),
      });
      const current = root.__cockpitEnhancements;
      if (current?.apiService === true && (current.nativeFast !== true || speed.ok)) {
        const features = [current.nativeFast, current.quotaCompat,
          current.apiKeyAuthVerified, current.apiService].map(Number).join('')
          + (current.nativePredictions ? '1' : '');
        current.nativePatchState = 'active';
        current.nativePatchMode = 'rspack';
        current.nativePatchFeatures = features;
        current.nativePatchRequestedFeatures = features;
        current.nativeQuotaPatchState = 'active';
        current.nativeQuotaPatchReason = undefined;
      }
    };
    const preparedModules = [...modules.values()].map(module => ({ ...module,
      source: module.source + `\n;globalThis.__cockpitServiceRspackModuleEvaluated?.(${JSON.stringify(token)},${JSON.stringify(module.url)});`,
    }));
    const ok = rspack.installModules(preparedModules,
      () => root.__cockpitNativePredictions?.runtime.dispose(), url => {
        if (!quotaUrls.has(url)) return;
        quotaUrls.clear();
        delete root.__cockpitNativeEvaluatedGraph;
        root.__cockpitQuotaCompat?.disposeLiveQuotaGuard?.();
        if (root.__cockpitEnhancements?.apiService === true) {
          root.__cockpitEnhancements.nativeQuotaPatchState = 'unsupported';
          root.__cockpitEnhancements.nativeQuotaPatchReason = 'rspack-module-preload-failed';
        }
      });
    installed = ok;
    const reason = ok ? "rspack-contracts-installed"
      : modules.size ? "rspack-install-failed"
      : [speed, quota, predictions].find(result => result.reason && result.reason !== "disabled")?.reason ?? "rspack-contracts-disabled";
    const mask = [wantSpeed, state?.quotaCompat, state?.apiKeyAuthVerified, state?.apiService]
      .map(value => value === true ? "1" : "0").join("") + (state?.nativePredictions ? "1" : "");
    if (state) {
      root.__cockpitNativePredictions?.setReady(ok && predictions.ok);
      Object.assign(state, {
        nativePatchState: ok ? "active" : "unsupported",
        nativePatchMode: "rspack",
        nativePatchReason: reason,
        nativePatchFeatures: mask,
        nativePatchRequestedFeatures: mask,
        nativeQuotaPatchState: wantQuota ? ok && quota.ok && banners.ok ? "pending" : "unsupported" : "disabled",
        nativeQuotaPatchReason: quota.reason ?? banners.reason ?? (ok ? undefined : "rspack-install-failed"),
        nativePredictionPatchState: wantPredictions ? ok && predictions.ok ? "ready" : "unsupported" : "disabled",
        nativePredictionPatchReason: predictions.reason ?? (ok ? undefined : "rspack-install-failed"),
      });
    }
    return { ok, reason, mode: "rspack", speed, ultra, quota, banners, predictions };
  }

  root.__cockpitServiceRspack = { preload, verifyRequestedDocument, quotaRoute, prepareLiveQuotaGate, liveLocation };
})();
