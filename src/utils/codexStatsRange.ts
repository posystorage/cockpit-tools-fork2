export type CodexStatsRangeKey =
  | "daily"
  | "weekly"
  | "monthly"
  | "last24h"
  | "last48h"
  | "last7d"
  | "custom";

export interface CodexStatsTimeRange {
  startAt: number;
  endAt: number;
  startInput: string;
  endInput: string;
}

function formatDateInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildRange(start: Date, end: Date): CodexStatsTimeRange {
  return {
    startAt: start.getTime(),
    endAt: end.getTime(),
    startInput: formatDateInput(start),
    endInput: formatDateInput(end),
  };
}

function buildRollingRange(hours: number, now: Date): CodexStatsTimeRange {
  const end = new Date(now);
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  return buildRange(start, end);
}

export function buildCodexStatsTimeRange(
  key: CodexStatsRangeKey,
  now = new Date(),
): CodexStatsTimeRange {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setHours(23, 59, 59, 999);
  if (key === "daily" || key === "custom") return buildRange(todayStart, todayEnd);
  if (key === "weekly") {
    const weekStart = new Date(todayStart);
    const mondayOffset = (weekStart.getDay() + 6) % 7;
    weekStart.setDate(weekStart.getDate() - mondayOffset);
    return buildRange(weekStart, todayEnd);
  }
  if (key === "last24h") return buildRollingRange(24, now);
  if (key === "last48h") return buildRollingRange(48, now);
  if (key === "last7d") return buildRollingRange(7 * 24, now);
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  return buildRange(monthStart, todayEnd);
}

export function parseCodexStatsTimeRange(
  startInput: string,
  endInput: string,
): CodexStatsTimeRange | null {
  const startDate = new Date(`${startInput}T00:00:00`);
  const endDate = new Date(`${endInput}T00:00:00`);
  const startAt = startDate.getTime();
  endDate.setHours(23, 59, 59, 999);
  const endAt = endDate.getTime();
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt < startAt) {
    return null;
  }
  return { startAt, endAt, startInput, endInput };
}
