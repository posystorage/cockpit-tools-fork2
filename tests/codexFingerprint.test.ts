import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFingerprintTargets, normalizeFingerprintPreferences, runFingerprintQueue } from '../src/utils/codexFingerprint.ts';
import { generateChallenges } from '../src/vendor/modeltrace/challenge-browser.js';
import { analyzeGlobalOutputs } from '../src/vendor/modeltrace/fingerprint-core.js';
import bank from '../src/vendor/modeltrace/unified_bank.json';
import type { CodexAccount } from '../src/types/codex.ts';
import type { CodexModelProvider } from '../src/services/codexModelProviderService.ts';

test('first launch selects exactly the requested models and no accounts', () => {
  assert.deepEqual(normalizeFingerprintPreferences(), { targetIds: [], models: ['gpt-5.6-sol', 'gpt-6-sol', 'gpt-6-astra'], concurrency: 3, samples: 3 });
});
test('saved empty model selection stays empty and invalid settings are repaired', () => {
  assert.deepEqual(normalizeFingerprintPreferences({ models: [], targetIds: ['oauth:1', 'oauth:1'], concurrency: 0, samples: 4 }), { models: [], targetIds: ['oauth:1'], concurrency: 3, samples: 3 });
  assert.deepEqual(normalizeFingerprintPreferences({ models: ['gpt-5.5', 'unknown'], concurrency: 10, samples: 1 }).models, ['gpt-5.5']);
});
test('OAuth and every distinct upstream API key can be tested together', () => {
  const accounts = [
    { id: 'oauth', email: 'person@example.test', tokens: { access_token: 'token' } },
    { id: 'duplicate', auth_mode: 'apikey', openai_api_key: 'key1', api_base_url: 'https://example.test/v1/' },
    { id: 'standalone', auth_mode: 'apikey', openai_api_key: 'key3', api_base_url: 'https://other.test/v1' },
  ] as CodexAccount[];
  const providers = [{ id: 'upstream', name: 'Relay', baseUrl: 'https://example.test/v1', wireApi: 'chat_completions', apiKeys: [
    { id: 'one', name: 'one', apiKey: 'key1' }, { id: 'two', name: 'two', apiKey: 'key2' },
  ] }] as CodexModelProvider[];
  const targets = buildFingerprintTargets(accounts, providers);
  assert.deepEqual(targets.map((target) => target.id), ['provider:upstream:one', 'provider:upstream:two', 'account:oauth', 'account:standalone']);
  assert.ok(targets.every((target) => !target.label.includes('key1')));
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
