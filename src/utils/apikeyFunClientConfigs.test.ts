import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { APIKEY_FUN_FAMILIES, buildApiKeyFunClientPreview, buildCodexConfigToml, buildClaudeCodeSettingsJson, normalizeApiKeyFunClientBaseUrl, resolveApiKeyFunGrokModel, resolveDefaultModel } from './apikeyFunClientConfigs';
import { APIKEY_FUN_DEFAULT_MODEL_CATALOG } from './apikeyFunLinks';

const family = (id: string) => {
  const preset = APIKEY_FUN_FAMILIES.find((entry) => entry.id === id);
  assert.ok(preset, `missing family ${id}`);
  return preset;
};

test('codex config derives the auto compact limit as 90% of the context window', () => {
  const catalog = JSON.parse(readFileSync(new URL('../../resources/codex/codex_client_models.json', import.meta.url), 'utf8'));
  const codexTemplate = catalog.models.find((model: { slug: string }) => model.slug === family('codex').fallbackModel);
  assert.ok(codexTemplate, 'Codex family model template');
  for (const [id, contextWindow] of [
    ['codex', codexTemplate.context_window],
    ['glm', 1000000],
    ['kimi', 1000000],
    ['deepseek', 1000000],
  ] as const) {
    const toml = buildCodexConfigToml({
      family: family(id),
      client: 'codex_cli',
      model: family(id).fallbackModel,
      baseUrl: 'https://custom.example.test/v1',
    });
    const expected = Math.floor((contextWindow * 90) / 100);
    assert.ok(toml.includes(`model_context_window = ${contextWindow}`), id);
    assert.ok(toml.includes(`model_auto_compact_token_limit = ${expected}`), id);
    // 压缩阈值必须严格小于上下文窗口，否则永远不会触发压缩。
    assert.ok(expected < contextWindow, id);
  }
});

test('built-in Codex templates prefer current models while preserving explicit upstream catalogs', () => {
  const preset = family('codex');
  assert.equal(resolveDefaultModel(preset, []), 'gpt-5.6-sol');
  assert.equal(resolveDefaultModel(preset, ['gpt-5.5', 'gpt-5.6-sol']), 'gpt-5.6-sol');
  assert.equal(resolveDefaultModel(preset, ['custom-gpt', 'gpt-5.5']), 'gpt-5.5');
  assert.equal(resolveDefaultModel(preset, ['gpt-5.4', 'gpt-5.5']), 'gpt-5.4');
  assert.ok(!preset.preferredModels.includes('gpt-5.5'));
  assert.ok(!APIKEY_FUN_DEFAULT_MODEL_CATALOG.some((model) => model === ('gpt-5.5' as string)));
  assert.ok(buildCodexConfigToml({ family: preset, client: 'codex_app', model: 'gpt-5.5', baseUrl: 'https://custom.example.test/v1' })
    .includes('model = "gpt-5.5"'));
});

test('Grok template prefers 4.7 only when the upstream catalog offers it', () => {
  const preset = family('grok');
  assert.equal(resolveDefaultModel(preset, []), 'grok-4.7');
  assert.equal(resolveDefaultModel(preset, ['grok-4.6', 'grok-4.7']), 'grok-4.7');
  assert.equal(resolveDefaultModel(preset, ['grok-4.6']), 'grok-4.6');
  assert.equal(resolveDefaultModel(preset, ['custom-grok']), 'custom-grok');
  assert.ok(!preset.preferredModels.includes('grok-4.7-build-fast'));
  assert.ok(buildCodexConfigToml({ family: preset, client: 'codex_cli', model: 'grok-4.6', baseUrl: 'https://custom.example.test/v1' })
    .includes('model = "grok-4.6"'));
});

test('every client uses the saved custom origin and preserves its path prefix', () => {
  for (const [baseUrl, codexBaseUrl, anthropicBaseUrl] of [
    ['https://relay.example.test', 'https://relay.example.test', 'https://relay.example.test'],
    ['https://relay.example.test/custom/v1/', 'https://relay.example.test/custom/v1', 'https://relay.example.test/custom'],
    ['https://relay.example.test/proxy/anthropic', 'https://relay.example.test/proxy/anthropic', 'https://relay.example.test/proxy/anthropic'],
  ]) {
    for (const client of ['codex_app', 'codex_cli', 'claude_code', 'claude_desktop'] as const) {
      const preview = buildApiKeyFunClientPreview({ family: family('grok'), client, baseUrl,
        apiKey: 'custom-private-key', model: 'grok-4.6', platform: 'windows' });
      assert.doesNotMatch(JSON.stringify(preview), /apikey\.fan|x-openai-actor-authorization/);
      if (client === 'codex_app' || client === 'codex_cli') {
        assert.equal(preview.blocks[0].text.match(/^base_url = "([^"]+)"$/m)?.[1], codexBaseUrl);
        assert.equal(JSON.parse(preview.blocks[1].text).OPENAI_API_KEY, 'custom-private-key');
      } else if (client === 'claude_code') {
        const settings = JSON.parse(preview.blocks[1].text);
        assert.equal(settings.env.ANTHROPIC_BASE_URL, anthropicBaseUrl);
        assert.equal(settings.env.ANTHROPIC_AUTH_TOKEN, 'custom-private-key');
        assert.ok(preview.blocks[0].text.includes(`ANTHROPIC_BASE_URL=${anthropicBaseUrl}`));
      } else {
        assert.equal(preview.blocks[0].text, anthropicBaseUrl);
        assert.equal(preview.blocks[1].text, 'custom-private-key');
      }
    }
  }
});

test('legacy or invalid addresses never produce a destination for a private key', () => {
  for (const baseUrl of [undefined, '', ' ', 'not-a-url', 'file:///tmp/key', 'https://user:password@relay.example.test/v1']) {
    assert.equal(normalizeApiKeyFunClientBaseUrl(baseUrl), '');
    assert.throws(() => buildCodexConfigToml({ family: family('codex'), client: 'codex_app', model: 'gpt-6-sol', baseUrl: baseUrl! }), /Base URL/);
    assert.throws(() => buildClaudeCodeSettingsJson({ apiKey: 'private-key', baseUrl: baseUrl! }), /Base URL/);
    assert.throws(() => buildApiKeyFunClientPreview({ family: family('claude'), client: 'claude_desktop',
      apiKey: 'private-key', baseUrl: baseUrl!, model: 'claude-opus-4-6', platform: 'macos' }), /Base URL/);
  }
});

test('Grok account prefill selects a model actually available to the saved key', () => {
  assert.equal(resolveApiKeyFunGrokModel(['gpt-5', 'grok-4.6', 'grok-4.7']), 'grok-4.7');
  assert.equal(resolveApiKeyFunGrokModel(['gpt-5', 'relay/Grok-4.6']), 'relay/Grok-4.6');
  assert.equal(resolveApiKeyFunGrokModel(['gemini-3', 'gpt-5']), undefined);
});
