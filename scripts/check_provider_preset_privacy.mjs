import { createServer } from "vite";

const PRESET_MODULES = [
  [
    "codex",
    "/src/utils/codexProviderPresets.ts",
    "CODEX_API_PROVIDER_PRESETS",
  ],
  [
    "claude",
    "/src/utils/claudeProviderPresets.ts",
    "CLAUDE_API_PROVIDER_PRESETS",
  ],
  [
    "claude-desktop",
    "/src/utils/claudeDesktopProviderPresets.ts",
    "CLAUDE_DESKTOP_GATEWAY_PROVIDER_PRESETS",
  ],
];

const TRACKING_QUERY_KEY =
  /^(?:aff|affiliate|campaign|ch|code|from|ic|invite|invitecode|ref|referral|source|ytag|utm_.+)$/i;

const server = await createServer({
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true },
});

try {
  const failures = [];
  let presetCount = 0;

  for (const [platform, modulePath, exportName] of PRESET_MODULES) {
    const loaded = await server.ssrLoadModule(modulePath);
    const presets = loaded[exportName];

    if (!Array.isArray(presets)) {
      failures.push(`${platform}: ${exportName} is not an array`);
      continue;
    }

    presetCount += presets.length;
    for (const preset of presets) {
      const presetId = `${platform}:${preset.id ?? "unknown"}`;
      if (preset.isPartner) {
        failures.push(`${presetId}: isPartner is still enabled`);
      }

      for (const field of ["website", "apiKeyUrl"]) {
        const value = preset[field];
        if (!value) continue;

        let url;
        try {
          url = new URL(value);
        } catch {
          failures.push(`${presetId}: ${field} is not a valid URL`);
          continue;
        }

        for (const key of url.searchParams.keys()) {
          if (TRACKING_QUERY_KEY.test(key)) {
            failures.push(`${presetId}: ${field} retains ${key}`);
          }
        }
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Provider preset privacy check failed:\n${failures.join("\n")}`);
  }

  console.log(`Provider preset privacy check passed (${presetCount} presets).`);
} finally {
  await server.close();
}
