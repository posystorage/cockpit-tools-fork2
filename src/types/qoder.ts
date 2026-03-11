export interface QoderAccount {
  id: string;
  email: string;
  user_id?: string | null;
  display_name?: string | null;
  plan_type?: string | null;
  credits_used?: number | null;
  credits_total?: number | null;
  credits_remaining?: number | null;
  credits_usage_percent?: number | null;
  usage_updated_at?: number | null;
  tags?: string[] | null;
  auth_user_info_raw?: unknown;
  auth_user_plan_raw?: unknown;
  auth_credit_usage_raw?: unknown;
  created_at: number;
  last_used: number;
}

interface UnknownRecord {
  [key: string]: unknown;
}

export interface QoderUsage {
  inlineSuggestionsUsedPercent: number | null;
  chatMessagesUsedPercent: number | null;
  allowanceResetAt?: number | null;
  creditsUsed: number | null;
  creditsTotal: number | null;
  creditsRemaining: number | null;
}

export interface QoderUsageOverview {
  planTag: string;
  usagePercent: number | null;
  creditsUsed: number | null;
  creditsTotal: number | null;
  creditsRemaining: number | null;
  unit: string;
  detailUrl: string | null;
  upgradeUrl: string | null;
  isQuotaExceeded: boolean;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNestedValue(root: unknown, path: string[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true';
  }
  if (typeof value === 'number') return value === 1;
  return false;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = toNonEmptyString(value);
    if (normalized) return normalized;
  }
  return null;
}

function firstFiniteNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const normalized = toFiniteNumber(value);
    if (normalized != null) return normalized;
  }
  return null;
}

function clampPercent(value: number | null): number | null {
  if (value == null) return null;
  const normalized = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, normalized));
}

function getRawPlanTag(account: QoderAccount): string | null {
  return firstNonEmptyString(
    getNestedValue(account.auth_user_plan_raw, ['plan_tier_name']),
    getNestedValue(account.auth_user_plan_raw, ['tier_name']),
    getNestedValue(account.auth_user_plan_raw, ['tierName']),
    getNestedValue(account.auth_user_plan_raw, ['planTierName']),
    getNestedValue(account.auth_user_plan_raw, ['plan']),
    getNestedValue(account.auth_user_info_raw, ['userTag']),
    getNestedValue(account.auth_user_info_raw, ['user_tag']),
    getNestedValue(account.auth_credit_usage_raw, ['plan_tier_name']),
    getNestedValue(account.auth_credit_usage_raw, ['tier_name']),
    getNestedValue(account.auth_credit_usage_raw, ['tierName']),
    getNestedValue(account.auth_credit_usage_raw, ['planTierName']),
    account.plan_type,
  );
}

export function getQoderAccountDisplayEmail(account: QoderAccount): string {
  return (
    account.email ||
    account.display_name ||
    account.user_id ||
    account.id
  );
}

export function getQoderPlanBadge(account: QoderAccount): string {
  const raw = getRawPlanTag(account);
  if (raw) return raw;
  return 'UNKNOWN';
}

export function getQoderUsage(account: QoderAccount): QoderUsage {
  const used = firstFiniteNumber(
    getNestedValue(account.auth_credit_usage_raw, ['userQuota', 'used']),
    account.credits_used,
  );
  const total = firstFiniteNumber(
    getNestedValue(account.auth_credit_usage_raw, ['userQuota', 'total']),
    account.credits_total,
  );
  const remaining = firstFiniteNumber(
    getNestedValue(account.auth_credit_usage_raw, ['userQuota', 'remaining']),
    account.credits_remaining,
    total != null && used != null ? total - used : null,
  );
  const percent = clampPercent(
    firstFiniteNumber(
      getNestedValue(account.auth_credit_usage_raw, ['totalUsagePercentage']),
      getNestedValue(account.auth_credit_usage_raw, ['userQuota', 'percentage']),
      account.credits_usage_percent,
      total != null && used != null && total > 0 ? (used / total) * 100 : null,
    ),
  );

  return {
    inlineSuggestionsUsedPercent: percent,
    chatMessagesUsedPercent: percent,
    allowanceResetAt: null,
    creditsUsed: used,
    creditsTotal: total,
    creditsRemaining: remaining,
  };
}

export function getQoderUsageOverview(account: QoderAccount): QoderUsageOverview {
  const usage = getQoderUsage(account);
  const detailUrl = firstNonEmptyString(
    getNestedValue(account.auth_credit_usage_raw, ['usageDetailUrl']),
    getNestedValue(account.auth_credit_usage_raw, ['usageDetailsUrl']),
    getNestedValue(account.auth_credit_usage_raw, ['detailUrl']),
    getNestedValue(account.auth_credit_usage_raw, ['overviewUrl']),
    getNestedValue(account.auth_credit_usage_raw, ['usageUrl']),
  );
  const upgradeUrl = firstNonEmptyString(
    getNestedValue(account.auth_credit_usage_raw, ['upgradeUrl']),
    getNestedValue(account.auth_user_plan_raw, ['upgradeUrl']),
  );

  return {
    planTag: getQoderPlanBadge(account),
    usagePercent: usage.inlineSuggestionsUsedPercent,
    creditsUsed: usage.creditsUsed,
    creditsTotal: usage.creditsTotal,
    creditsRemaining: usage.creditsRemaining,
    unit:
      firstNonEmptyString(getNestedValue(account.auth_credit_usage_raw, ['userQuota', 'unit'])) ||
      'Credits',
    detailUrl: detailUrl || upgradeUrl,
    upgradeUrl,
    isQuotaExceeded:
      toBoolean(getNestedValue(account.auth_credit_usage_raw, ['isQuotaExceeded'])) ||
      toBoolean(getNestedValue(account.auth_user_info_raw, ['isQuotaExceeded'])),
  };
}
