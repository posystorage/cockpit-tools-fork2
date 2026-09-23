// Evaluated by the existing per-profile CDP loop. Intentionally NOT registered
// as a new-document script: a stale launch option must never survive a reload.
((enabled, apiServiceSendOverride, session) => {
  const KEY = '__cockpitNativeQuotaSuppression';
  const ROOT = '[data-codex-composer-root][data-composer-placement]';
  const MARK = 'data-cockpit-native-banner-hidden';
  const TYPES = new Set(['workspace_member_credits_depleted']);
  const QUERY_KEY = 'rate-limit-status';
  const VERSION = 2;
  const previous = window[KEY];
  if (!enabled) {
    if (previous?.session === session) previous.destroy();
    return;
  }
  if (previous?.version === VERSION && previous.session === session) {
    previous.heartbeatAt = Date.now();
    previous.setSendOverride(apiServiceSendOverride);
    previous.scan();
    return;
  }
  previous?.destroy();

  const observers = new Map();
  const originalDisplay = new Map();
  const queryPatches = new Map();
  let frame = null;
  let destroyed = false;
  let sendOverrideEnabled = apiServiceSendOverride;
  let watchdog;

  function getFiber(element) {
    const key = Object.keys(element).find(name =>
      name.startsWith('__reactFiber$') || name.startsWith('__reactInternalInstance$'));
    const fiber = key ? element[key] : null;
    if (!fiber) return null;
    // React may keep the DOM pointer on the alternate from the previous commit.
    let top = fiber;
    for (let depth = 0; top.return && depth < 128; depth++) top = top.return;
    if (top.return) return null;
    const current = top.stateNode?.current;
    return current && current !== top ? fiber.alternate ?? null : fiber;
  }

  function ownsOnlyThisAside(fiber, aside) {
    const pending = fiber.child ? [fiber.child] : [];
    const seen = new Set();
    while (pending.length) {
      const node = pending.pop();
      if (seen.has(node) || seen.size >= 256) return false;
      seen.add(node);
      if (node.stateNode?.tagName === 'ASIDE' && node.stateNode !== aside) return false;
      if (node.child) pending.push(node.child);
      if (node.sibling) pending.push(node.sibling);
    }
    return true;
  }

  function identity(aside) {
    try {
      let fiber = getFiber(aside);
      const seen = new Set();
      for (let depth = 0; fiber && depth < 24; depth++, fiber = fiber.return) {
        if (seen.has(fiber)) return null;
        seen.add(fiber);
        // Never inherit UsageBanner state from a shared composer/stack DOM parent.
        const node = fiber.stateNode;
        if (node?.nodeType === 1 && node !== aside && !aside.contains(node)) return null;
        if (!ownsOnlyThisAside(fiber, aside)) return null;
        const p = fiber.memoizedProps;
        if (!p || typeof p !== 'object') continue;
        const types = [
          p.banner?.banner_type,
          p.rateLimitStatus?.rate_limit_upsell?.banner_type,
          p.usageBannerProps?.rateLimit?.rate_limit_upsell?.banner_type,
        ].filter(type => typeof type === 'string');
        if (types.length) return types.every(type => type === types[0]) ? types[0] : null;
      }
    } catch {
      // React internals are not a public contract. An unreadable identity stays visible.
    }
    return null;
  }

  function isQueryClient(value) {
    return value != null
      && typeof value === 'object'
      && typeof value.getQueryCache === 'function'
      && typeof value.getQueryData === 'function'
      && typeof value.setQueryData === 'function';
  }

  function collectQueryClients(element, clients) {
    try {
      let fiber = getFiber(element);
      const seenFibers = new Set();
      for (let depth = 0; fiber && depth < 256; depth++, fiber = fiber.return) {
        if (seenFibers.has(fiber)) return;
        seenFibers.add(fiber);
        const props = fiber.memoizedProps;
        const candidates = [
          props?.value,
          props?.client,
          props?.value?.queryClient,
          props?.client?.queryClient,
          fiber.stateNode?.queryClient,
        ];
        for (const candidate of candidates) {
          if (isQueryClient(candidate)) clients.add(candidate);
        }
      }
    } catch {
      // Query cache discovery is optional. An unknown React tree stays untouched.
    }
  }

  function isRateLimitQueryKey(key) {
    return Array.isArray(key) && key.some(part => part === QUERY_KEY);
  }

  function hasExactQuotaReason(data) {
    if (data == null || typeof data !== 'object') return false;
    const reasons = [
      data.rate_limit_reached_type?.type,
      data.rate_limit_upsell?.banner_type,
    ].filter(reason => typeof reason === 'string');
    return reasons.length > 0 && reasons.every(reason => TYPES.has(reason));
  }

  function restoreQueryPatch(query, patch) {
    try {
      if (patch.client.getQueryData(query.queryKey) === patch.patched) {
        patch.client.setQueryData(query.queryKey, patch.original);
      }
    } catch {
      // A replaced/removed query needs no restoration.
    }
    queryPatches.delete(query);
  }

  function hasAppliedSendOverride(data, original) {
    return data != null
      && typeof data === 'object'
      && data !== original
      && data.rate_limit_reached_type == null
      && (original.rate_limit_upsell?.banner_type !== 'workspace_member_credits_depleted'
        || data.rate_limit_upsell == null)
      && data.rate_limit?.allowed === true
      && data.rate_limit?.limit_reached === false
      && (original.credits == null
        || (data.credits?.has_credits === true
          && data.credits?.overage_limit_reached === false))
      && (original.spend_control == null || data.spend_control?.reached === false);
  }

  function reconcileSendOverride(clients) {
    const seenQueries = new Set();
    if (sendOverrideEnabled) {
      for (const client of clients) {
        let queries = [];
        try {
          queries = client.getQueryCache().getAll();
        } catch {
          continue;
        }
        for (const query of queries) {
          if (!isRateLimitQueryKey(query?.queryKey)) continue;
          seenQueries.add(query);
          const current = query.state?.data;
          const existing = queryPatches.get(query);
          if (existing?.patched === current) continue;
          if (existing) queryPatches.delete(query);
          if (!hasExactQuotaReason(current)) continue;
          const patched = {
            ...current,
            rate_limit_reached_type: null,
            rate_limit_upsell: current.rate_limit_upsell?.banner_type === 'workspace_member_credits_depleted'
              ? null
              : current.rate_limit_upsell,
            rate_limit: {
              ...(current.rate_limit ?? {}),
              allowed: true,
              limit_reached: false,
            },
            credits: current.credits == null ? current.credits : {
              ...current.credits,
              has_credits: true,
              overage_limit_reached: false,
            },
            spend_control: current.spend_control == null ? current.spend_control : {
              ...current.spend_control,
              reached: false,
            },
          };
          try {
            client.setQueryData(query.queryKey, patched);
            const applied = client.getQueryData(query.queryKey);
            if (hasAppliedSendOverride(applied, current)) {
              queryPatches.set(query, {client, original: current, patched: applied});
            } else if (applied !== current) {
              client.setQueryData(query.queryKey, current);
            }
          } catch {
            // Unknown query-client versions fail closed and retain the official gate.
          }
        }
      }
    }
    for (const [query, patch] of queryPatches) {
      if (!sendOverrideEnabled || !seenQueries.has(query)) restoreQueryPatch(query, patch);
    }
  }

  function setSendOverride(enabled) {
    sendOverrideEnabled = enabled;
    if (!enabled) {
      for (const [query, patch] of queryPatches) restoreQueryPatch(query, patch);
    }
  }

  function restore(aside) {
    const old = originalDisplay.get(aside);
    if (!old) return;
    if (old.value) aside.style.setProperty('display', old.value, old.priority);
    else aside.style.removeProperty('display');
    aside.removeAttribute(MARK);
    originalDisplay.delete(aside);
  }
  function restoreAll() {
    for (const aside of originalDisplay.keys()) restore(aside);
    for (const [query, patch] of queryPatches) restoreQueryPatch(query, patch);
  }
  function schedule() {
    if (destroyed || frame !== null) return;
    frame = window.requestAnimationFrame(() => { frame = null; scan(); });
  }
  function scan() {
    if (destroyed) return;
    const roots = new Set(document.querySelectorAll(ROOT));
    const queryClients = new Set();
    for (const [root, observer] of observers) {
      if (!roots.has(root)) { observer.disconnect(); observers.delete(root); }
    }
    const matched = new Set();
    for (const root of roots) {
      collectQueryClients(root, queryClients);
      if (!observers.has(root)) {
        const observer = new MutationObserver(schedule);
        observer.observe(root, { childList: true, subtree: true });
        observers.set(root, observer);
      }
      for (const aside of root.querySelectorAll('aside')) {
        collectQueryClients(aside, queryClients);
        if (aside.closest(ROOT) !== root) continue;
        const type = identity(aside);
        if (!TYPES.has(type)) continue;
        matched.add(aside);
        if (!originalDisplay.has(aside)) {
          originalDisplay.set(aside, {
            value: aside.style.getPropertyValue('display'),
            priority: aside.style.getPropertyPriority('display'),
          });
        }
        aside.setAttribute(MARK, type);
        aside.style.setProperty('display', 'none', 'important');
      }
    }
    reconcileSendOverride(queryClients);
    // React can reuse a node for a different warning, or remove the entire root.
    for (const aside of originalDisplay.keys()) if (!matched.has(aside)) restore(aside);
  }
  function destroy() {
    destroyed = true;
    for (const observer of observers.values()) observer.disconnect();
    observers.clear();
    if (frame !== null) window.cancelAnimationFrame(frame);
    window.clearInterval(watchdog);
    restoreAll();
    if (window[KEY] === runtime) delete window[KEY];
  }
  const runtime = {
    version: VERSION,
    session,
    heartbeatAt: Date.now(),
    scan,
    restoreAll,
    destroy,
    setSendOverride,
  };
  window[KEY] = runtime;
  // Fails open visually if Cockpit crashes, disconnects, or exits before cleanup.
  // This timer only restores; it is not another injection/scanning loop.
  watchdog = window.setInterval(() => {
    if (Date.now() - runtime.heartbeatAt > 30000) destroy();
  }, 1000);
  scan();
})
