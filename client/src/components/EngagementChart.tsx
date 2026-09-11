import type { FlagEvent, HistoryPoint } from "../lib/studentTracking";

// Custom SVG visualization combining engagement, boredom, and confusion
// trends with a status timeline. Dash patterns supplement color so each
// series remains distinguishable for users with color-vision deficiencies.
const WIDTH = 640;
const CHART_HEIGHT = 160;
const STRIP_HEIGHT = 20;
const STRIP_GAP = 10;
const PAD_X = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 8;

const STATUS_COLOR: Record<HistoryPoint["status"], string> = {
  engaged: "var(--color-success)",
  neutral: "var(--color-muted-foreground)",
  bored: "var(--color-warning)",
};

const LINES: {
  key: keyof Pick<HistoryPoint, "engagementPct" | "boredomPct" | "confusedPct">;
  color: string;
  dash?: string;
  label: string;
}[] = [
  { key: "engagementPct", color: "var(--color-success)", label: "Engagement" },
  { key: "boredomPct", color: "var(--color-warning)", dash: "6 4", label: "Boredom" },
  { key: "confusedPct", color: "var(--color-info)", dash: "1.5 3.5", label: "Confusion" },
];

function xScale(t: number, minT: number, maxT: number) {
  const span = Math.max(1, maxT - minT);
  return PAD_X + ((t - minT) / span) * (WIDTH - PAD_X * 2);
}

function yScale(pct: number) {
  const usable = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
  return PAD_TOP + usable - (pct / 100) * usable;
}

export function EngagementChart({
  history,
  flagLog = [],
  now = Date.now(),
  compact = false,
}: {
  history: HistoryPoint[];
  flagLog?: FlagEvent[];
  now?: number;
  compact?: boolean;
}) {
  if (history.length < 2) {
    if (compact) return <div className="h-8 text-xs text-muted-foreground">No data yet</div>;
    return (
      <div className="flex h-[190px] items-center justify-center rounded-lg border border-border bg-card/50 text-sm text-muted-foreground">
        Not enough data yet — trends appear after a few seconds of video.
      </div>
    );
  }

  const minT = history[0].t;
  const maxT = history[history.length - 1].t;

  const totalHeight = CHART_HEIGHT + STRIP_GAP + STRIP_HEIGHT;

  if (compact) {
    return (
      <svg viewBox={`0 0 ${WIDTH} ${CHART_HEIGHT / 3}`} className="h-8 w-full" preserveAspectRatio="none" aria-hidden>
        {LINES.map((line) => {
          const points = history
            .map((p) => `${xScale(p.t, minT, maxT)},${(CHART_HEIGHT / 3) * (1 - p[line.key] / 100)}`)
            .join(" ");
          return (
            <polyline
              key={line.key}
              points={points}
              fill="none"
              strokeWidth={1.25}
              opacity={0.9}
              style={{ stroke: line.color, strokeDasharray: line.dash }}
            />
          );
        })}
      </svg>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <svg viewBox={`0 0 ${WIDTH} ${totalHeight}`} className="w-full" role="img" aria-label="Engagement trend chart">
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line
              x1={PAD_X}
              x2={WIDTH - PAD_X}
              y1={yScale(v)}
              y2={yScale(v)}
              style={{ stroke: "var(--color-border)" }}
              strokeWidth={1}
            />
            <text x={0} y={yScale(v) + 3} fontSize={10} style={{ fill: "var(--color-muted-foreground)" }}>
              {v}
            </text>
          </g>
        ))}

        {LINES.map((line) => {
          const points = history.map((p) => `${xScale(p.t, minT, maxT)},${yScale(p[line.key])}`).join(" ");
          return (
            <polyline
              key={line.key}
              points={points}
              fill="none"
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{ stroke: line.color, strokeDasharray: line.dash }}
            />
          );
        })}

        <g transform={`translate(0, ${CHART_HEIGHT + STRIP_GAP})`}>
          <rect x={PAD_X} y={0} width={WIDTH - PAD_X * 2} height={STRIP_HEIGHT} style={{ fill: "var(--color-background)" }} rx={3} />
          {history.map((p, i) => {
            const next = history[i + 1];
            if (!next) return null;
            const x = xScale(p.t, minT, maxT);
            const w = Math.max(0.5, xScale(next.t, minT, maxT) - x);
            return <rect key={p.t} x={x} y={0} width={w} height={STRIP_HEIGHT} style={{ fill: STATUS_COLOR[p.status] }} />;
          })}
          {flagLog.map((f, i) => {
            const start = xScale(f.startedAt, minT, maxT);
            const end = xScale(f.endedAt ?? now, minT, maxT);
            return (
              <rect
                key={i}
                x={start}
                y={STRIP_HEIGHT - 4}
                width={Math.max(1, end - start)}
                height={4}
                style={{ fill: "var(--color-danger)" }}
              />
            );
          })}
        </g>
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {LINES.map((line) => (
          <span key={line.key} className="flex items-center gap-1.5">
            <svg width="16" height="8" aria-hidden="true">
              <line
                x1="0"
                y1="4"
                x2="16"
                y2="4"
                strokeWidth={2}
                style={{ stroke: line.color, strokeDasharray: line.dash }}
              />
            </svg>
            {line.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-danger" />
          Flagged period
        </span>
      </div>
    </div>
  );
}
