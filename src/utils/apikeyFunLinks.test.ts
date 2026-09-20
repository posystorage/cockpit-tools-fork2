import assert from "node:assert/strict";
import test from "node:test";

import {
  APIKEY_FUN_DIRECT_ENDPOINT,
  APIKEY_FUN_GLOBAL_ENDPOINT,
  APIKEY_FUN_PROVIDER_BASE_URL,
  APIKEY_FUN_REGISTER_URL,
  isApiKeyFunProviderBaseUrl,
  normalizeApiKeyFunOfficialUrl,
  normalizeApiKeyFunProviderBaseUrl,
} from "./apikeyFunLinks.ts";

test("fork presets do not inject sponsored endpoints", () => {
  assert.equal(APIKEY_FUN_REGISTER_URL, "");
  assert.equal(APIKEY_FUN_GLOBAL_ENDPOINT, "");
  assert.equal(APIKEY_FUN_DIRECT_ENDPOINT, "");
  assert.equal(APIKEY_FUN_PROVIDER_BASE_URL, "");
});

test("existing links remain unchanged without an automatic sponsor migration", () => {
  assert.equal(
    normalizeApiKeyFunOfficialUrl("https://apikey.fun/register?aff=other"),
    "https://apikey.fun/register?aff=other",
  );
  assert.equal(
    normalizeApiKeyFunOfficialUrl("https://relay.example.com/register"),
    "https://relay.example.com/register",
  );
});

test("no commercial host receives special provider handling", () => {
  assert.equal(isApiKeyFunProviderBaseUrl("https://api.apikey.fan/v1"), false);
  assert.equal(isApiKeyFunProviderBaseUrl("https://api.apikey.fun/v1/"), false);
  assert.equal(isApiKeyFunProviderBaseUrl("https://api.apikey.fan/v2"), false);
});

test("provider base URL normalization leaves configured hosts alone", () => {
  assert.equal(
    normalizeApiKeyFunProviderBaseUrl("https://api.apikey.fun/v1/"),
    "https://api.apikey.fun/v1/",
  );
  assert.equal(
    normalizeApiKeyFunProviderBaseUrl("https://api.apikey.fan/v1"),
    "https://api.apikey.fan/v1",
  );
  assert.equal(
    normalizeApiKeyFunProviderBaseUrl("https://relay.example.com/v1"),
    "https://relay.example.com/v1",
  );
});
