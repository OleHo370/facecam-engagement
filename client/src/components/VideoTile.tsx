import { forwardRef, useEffect, useRef, useState } from "react";

import { Avatar } from "./Avatar";
import { FlagIcon, MicOffIcon, SignalOffIcon } from "../lib/icons";
import type { FlagKind } from "../lib/studentTracking";
import type { EngagementScores } from "../types";

// Status colors are paired with text in the dashboard; urgent states also use
// a flag icon so meaning never depends on color alone.
const MOOD_DOT: Record<EngagementScores["engagementStatus"], string> = {
  engaged: "var(--color-success)",
  neutral: "var(--color-muted-foreground)",
  bored: "var(--color-warning)",
};

export interface VideoTileProps {
  stream: MediaStream | null;
  name: string;
  muted?: boolean;
  cameraOn?: boolean;
  micOn?: boolean;
  status?: EngagementScores["engagementStatus"];
  flagged?: FlagKind | null;
  highConfused?: boolean;
  signalLost?: boolean;
}

export const VideoTile = forwardRef<HTMLVideoElement, VideoTileProps>(function VideoTile(
  { stream, name, muted, cameraOn = true, micOn, status, flagged, highConfused, signalLost },
  forwardedRef
) {
  const innerRef = useRef<HTMLVideoElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const el = innerRef.current;
    if (el) el.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const showMoodDot = !flagged && !!status;

  return (
    <div
      className={`relative aspect-video overflow-hidden rounded-lg border border-border bg-card transition-all duration-300 ease-out motion-reduce:transition-none ${
        mounted ? "scale-100 opacity-100" : "scale-95 opacity-0"
      }`}
    >
      {cameraOn ? (
        <video
          ref={(el) => {
            innerRef.current = el;
            if (typeof forwardedRef === "function") forwardedRef(el);
            else if (forwardedRef) forwardedRef.current = el;
          }}
          autoPlay
          playsInline
          muted={muted}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-card">
          <Avatar name={name} size={64} />
        </div>
      )}

      {signalLost && cameraOn && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/80 text-muted-foreground">
          <SignalOffIcon className="h-5 w-5" />
          <span className="text-xs">No signal</span>
        </div>
      )}

      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-xs text-white">
        {micOn === false && <MicOffIcon className="h-3.5 w-3.5 text-danger" aria-label="Microphone muted" />}
        <span>{name}</span>
      </div>

      {(showMoodDot || flagged) && (
        <span className="absolute right-2 top-2 flex items-center gap-1">
          {highConfused && (
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-neutral-950"
              style={{ background: "var(--color-info)" }}
              title="Showing signs of confusion"
            >
              ?
            </span>
          )}
          {flagged ? (
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-black/40"
              style={{ background: "var(--color-danger)" }}
              title={flagged === "confused" ? "Flagged: stuck / confused" : "Flagged: disengaged"}
            >
              <FlagIcon className="h-3 w-3 text-white" />
            </span>
          ) : (
            <span
              className="h-2.5 w-2.5 rounded-full ring-2 ring-black/40 transition-colors duration-300"
              style={{ background: MOOD_DOT[status!] }}
            />
          )}
        </span>
      )}
    </div>
  );
});
