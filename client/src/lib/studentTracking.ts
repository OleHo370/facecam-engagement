// Aggregates the ~2 Hz EngagementScores stream into bounded per-student trend
// history and sustained-state alerts for the teacher dashboard.
import type { EngagementScores } from "../types";

export interface HistoryPoint {
  t: number; // ms epoch
  engagementPct: number;
  boredomPct: number;
  confusedPct: number;
  status: EngagementScores["engagementStatus"];
}

export type FlagKind = "bored" | "confused";

export interface FlagEvent {
  kind: FlagKind;
  startedAt: number;
  endedAt: number | null;
}

export interface StudentState {
  latest: EngagementScores | null;
  history: HistoryPoint[];
  statusSince: number; // when `latest.engagementStatus` last changed
  confusedSince: number | null; // when highConfused last became true, if it's currently true
  cameraOn: boolean;
  signalLost: boolean;
  lastSignalAt: number;
  flagged: FlagKind | null;
  flagLog: FlagEvent[];
}

// Configurable persistence thresholds reduce transient alerts. Confusion uses
// a shorter window so teachers can respond promptly when a student needs help.
export const BORED_FLAG_MS = 90_000;
export const CONFUSED_FLAG_MS = 60_000;
export const SIGNAL_LOST_MS = 8_000;

const MAX_HISTORY_POINTS = 1200; // ~10 minutes at 2 samples/sec

export function createStudentState(now = Date.now()): StudentState {
  return {
    latest: null,
    history: [],
    statusSince: now,
    confusedSince: null,
    cameraOn: true,
    signalLost: false,
    lastSignalAt: now,
    flagged: null,
    flagLog: [],
  };
}

/**
 * Folds one incoming score tick into a student's state. Pure function (no
 * mutation) for deterministic testing and React state updates.
 */
export function applyScore(state: StudentState, scores: EngagementScores, now = Date.now()): StudentState {
  const statusChanged = state.latest?.engagementStatus !== scores.engagementStatus;
  const statusSince = statusChanged ? now : state.statusSince;

  const confusedSince = scores.highConfused ? state.confusedSince ?? now : null;

  const history = [...state.history, pointFrom(scores, now)];
  if (history.length > MAX_HISTORY_POINTS) history.splice(0, history.length - MAX_HISTORY_POINTS);

  const boredElapsed = scores.engagementStatus === "bored" ? now - statusSince : 0;
  const confusedElapsed = confusedSince != null ? now - confusedSince : 0;

  const shouldFlagBored = boredElapsed >= BORED_FLAG_MS;
  const shouldFlagConfused = confusedElapsed >= CONFUSED_FLAG_MS;
  // Confusion takes priority when both are true — it's the shorter-fuse,
  // more actionable signal.
  const nextFlag: FlagKind | null = shouldFlagConfused ? "confused" : shouldFlagBored ? "bored" : null;

  const flagLog = updateFlagLog(state.flagLog, state.flagged, nextFlag, now);

  return {
    ...state,
    latest: scores,
    history,
    statusSince,
    confusedSince,
    signalLost: false,
    lastSignalAt: now,
    flagged: nextFlag,
    flagLog,
  };
}

function pointFrom(scores: EngagementScores, t: number): HistoryPoint {
  return {
    t,
    engagementPct: scores.engagementPct,
    boredomPct: scores.boredomPct,
    confusedPct: scores.confusedPct,
    status: scores.engagementStatus,
  };
}

function updateFlagLog(
  log: FlagEvent[],
  prevFlag: FlagKind | null,
  nextFlag: FlagKind | null,
  now: number
): FlagEvent[] {
  if (prevFlag === nextFlag) return log;

  let next = log;
  if (prevFlag) {
    // Close out whichever flag was open.
    next = next.map((e, i) => (i === next.length - 1 && e.endedAt === null ? { ...e, endedAt: now } : e));
  }
  if (nextFlag) {
    next = [...next, { kind: nextFlag, startedAt: now, endedAt: null }];
  }
  return next;
}

export function setCameraOn(state: StudentState, on: boolean): StudentState {
  return { ...state, cameraOn: on, signalLost: false };
}

/**
 * Called on a ticking interval (not per-score-event) so "no score arrived
 * recently" can be detected even though there's no event to react to.
 */
export function checkSignalLost(state: StudentState, now = Date.now()): StudentState {
  if (!state.cameraOn || state.signalLost) return state;
  if (now - state.lastSignalAt < SIGNAL_LOST_MS) return state;
  return { ...state, signalLost: true };
}

export function timeInStatusMs(state: StudentState, now = Date.now()): number {
  return now - state.statusSince;
}

// Lower values represent higher urgency across the roster and dashboard.
export function concernRank(state: StudentState): number {
  if (state.flagged === "confused") return 0;
  if (state.flagged === "bored") return 1;
  if (state.signalLost) return 2;
  if (!state.cameraOn) return 3;
  switch (state.latest?.engagementStatus) {
    case "bored":
      return 4;
    case "neutral":
      return 5;
    case "engaged":
      return 6;
    default:
      return 7; // no data yet
  }
}
