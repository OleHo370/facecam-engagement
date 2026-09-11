// Mirrors client/src/types.ts to define the shared Socket.IO event contract.

export type Role = "teacher" | "student";

export interface PeerInfo {
  id: string;
  name: string;
  role: Role;
}

// Model outputs surfaced by the dashboard. "Confused" represents the
// combined comprehension-problem head defined in ml/labels.py.
export interface EngagementScores {
  // "neutral" covers the dead zone around the disengaged/engaged decision
  // boundary (see client/src/lib/engagementScorer.ts's NEUTRAL_BAND) so an
  // ambiguous read (e.g. quietly staring at the screen) doesn't get forced
  // into "Bored".
  engagementStatus: "engaged" | "neutral" | "bored";
  engagementPct: number;
  lowEngagement: boolean;
  boredomPct: number;
  highBoredom: boolean;
  confusedPct: number;
  highConfused: boolean;
}

export interface SignalPayload {
  from?: string;
  to?: string;
  data: unknown;
}

export interface ClientToServerEvents {
  "join-room": (data: { roomId: string; name: string }) => void;
  signal: (data: SignalPayload) => void;
  "engagement-score": (data: EngagementScores) => void;
  // Student's own camera toggle, relayed so the teacher can distinguish
  // "camera intentionally off" from a scoring signal that just went quiet.
  "camera-state": (data: { on: boolean }) => void;
}

export interface ServerToClientEvents {
  joined: (data: { role: Role; roomId: string; peers: PeerInfo[] }) => void;
  "peer-joined": (data: PeerInfo) => void;
  "peer-left": (data: { id: string }) => void;
  signal: (data: SignalPayload) => void;
  "engagement-update": (data: { studentId: string } & EngagementScores) => void;
  "camera-state-update": (data: { studentId: string; on: boolean }) => void;
}
