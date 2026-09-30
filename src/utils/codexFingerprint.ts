import { FINGERPRINT_DEFAULT_MODELS, FINGERPRINT_MAX_CONCURRENCY, FINGERPRINT_MODELS, type FingerprintPreferences } from '../types/codexFingerprint.ts';
import { isCodexApiKeyAccount, isCodexPendingOAuthAccount, isCodexWebSessionAccount, type CodexAccount } from '../types/codex.ts';
import type { FingerprintTarget } from '../types/codexFingerprint.ts';
import type { CodexModelProvider } from '../services/codexModelProviderService';

export async function fingerprintExcludedAccountIds(accounts: CodexAccount[], providers: CodexModelProvider[]): Promise<string[]> {
  const excluded: string[] = [];
  for (const account of accounts) {
    if (!isCodexApiKeyAccount(account) || !account.openai_api_key?.trim()) continue;
    const related = providers.filter((provider) => provider.id === account.api_provider_id
      || provider.baseUrl.trim().replace(/\/$/, '') === account.api_base_url?.trim().replace(/\/$/, ''));
    if (!related.some((provider) => provider.excludedApiKeyHashes?.length)) continue;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(account.openai_api_key.trim()));
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (related.some((provider) => provider.excludedApiKeyHashes?.includes(hash))) excluded.push(account.id);
  }
  return excluded;
}

export function buildFingerprintTargets(accounts: CodexAccount[], providers: CodexModelProvider[], excludedAccountIds: string[] = []): FingerprintTarget[] {
  const targets: FingerprintTarget[] = [];
  const seen = new Set<string>();
  const identity = (url: string, key: string) => JSON.stringify([url.trim().replace(/\/$/, ''), key.trim()]);
  for (const provider of providers) for (const key of provider.apiKeys) {
    if (!key.apiKey.trim() || !provider.baseUrl.trim()) continue;
    const signature = identity(provider.baseUrl, key.apiKey);
    if (seen.has(signature)) continue;
    seen.add(signature);
    targets.push({ id: 'provider:' + provider.id + ':' + key.id, kind: 'provider',
      label: provider.name + ' · ' + (key.name || 'API Key ' + (provider.apiKeys.indexOf(key) + 1)),
      baseUrl: provider.baseUrl, apiKey: key.apiKey, wireApi: provider.wireApi || 'responses' });
  }
  for (const account of accounts) {
    if (excludedAccountIds.includes(account.id)) continue;
    if (isCodexWebSessionAccount(account) || isCodexPendingOAuthAccount(account)) continue;
    if (isCodexApiKeyAccount(account)) {
      if (!account.openai_api_key?.trim()) continue;
      const signature = identity(account.api_base_url || 'https://api.openai.com/v1', account.openai_api_key);
      if (seen.has(signature)) continue;
      seen.add(signature);
    } else if (!account.tokens?.access_token?.trim()) continue;
    targets.push({ id: 'account:' + account.id, kind: 'account', accountId: account.id,
      label: (isCodexApiKeyAccount(account) ? 'API · ' : 'OAuth · ') + (account.account_name || account.email || account.id) });
  }
  return targets;
}

const uniqueStrings = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))] : [];
export function normalizeFingerprintPreferences(value?: unknown): FingerprintPreferences {
  const saved = value && typeof value === 'object' ? value as Partial<FingerprintPreferences> : {};
  return {
    targetIds: uniqueStrings(saved.targetIds),
    models: Array.isArray(saved.models)
      ? uniqueStrings(saved.models).filter((model) => (FINGERPRINT_MODELS as readonly string[]).includes(model))
      : [...FINGERPRINT_DEFAULT_MODELS],
    concurrency: Number.isInteger(saved.concurrency) && saved.concurrency! >= 1 && saved.concurrency! <= FINGERPRINT_MAX_CONCURRENCY ? saved.concurrency! : 3,
    samples: [1, 2, 3].includes(saved.samples!) ? saved.samples! : 3,
  };
}

/** Workers own a complete target/model group; its probes run sequentially. */
export async function runFingerprintQueue<T>(
  jobs: T[], concurrency: number, cancelled: () => boolean, run: (job: T) => Promise<void>,
): Promise<void> {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > FINGERPRINT_MAX_CONCURRENCY) throw new Error('Invalid concurrency');
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (!cancelled()) {
      const index = cursor++;
      if (index >= jobs.length) return;
      await run(jobs[index]);
    }
  }));
}
