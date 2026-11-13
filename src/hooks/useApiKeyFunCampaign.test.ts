import assert from 'node:assert/strict';
import test from 'node:test';
import { loadHookModule } from '../../tests/helpers/reactHookHarness';

test('fork campaign hook remains hidden without timers, listeners or network calls', () => {
  const forbidden = () => assert.fail('disabled promotion must not create runtime work');
  const surface = new Proxy({}, { get: forbidden });
  const h = loadHookModule(new URL('./useApiKeyFunCampaign.ts', import.meta.url), {}, {
    window: surface, document: surface, fetch: forbidden,
    setTimeout: forbidden, setInterval: forbidden,
  });
  assert.equal(h.exports.useApiKeyFunCampaign(), false);
  assert.equal(h.exports.useApiKeyFunCampaign(), false);
});
