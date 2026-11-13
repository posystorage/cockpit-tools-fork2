import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildFingerprintTargets, fingerprintExcludedAccountIds, normalizeFingerprintPreferences, runFingerprintQueue } from '../src/utils/codexFingerprint.ts';
import { generateChallenges } from '../src/vendor/modeltrace/challenge-browser.js';
import { analyzeGlobalOutputs } from '../src/vendor/modeltrace/fingerprint-core.js';
import bank from '../src/vendor/modeltrace/unified_bank.json';
import referenceMetadata from '../src/vendor/modeltrace/metadata.json';
import type { CodexAccount } from '../src/types/codex.ts';
import type { CodexModelProvider } from '../src/services/codexModelProviderService.ts';
import { FINGERPRINT_MODELS } from '../src/types/codexFingerprint.ts';

test('the complete pinned ModelTrace bank and scorer match their shipped integrity metadata', () => {
  const bytes = (file: string) => readFileSync(new URL('../src/vendor/modeltrace/' + file, import.meta.url));
  const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
  assert.equal(hash(bytes('unified_bank.json').toString().replaceAll('\r\n', '\n')), referenceMetadata.packagedBankSha256);
  for (const [file, expected] of [
    ['fingerprint-core.js', referenceMetadata.scorerSha256],
    ['challenge-browser.js', referenceMetadata.challengeSha256],
  ]) assert.equal(hash(bytes(file).toString().replaceAll('\r\n', '\n')), expected);
  assert.equal(referenceMetadata.sourceCommit, '6cd4a8ff0f3f4e49d6d6969dd2fbadfa1569fde2');
  assert.equal(bank.models.length, referenceMetadata.modelCount);
  assert.equal(bank.built_at, referenceMetadata.builtAt);
  assert.deepEqual(bank.robust.model_order, bank.models.map((model) => model.id));
  assert.ok(bank.models.some((model) => model.id === 'claude-sonnet-5-5'));
  assert.ok(bank.models.some((model) => model.id === 'claude-haiku-5-5'));
  assert.ok(!bank.models.some((model) => model.id.startsWith('gpt-6.1-')));
  assert.deepEqual(Object.keys(bank.calibration).sort(), ['1', '2', '3']);
  assert.equal(readFileSync(new URL('../public/licenses/ModelTrace-LICENSE.txt', import.meta.url), 'utf8').replaceAll('\r\n', '\n'),
    bytes('LICENSE').toString().replaceAll('\r\n', '\n'));
});

test('GPT-6.1 Sol selection survives preference restoration and matches the backend allowlist', () => {
  assert.ok(FINGERPRINT_MODELS.includes('gpt-6.1-sol'));
  assert.deepEqual(normalizeFingerprintPreferences({ models: ['gpt-6.1-sol'] }).models, ['gpt-6.1-sol']);
  const source = readFileSync(new URL('../src-tauri/src/modules/codex_fingerprint_transport.rs', import.meta.url), 'utf8');
  const allowlist = source.match(/const FINGERPRINT_MODELS: &[\s\S]*?= &\[([\s\S]*?)\];/)?.[1];
  assert.ok(allowlist);
  assert.deepEqual([...allowlist.matchAll(/"([^"]+)"/g)].map((match) => match[1]), [...FINGERPRINT_MODELS]);
});

test('first launch selects exactly the requested models and no accounts', () => {
  assert.deepEqual(normalizeFingerprintPreferences(), { targetIds: [], models: ['gpt-5.6-sol', 'gpt-6-sol', 'gpt-6-astra'], concurrency: 3, samples: 3 });
});

test('deleted provider keys are not resurrected by standalone account targets', async () => {
  const key = 'deleted-key';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const hash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
  const providers = [{ id: 'relay', name: 'Relay', baseUrl: 'https://relay.test/v1', apiKeys: [], excludedApiKeyHashes: [hash] }] as CodexModelProvider[];
  const accounts = [{ id: 'deleted', auth_mode: 'apikey', api_provider_id: 'relay', openai_api_key: key }] as CodexAccount[];
  const excluded = await fingerprintExcludedAccountIds(accounts, providers);
  assert.deepEqual(excluded, ['deleted']);
  assert.deepEqual(buildFingerprintTargets(accounts, providers, excluded), []);
});
test('saved empty model selection stays empty and invalid settings are repaired', () => {
  assert.deepEqual(normalizeFingerprintPreferences({ models: [], targetIds: ['oauth:1', 'oauth:1'], concurrency: 0, samples: 4 }), { models: [], targetIds: ['oauth:1'], concurrency: 3, samples: 3 });
  assert.deepEqual(normalizeFingerprintPreferences({ models: ['gpt-5.5', 'gpt-6.1-sol', 'unknown'], concurrency: 10, samples: 1 }).models, ['gpt-6.1-sol']);
});
test('OAuth and every distinct upstream API key can be tested together', () => {
  const accounts = [
    { id: 'oauth', email: 'person@example.test', tokens: { access_token: 'token' } },
    { id: 'duplicate', auth_mode: 'apikey', openai_api_key: 'key1', api_base_url: 'https://example.test/v1/', api_wire_api: 'chat_completions' },
    { id: 'standalone', auth_mode: 'apikey', openai_api_key: 'key3', api_base_url: 'https://other.test/v1' },
  ] as CodexAccount[];
  const providers = [{ id: 'upstream', name: 'Relay', baseUrl: 'https://example.test/v1', wireApi: 'chat_completions', apiKeys: [
    { id: 'one', name: 'one', apiKey: 'key1' }, { id: 'two', name: 'two', apiKey: 'key2' },
  ] }] as CodexModelProvider[];
  const targets = buildFingerprintTargets(accounts, providers);
  assert.deepEqual(targets.map((target) => target.id), ['provider:upstream:one', 'provider:upstream:two', 'account:oauth', 'account:standalone']);
  assert.ok(targets.every((target) => !target.label.includes('key1')));
});
test('provider targets preserve explicit Anthropic authentication and distinct protocols', () => {
  const providers = [
    { id: 'messages', name: 'Messages', baseUrl: 'https://example.test/v1', wireApi: 'anthropic', authScheme: 'bearer', apiKeys: [{ id: 'one', apiKey: 'shared' }] },
    { id: 'responses', name: 'Responses', baseUrl: 'https://example.test/v1', wireApi: 'responses', apiKeys: [{ id: 'one', apiKey: 'shared' }] },
  ] as CodexModelProvider[];
  const accounts = [{ id: 'duplicate', auth_mode: 'apikey', openai_api_key: 'shared', api_base_url: 'https://example.test/v1', api_wire_api: 'anthropic', api_auth_scheme: 'bearer' }] as CodexAccount[];
  const targets = buildFingerprintTargets(accounts, providers);
  assert.deepEqual(targets.map((target) => target.id), ['provider:messages:one', 'provider:responses:one']);
  assert.equal(targets[0].kind, 'provider');
  if (targets[0].kind === 'provider') {
    assert.equal(targets[0].wireApi, 'anthropic');
    assert.equal(targets[0].authScheme, 'bearer');
  }
});

test('fingerprint targets deduplicate identical final endpoints for every supported protocol', () => {
  for (const protocol of ['responses', 'chat_completions', 'anthropic'] as const) {
    for (const suffix of ['', '/responses', '/chat/completions', '/messages']) {
      const providers = [{ id: 'provider', name: 'Relay', baseUrl: `https://RELAY.example.test:443/tenant/v1${suffix}/?ignored=1#fragment`,
        wireApi: protocol, apiKeys: [{ id: 'key', apiKey: 'same-key' }] }] as CodexModelProvider[];
      const accounts = [{ id: 'account', auth_mode: 'apikey', openai_api_key: 'same-key',
        api_base_url: 'https://relay.example.test/tenant/v1', api_wire_api: protocol }] as CodexAccount[];
      assert.deepEqual(buildFingerprintTargets(accounts, providers).map((target) => target.id), ['provider:provider:key'], `${protocol} ${suffix}`);
    }
    const provider = { id: 'root', name: 'Root', baseUrl: 'https://relay.example.test/',
      wireApi: protocol, apiKeys: [{ id: 'key', apiKey: 'same-key' }] } as CodexModelProvider;
    const account = { id: 'root-account', auth_mode: 'apikey', openai_api_key: 'same-key',
      api_base_url: 'https://relay.example.test/v1', api_wire_api: protocol } as CodexAccount;
    assert.equal(buildFingerprintTargets([account], [provider]).length, 1, protocol);
  }
});

test('fingerprint target identity keeps distinct prefixes, protocols and effective authentication', () => {
  const makeProvider = (id: string, baseUrl: string, wireApi: 'responses' | 'chat_completions' | 'anthropic', authScheme?: 'x-api-key' | 'bearer') => ({
    id, name: id, baseUrl, wireApi, authScheme, apiKeys: [{ id: 'key', apiKey: 'same-key' }],
  }) as CodexModelProvider;
  const targets = buildFingerprintTargets([], [
    makeProvider('a', 'https://relay.example.test/a/v1', 'anthropic'),
    makeProvider('a-x-key', 'https://relay.example.test/a/v1/messages', 'anthropic', 'x-api-key'),
    makeProvider('a-bearer', 'https://relay.example.test/a/v1/messages', 'anthropic', 'bearer'),
    makeProvider('b', 'https://relay.example.test/b/v1/messages', 'anthropic'),
    makeProvider('a-chat', 'https://relay.example.test/a/v1/messages', 'chat_completions'),
    makeProvider('a-responses', 'https://relay.example.test/a/v1/messages', 'responses'),
    makeProvider('a-responses-ignored-scheme', 'https://relay.example.test/a/v1/responses', 'responses', 'x-api-key'),
    makeProvider('nested-messages', 'https://relay.example.test/a/v1/messages/responses', 'anthropic'),
  ]);
  assert.deepEqual(targets.map((target) => target.id), [
    'provider:a:key', 'provider:a-bearer:key', 'provider:b:key',
    'provider:a-chat:key', 'provider:a-responses:key', 'provider:nested-messages:key',
  ]);
});

test('the batch never exceeds its parallel limit and runs each group once', async () => {
  let active = 0; let peak = 0; const completed: number[] = [];
  await runFingerprintQueue([0, 1, 2, 3, 4, 5, 6], 3, () => false, async (job) => {
    active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    completed.push(job); active--;
  });
  assert.equal(peak, 3); assert.deepEqual(completed.sort(), [0, 1, 2, 3, 4, 5, 6]);
});
test('cancel prevents queued groups from issuing any request', async () => {
  let cancelled = false; const called: number[] = [];
  await runFingerprintQueue([1, 2, 3], 1, () => cancelled, async (job) => { called.push(job); cancelled = true; });
  assert.deepEqual(called, [1]);
});
test('one, two, and three samples use the corresponding reference calibration', () => {
  const text = Array.from({ length: 312 }, (_, i) => 1 + ((i * 79) % 355)).join(', ');
  for (const count of [1, 2, 3]) {
    const challenges = generateChallenges(count);
    assert.equal(challenges.length, count);
    assert.equal(new Set(challenges.map((challenge) => challenge.expected_count)).size, count);
    const result = analyzeGlobalOutputs(challenges.map((challenge) => ({ text, expected_count: challenge.expected_count })), bank);
    assert.equal(result.used_outputs, count);
    assert.ok(result.results.every((item) => Number.isFinite(item.probability)));
    assert.ok(Math.abs(result.results.reduce((sum, item) => sum + item.probability, 0) - 1) < 1e-10);
  }
});
test('refusals and truncated numeric samples cannot become complete results', () => {
  assert.throws(() => analyzeGlobalOutputs([{ text: 'I cannot answer', expected_count: 300 }], bank));
  const text = Array.from({ length: 300 }, (_, i) => (i * 37) % 355 + 1).join(' ');
  const result = analyzeGlobalOutputs([{ text, expected_count: 300 }, { text: '1 2 3', expected_count: 300 }], bank);
  assert.equal(result.used_outputs, 1); assert.equal(result.diagnostics[1].accepted, false);
});
