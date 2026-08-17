import type { CodexLocalAccessAccountModelRule } from "../types/codexLocalAccess";

const ALL_MODELS_PATTERN = "*";

function isAllModelsPattern(value: string): boolean {
  return value.trim() === ALL_MODELS_PATTERN;
}

export function isCodexLocalAccessBackupDispatchEnabled(
  rules: CodexLocalAccessAccountModelRule[] | null | undefined,
  accountId: string,
): boolean {
  const rule = (rules ?? []).find((item) => item.accountId === accountId);
  return !rule?.excludedModels.some(isAllModelsPattern);
}

export function setCodexLocalAccessBackupDispatchEnabled(
  rules: CodexLocalAccessAccountModelRule[] | null | undefined,
  accountId: string,
  enabled: boolean,
): CodexLocalAccessAccountModelRule[] {
  const nextRules = (rules ?? []).map((rule) => ({
    accountId: rule.accountId,
    excludedModels: [...rule.excludedModels],
  }));
  const index = nextRules.findIndex((rule) => rule.accountId === accountId);
  const current = index >= 0 ? nextRules[index] : null;
  const excludedModels = (current?.excludedModels ?? []).filter(
    (model) => !isAllModelsPattern(model),
  );

  if (!enabled) {
    excludedModels.push(ALL_MODELS_PATTERN);
  }

  if (excludedModels.length === 0) {
    if (index >= 0) nextRules.splice(index, 1);
    return nextRules;
  }

  const nextRule = { accountId, excludedModels };
  if (index >= 0) {
    nextRules[index] = nextRule;
  } else {
    nextRules.push(nextRule);
  }
  return nextRules;
}
