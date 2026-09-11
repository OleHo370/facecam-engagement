import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { io, type Socket } from "socket.io-client";

import { VideoTile } from "../components/VideoTile";
import { StudentCard } from "../components/StudentCard";
import { ControlsBar } from "../components/ControlsBar";
import { TeacherDashboard } from "../components/TeacherDashboard";
import { callPeer, closeAllPeers, closePeer, getLocalStream, handleSignal, stopLocalStream } from "../lib/webrtc";
import { startEngagementScorer } from "../lib/engagementScorer";
import {
  applyScore,
  checkSignalLost,
  concernRank,
  createStudentState,
  setCameraOn as setStateCameraOn,
  type StudentState,
} from "../lib/studentTracking";
import type { ClientToServerEvents, EngagementScores, Role, ServerToClientEvents } from "../types";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Toast {
  id: string;
  text: string;
}

export function MeetingPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const myName = searchParams.get("name") || "Guest";
  const navigate = useNavigate();

  const [role, setRole] = useState<Role | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [peerCameraOn, setPeerCameraOn] = useState<Record<string, boolean>>({});
  const [students, setStudents] = useState<Record<string, StudentState>>({});
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [now, setNow] = useState(Date.now());

  const socketRef = useRef<AppSocket | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const cameraOnRef = useRef(true);
  const studentsRef = useRef<Record<string, StudentState>>({});
  const namesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    cameraOnRef.current = cameraOn;
  }, [cameraOn]);

  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  useEffect(() => {
    namesRef.current = names;
  }, [names]);

  function addToast(text: string) {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }

  useEffect(() => {
    let stopScoring: (() => void) | undefined;
    let cancelled = false;

    const socket: AppSocket = io();
    socketRef.current = socket;

    (async () => {
      let stream: MediaStream;
      try {
        stream = await getLocalStream();
      } catch {
        if (!cancelled) setCameraError("Couldn't access your camera/microphone. Check permissions and reload.");
        return;
      }
      if (cancelled) return;
      setLocalStream(stream);

      function trackStudent(id: string, peerRole: Role) {
        if (peerRole !== "student") return;
        setStudents((prev) => (prev[id] ? prev : { ...prev, [id]: createStudentState() }));
      }

      socket.on("joined", ({ role, peers }) => {
        setRole(role);
        setNames((prev) => {
          const next = { ...prev };
          peers.forEach((p) => (next[p.id] = p.name));
          return next;
        });
        setRoles((prev) => {
          const next = { ...prev };
          peers.forEach((p) => (next[p.id] = p.role));
          return next;
        });
        peers.forEach((p) => trackStudent(p.id, p.role));

        peers.forEach((p) => {
          callPeer(p.id, socket, (peerId, remoteStream) => {
            setRemoteStreams((prev) => ({ ...prev, [peerId]: remoteStream }));
          });
        });

        if (role === "student" && localVideoRef.current) {
          stopScoring = startEngagementScorer(localVideoRef.current, (scores) => {
            if (!cameraOnRef.current) return; // camera off: nothing real to score
            socket.emit("engagement-score", scores);
          });
        }
      });

      socket.on("peer-joined", ({ id, name, role: peerRole }) => {
        setNames((prev) => ({ ...prev, [id]: name }));
        setRoles((prev) => ({ ...prev, [id]: peerRole }));
        trackStudent(id, peerRole);
      });

      socket.on("signal", (payload) => {
        handleSignal(payload, socket, (peerId, remoteStream) => {
          setRemoteStreams((prev) => ({ ...prev, [peerId]: remoteStream }));
        });
      });

      socket.on("engagement-update", ({ studentId, ...scores }: { studentId: string } & EngagementScores) => {
        const existing = studentsRef.current[studentId] ?? createStudentState();
        const prevFlag = existing.flagged;
        const next = applyScore(existing, scores);
        studentsRef.current = { ...studentsRef.current, [studentId]: next };
        setStudents((prev) => ({ ...prev, [studentId]: next }));

        if (next.flagged && next.flagged !== prevFlag) {
          const label = namesRef.current[studentId] ?? "A student";
          addToast(
            next.flagged === "confused"
              ? `${label} looks stuck — confused for over a minute.`
              : `${label} has been disengaged for a while.`
          );
        }
      });

      socket.on("camera-state-update", ({ studentId, on }) => {
        setPeerCameraOn((prev) => ({ ...prev, [studentId]: on }));
        setStudents((prev) => (prev[studentId] ? { ...prev, [studentId]: setStateCameraOn(prev[studentId], on) } : prev));
      });

      socket.on("peer-left", ({ id }) => {
        closePeer(id);
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setStudents((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setPeerCameraOn((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      });

      socket.emit("join-room", { roomId: roomId!, name: myName });
    })();

    return () => {
      cancelled = true;
      stopScoring?.();
      socket.disconnect();
      closeAllPeers();
      stopLocalStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Drives "time in status" / signal-lost freshness for the sidebar and
  // dashboard without waiting on the next score event to arrive.
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      setStudents((prev) => {
        let changed = false;
        const next: Record<string, StudentState> = {};
        for (const [studentId, state] of Object.entries(prev)) {
          const checked = checkSignalLost(state);
          next[studentId] = checked;
          if (checked !== state) changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  function toggleMic() {
    const next = !micOn;
    setMicOn(next);
    localStream?.getAudioTracks().forEach((t) => (t.enabled = next));
  }

  function toggleCamera() {
    const next = !cameraOn;
    setCameraOn(next);
    localStream?.getVideoTracks().forEach((t) => (t.enabled = next));
    socketRef.current?.emit("camera-state", { on: next });
  }

  function hangUp() {
    navigate("/");
  }

  const isTeacher = role === "teacher";

  if (cameraError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center text-foreground">
        <div className="max-w-sm space-y-2">
          <p className="text-lg font-medium">Camera unavailable</p>
          <p className="text-sm text-muted-foreground">{cameraError}</p>
        </div>
      </div>
    );
  }

  const sortedStudentIds = Object.keys(students).sort((a, b) => concernRank(students[a]) - concernRank(students[b]));
  const flaggedCount = Object.values(students).filter((s) => s.flagged).length;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="text-sm text-muted-foreground">
          Room <span className="text-foreground">{roomId}</span>
        </span>
        <span className="text-sm text-muted-foreground">
          {role ? (isTeacher ? "You are the teacher" : "You are a student") : "Connecting…"}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 gap-4 overflow-y-auto p-4">
        <div className="grid flex-1 auto-rows-[minmax(160px,1fr)] grid-cols-[repeat(auto-fit,minmax(220px,1fr))] content-start gap-4">
          <VideoTile
            ref={localVideoRef}
            stream={localStream}
            name={`${myName} (you)`}
            muted
            cameraOn={cameraOn}
            micOn={micOn}
          />
          {Object.entries(remoteStreams).map(([peerId, stream]) => {
            const student = students[peerId];
            const showMood = isTeacher && roles[peerId] === "student";
            return (
              <VideoTile
                key={peerId}
                stream={stream}
                name={names[peerId] ?? peerId}
                cameraOn={peerCameraOn[peerId] ?? true}
                status={showMood ? student?.latest?.engagementStatus : undefined}
                flagged={showMood ? student?.flagged : undefined}
                highConfused={showMood ? student?.latest?.highConfused : undefined}
                signalLost={showMood ? student?.signalLost : undefined}
              />
            );
          })}
        </div>

        {isTeacher && (
          <aside className="hidden w-72 shrink-0 flex-col gap-2 overflow-y-auto lg:flex">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Students</h2>
              <span className="text-xs text-muted-foreground">{sortedStudentIds.length}</span>
            </div>
            {sortedStudentIds.length === 0 && (
              <p className="px-1 text-xs text-muted-foreground">Waiting for students to join…</p>
            )}
            {sortedStudentIds.map((peerId) => (
              <StudentCard
                key={peerId}
                name={names[peerId] ?? peerId}
                state={students[peerId]}
                onClick={() => setDashboardOpen(true)}
              />
            ))}
          </aside>
        )}
      </div>

      <ControlsBar
        micOn={micOn}
        cameraOn={cameraOn}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        isTeacher={isTeacher}
        dashboardOpen={dashboardOpen}
        onToggleDashboard={() => setDashboardOpen((v) => !v)}
        flaggedCount={flaggedCount}
        onHangup={hangUp}
      />

      {isTeacher && dashboardOpen && (
        <TeacherDashboard
          students={sortedStudentIds.map((id) => ({ id, name: names[id] ?? id, state: students[id] }))}
          onClose={() => setDashboardOpen(false)}
          now={now}
        />
      )}

      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed right-4 top-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto animate-[toast-in_180ms_ease-out] rounded-lg border border-warning/30 bg-card px-3.5 py-2.5 text-sm text-foreground shadow-lg motion-reduce:animate-none"
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
