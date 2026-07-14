import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { neutralizeProviderPresets } from "../src/utils/providerPresetPrivacy.ts";

describe("provider preset privacy", () => {
  it("removes partner metadata without changing provider capabilities", () => {
    const raw = {
      id: "relay",
      baseUrls: ["https://api.example.com/v1"],
      models: ["model-a"],
      website: "https://example.com/?utm_source=cockpit&lang=en",
      apiKeyUrl: "https://example.com/register?invite=partner-code",
      isPartner: true,
    };

    const [preset] = neutralizeProviderPresets([raw]);

    assert.deepEqual(preset.baseUrls, raw.baseUrls);
    assert.deepEqual(preset.models, raw.models);
    assert.equal(preset.website, "https://example.com/?lang=en");
    assert.equal(preset.apiKeyUrl, undefined);
    assert.equal(preset.isPartner, undefined);
    assert.equal(raw.isPartner, true);
    assert.match(raw.apiKeyUrl, /invite=/);
  });

  it("keeps neutral links and non-tracking query parameters", () => {
    const [preset] = neutralizeProviderPresets([
      {
        website: "https://example.com/docs?ref=partner&section=models",
        apiKeyUrl: "https://example.com/keys?team=engineering&code=promo",
      },
    ]);

    assert.equal(
      preset.website,
      "https://example.com/docs?section=models",
    );
    assert.equal(
      preset.apiKeyUrl,
      "https://example.com/keys?team=engineering",
    );
  });

  it("drops malformed promotional links instead of guessing", () => {
    const [preset] = neutralizeProviderPresets([
      {
        website: "not a url",
        apiKeyUrl: " ",
      },
    ]);

    assert.equal(preset.website, undefined);
    assert.equal(preset.apiKeyUrl, undefined);
  });
});
