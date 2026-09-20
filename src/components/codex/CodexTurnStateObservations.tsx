import type { CodexTurnStateObservation } from "../../types/codexLocalAccess";
import "./CodexTurnStateObservations.css";

const lengths = [292, 312, 332, 356] as const;

interface Props {
  accountId: string;
  enabled: boolean;
  observations: CodexTurnStateObservation[];
}

export function CodexTurnStateObservations({ accountId, enabled, observations }: Props) {
  return (
    <div className="codex-turn-state" aria-label="Codex Turn-State 上游响应头观测">
      <span className="codex-turn-state-label" title="仅记录 API 服务上游响应头长度，不代表令牌有效或账号状态">
        Turn-State{!enabled ? " (监听已关闭)" : ""}
      </span>
      <div className="codex-turn-state-values">
        {lengths.map((length) => {
          const observation = observations.find((item) => item.accountId === accountId && item.length === length);
          const time = observation ? new Date(observation.observedAt) : null;
          const validTime = time && !Number.isNaN(time.getTime());
          return (
            <span
              className="codex-turn-state-value"
              key={length}
              title={validTime
                ? `${length} 字符：${time.toLocaleString()}${observation?.model ? ` · ${observation.model}` : ""}；仅为上游响应头观测`
                : `${length} 字符：尚未观察到上游响应头`}
            >
              <b>{length}</b> {validTime ? time.toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}
            </span>
          );
        })}
      </div>
    </div>
  );
}
