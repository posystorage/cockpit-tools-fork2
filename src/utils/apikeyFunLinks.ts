export const APIKEY_FUN_REGISTER_URL = '';
export const APIKEY_FUN_DOCS_URL = '';
export const APIKEY_FUN_GLOBAL_ENDPOINT = '';
export const APIKEY_FUN_DIRECT_ENDPOINT = '';
export const APIKEY_FUN_SOURCE_TAG = 'custom_provider';
export const APIKEY_FUN_DEFAULT_MODEL_CATALOG = [] as const;
export const APIKEY_FUN_PROVIDER_BASE_URL = buildApiKeyFunProviderBaseUrl(
  APIKEY_FUN_GLOBAL_ENDPOINT,
);

export function buildApiKeyFunProviderBaseUrl(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  return trimmed ? `${trimmed}/v1` : '';
}

export function normalizeApiKeyFunOfficialUrl(value?: string | null): string {
  const raw = value?.trim() ?? '';
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (
      parsed.hostname.toLowerCase() === 'apikey.fun' &&
      (parsed.pathname === '/' || parsed.pathname === '/register')
    ) {
      return APIKEY_FUN_REGISTER_URL;
    }
  } catch {
    return raw;
  }
  return raw;
}

export function isApiKeyFunProviderBaseUrl(_value?: string | null): boolean {
  return false;
}

export function resolveApiKeyFunWireApi(
  baseUrl?: string | null,
  wireApi?: 'responses' | 'chat_completions' | null,
): 'responses' | 'chat_completions' | null {
  return isApiKeyFunProviderBaseUrl(baseUrl) ? 'responses' : wireApi ?? null;
}
