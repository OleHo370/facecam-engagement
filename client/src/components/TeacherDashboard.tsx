import { useMemo, useState } from "react";

import { EngagementChart } from "./EngagementChart";
import { ChevronLeftIcon, CloseIcon, FlagIcon, SignalOffIcon, VideoOffIcon } from "../lib/icons";
import { concernRank, timeInStatusMs, type StudentState } from "../lib/studentTracking";
import type { EngagementScores } from "../types";

export interface DashboardStudent {
  id: string;
  name: string;
  state: StudentState;
}

const STATUS_LABELS: Record<EngagementScores["engagementStatus"], string> = {
  engaged: "Engaged",
  neutral: "Neutral",
  bored: "Bored",
};

const STATUS_TEXT_COLOR: Record<EngagementScores["engagementStatus"], string> = {
  engaged: "text-success",
  neutral: "text-muted-foreground",
  bored: "text-warning",
};

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function TeacherDashboard({
  students,
  onClose,
  now,
}: {
  students: DashboardStudent[];
  onClose: () => void;
  now: number;
}) {
  const [sortBy, setSortBy] = useState<"concern" | "name">("concern");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const copy = [...students];
    if (sortBy === "name") copy.sort((a, b) => a.name.localeCompare(b.name));
    else copy.sort((a, b) => concernRank(a.state) - concernRank(b.state));
    return copy;
  }, [students, sortBy]);

  const withScores = students.filter((s) => s.state.latest);
  const avgEngagement = withScores.length
    ? Math.round(withScores.reduce((sum, s) => sum + s.state.latest!.engagementPct, 0) / withScores.length)
    : null;
  const flaggedCount = students.filter((s) => s.state.flagged).length;
  const cameraOffCount = students.filter((s) => !s.state.cameraOn).length;

  const selected = selectedId ? students.find((s) => s.id === selectedId) : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Class dashboard"
      className="fixed inset-0 z-50 flex flex-col bg-background animate-[dashboard-in_180ms_ease-out] motion-reduce:animate-none"
    >
      <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-3">
          {selected ? (
            <button
              onClick={() => setSelectedId(null)}
              className="flex cursor-pointer items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeftIcon className="h-4 w-4" /> All students
            </button>
          ) : (
            <h2 className="text-base font-semibold text-foreground">Class dashboard</h2>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close dashboard"
          className="cursor-pointer rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-card-hover hover:text-foreground"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {selected ? (
          <div className="mx-auto max-w-3xl space-y-4">
            <div>
              <h3 className="text-lg font-medium text-foreground">{selected.name}</h3>
              <p className="text-sm text-muted-foreground">
                {selected.state.latest ? STATUS_LABELS[selected.state.latest.engagementStatus] : "No data"} ·{" "}
                {formatDuration(timeInStatusMs(selected.state, now))} in current state
              </p>
            </div>

            <EngagementChart history={selected.state.history} flagLog={selected.state.flagLog} now={now} />

            <div>
              <h4 className="mb-2 text-sm font-medium text-foreground">Flag history this session</h4>
              {selected.state.flagLog.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sustained bored/confused periods yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {selected.state.flagLog
                    .slice()
                    .reverse()
                    .map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FlagIcon className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
                        <span className="capitalize">{f.kind}</span>
                        <span className="text-muted-foreground/70">
                          {new Date(f.startedAt).toLocaleTimeString()} –{" "}
                          {f.endedAt ? new Date(f.endedAt).toLocaleTimeString() : "ongoing"}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-4">
            <div className="grid grid-cols-3 gap-3 sm:max-w-md">
              <Stat label="Avg. engagement" value={avgEngagement != null ? `${avgEngagement}%` : "—"} />
              <Stat label="Flagged now" value={String(flaggedCount)} tone={flaggedCount > 0 ? "alert" : undefined} />
              <Stat label="Camera off" value={String(cameraOffCount)} />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <LegendDot color="var(--color-success)" label="Engaged" />
                <LegendDot color="var(--color-muted-foreground)" label="Neutral" />
                <LegendDot color="var(--color-warning)" label="Bored" />
                <LegendDot color="var(--color-danger)" label="Flagged" />
              </div>
              <div role="group" aria-label="Sort students" className="flex items-center gap-1 rounded-full bg-card p-0.5 text-xs">
                <button
                  onClick={() => setSortBy("concern")}
                  aria-pressed={sortBy === "concern"}
                  className={`cursor-pointer rounded-full px-2.5 py-1 transition-colors ${
                    sortBy === "concern" ? "bg-border-strong text-foreground" : "text-muted-foreground"
                  }`}
                >
                  Needs attention
                </button>
                <button
                  onClick={() => setSortBy("name")}
                  aria-pressed={sortBy === "name"}
                  className={`cursor-pointer rounded-full px-2.5 py-1 transition-colors ${
                    sortBy === "name" ? "bg-border-strong text-foreground" : "text-muted-foreground"
                  }`}
                >
                  Name
                </button>
              </div>
            </div>

            {sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground">No students have joined yet.</p>
            ) : (
              <ul className="space-y-2">
                {sorted.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => setSelectedId(s.id)}
                      className="flex w-full cursor-pointer flex-col gap-2 rounded-lg border border-border bg-card/60 px-4 py-3 text-left transition-colors hover:border-border-strong hover:bg-card sm:grid sm:grid-cols-[1fr_auto_140px_auto] sm:items-center sm:gap-4"
                    >
                      <span className="truncate text-sm font-medium text-foreground">{s.name}</span>

                      <span className="flex items-center justify-between sm:contents">
                        <span className="flex items-center gap-1.5">
                          {s.state.flagged && <FlagIcon className="h-3.5 w-3.5 shrink-0 text-danger" aria-label="Flagged" />}
                          {!s.state.cameraOn && (
                            <VideoOffIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Camera off" />
                          )}
                          {s.state.signalLost && (
                            <SignalOffIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="No signal" />
                          )}
                          {s.state.latest && (
                            <span className={`text-xs font-medium ${STATUS_TEXT_COLOR[s.state.latest.engagementStatus]}`}>
                              {STATUS_LABELS[s.state.latest.engagementStatus]}
                            </span>
                          )}
                        </span>

                        <span className="text-right text-xs text-muted-foreground sm:hidden">
                          {s.state.latest ? formatDuration(timeInStatusMs(s.state, now)) : "—"}
                        </span>
                      </span>

                      <EngagementChart history={s.state.history} compact />

                      <span className="hidden text-right text-xs text-muted-foreground sm:inline">
                        {s.state.latest ? formatDuration(timeInStatusMs(s.state, now)) : "—"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "alert" }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold ${tone === "alert" ? "text-danger" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
