interface ProviderPresetPrivacyFields {
  website?: string;
  apiKeyUrl?: string;
  isPartner?: boolean;
}

const TRACKING_QUERY_KEY = /^(?:aff|affiliate|campaign|ch|code|from|ic|invite|invitecode|ref|referral|source|ytag|utm_.+)$/i;

function stripTrackingParameters(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  try {
    const url = new URL(trimmed);
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_QUERY_KEY.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

export function neutralizeProviderPresets<
  T extends ProviderPresetPrivacyFields,
>(presets: readonly T[]): readonly T[] {
  return presets.map(
    (preset) =>
      ({
        ...preset,
        website: stripTrackingParameters(preset.website),
        apiKeyUrl: preset.isPartner
          ? undefined
          : stripTrackingParameters(preset.apiKeyUrl),
        isPartner: undefined,
      }) as T,
  );
}
