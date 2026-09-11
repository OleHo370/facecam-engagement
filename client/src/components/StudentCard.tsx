import { FlagIcon, SignalOffIcon, VideoOffIcon } from "../lib/icons";
import { timeInStatusMs, type StudentState } from "../lib/studentTracking";
import type { EngagementScores } from "../types";

const STATUS_STYLES: Record<EngagementScores["engagementStatus"], string> = {
  engaged: "bg-success/10 text-success",
  neutral: "bg-muted-foreground/10 text-muted-foreground",
  bored: "bg-warning/10 text-warning",
};

const STATUS_LABELS: Record<EngagementScores["engagementStatus"], string> = {
  engaged: "Engaged",
  neutral: "Neutral",
  bored: "Bored",
};

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function StudentCard({
  name,
  state,
  onClick,
}: {
  name: string;
  state?: StudentState;
  onClick?: () => void;
}) {
  const scores = state?.latest;

  return (
    <button
      onClick={onClick}
      className="w-full cursor-pointer space-y-2 rounded-lg border border-border bg-card/60 p-3 text-left transition-colors duration-150 hover:border-border-strong hover:bg-card"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-foreground">{name}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          {state?.flagged && (
            <span className="flex items-center gap-1 rounded-full bg-danger/15 px-1.5 py-0.5 text-xs font-medium text-danger">
              <FlagIcon className="h-3 w-3" aria-hidden="true" />
              {state.flagged === "confused" ? "Stuck" : "Bored"}
            </span>
          )}
          {state && !state.cameraOn && (
            <span role="img" aria-label="Camera off" className="text-muted-foreground">
              <VideoOffIcon className="h-3.5 w-3.5" />
            </span>
          )}
          {state?.signalLost && (
            <span role="img" aria-label="No signal" className="text-muted-foreground">
              <SignalOffIcon className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </div>

      {scores ? (
        <div className="flex items-center justify-between text-xs">
          <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLES[scores.engagementStatus]}`}>
            {STATUS_LABELS[scores.engagementStatus]}
          </span>
          <span className="text-muted-foreground">{formatDuration(timeInStatusMs(state!))}</span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Waiting for signal…</p>
      )}
    </button>
  );
}
