import { useState } from "react";
import { useNavigate } from "react-router-dom";

function randomRoomId() {
  return Math.random().toString(36).slice(2, 8);
}

export function LandingPage() {
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const navigate = useNavigate();

  function createMeeting() {
    navigate(`/meeting/${randomRoomId()}?name=${encodeURIComponent(name.trim() || "Teacher")}`);
  }

  function joinMeeting() {
    if (!roomCode.trim()) {
      setJoinError("Enter a meeting code");
      return;
    }
    navigate(`/meeting/${roomCode.trim()}?name=${encodeURIComponent(name.trim() || "Student")}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              C
            </span>
            <h1 className="text-xl font-semibold tracking-tight">Class Meet</h1>
          </div>
          <p className="text-sm text-muted-foreground">Real-time engagement insights for online classes</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="name" className="text-xs font-medium text-muted-foreground">
            Your name
          </label>
          <input
            id="name"
            className="h-11 w-full rounded-md border border-border-strong bg-card-hover px-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-ring"
            placeholder="Jane Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <button
          onClick={createMeeting}
          className="h-11 w-full cursor-pointer rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-ring active:bg-primary"
        >
          Create meeting <span className="opacity-80">(you'll be the teacher)</span>
        </button>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or join <div className="h-px flex-1 bg-border" />
        </div>

        <div className="space-y-1.5">
          <div className="flex gap-2">
            <input
              className="h-11 flex-1 rounded-md border border-border-strong bg-card-hover px-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-ring"
              placeholder="Meeting code"
              value={roomCode}
              onChange={(e) => {
                setRoomCode(e.target.value);
                setJoinError(null);
              }}
              aria-describedby={joinError ? "join-error" : undefined}
            />
            <button
              onClick={joinMeeting}
              className="h-11 shrink-0 cursor-pointer rounded-md border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-card-hover active:bg-border"
            >
              Join
            </button>
          </div>
          {joinError && (
            <p id="join-error" role="alert" className="text-xs text-danger">
              {joinError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
