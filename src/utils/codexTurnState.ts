import type { CodexTurnStateObservation } from "../types/codexLocalAccess";

export function selectRecentTurnStates(observations: CodexTurnStateObservation[], accountId: string) {
  return observations
    .filter((item) => item.accountId === accountId && item.length > 0 && Number.isFinite(item.observedAt))
    .sort((a, b) => b.observedAt - a.observedAt || a.length - b.length)
    .slice(0, 2);
}
