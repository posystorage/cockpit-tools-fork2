import type { CodexTurnStateObservation } from "../../types/codexLocalAccess";
import { selectRecentTurnStates } from "../../utils/codexTurnState";
import "./CodexTurnStateObservations.css";

const toneByLength: Record<number, string> = { 292: "green", 312: "red", 332: "blue", 356: "red" };

interface Props {
  accountId: string;
  enabled: boolean;
  observations: CodexTurnStateObservation[];
}

export function CodexTurnStateObservations({ accountId, enabled, observations }: Props) {
  const recent = selectRecentTurnStates(observations, accountId);
  return (
    <div className="codex-turn-state" aria-label="Codex Turn 上游响应头观测">
      <span className="codex-turn-state-label" title={`仅记录 API 服务上游响应头长度，不代表令牌有效或账号状态${enabled ? "" : "；监听已关闭"}`}>
        Turn
      </span>
      <div className="codex-turn-state-values">
        {recent.map((observation) => {
          const time = new Date(observation.observedAt);
          const validTime = !Number.isNaN(time.getTime());
          return (
            <span
              className="codex-turn-state-value"
              key={observation.length}
              title={`${observation.length} 字符：${validTime ? time.toLocaleString() : "时间未知"}${observation.model ? ` · ${observation.model}` : ""}；仅为上游响应头观测`}
            >
              <b className={`codex-turn-state-badge is-${toneByLength[observation.length] ?? "yellow"}`}>{observation.length}</b>
              <time dateTime={validTime ? time.toISOString() : undefined}>{validTime ? time.toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}</time>
            </span>
          );
        })}
      </div>
    </div>
  );
}
