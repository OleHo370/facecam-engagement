import type { ReactNode } from "react";
import { DashboardIcon, MicIcon, MicOffIcon, PhoneOffIcon, VideoIcon, VideoOffIcon } from "../lib/icons";

function ControlButton({
  onClick,
  active,
  danger,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  label: string;
  children: ReactNode;
}) {
  const base =
    "flex h-11 w-11 cursor-pointer items-center justify-center rounded-full transition-all duration-150 active:scale-90 focus-visible:outline-offset-4";
  const tone = danger
    ? "bg-danger text-white hover:bg-red-500"
    : active
    ? "bg-foreground text-background hover:opacity-90"
    : "bg-card-hover text-foreground hover:bg-border-strong";
  return (
    <button onClick={onClick} aria-label={label} aria-pressed={active} className={`${base} ${tone}`}>
      {children}
    </button>
  );
}

export function ControlsBar({
  micOn,
  cameraOn,
  onToggleMic,
  onToggleCamera,
  isTeacher,
  dashboardOpen,
  onToggleDashboard,
  flaggedCount,
  onHangup,
}: {
  micOn: boolean;
  cameraOn: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  isTeacher: boolean;
  dashboardOpen: boolean;
  onToggleDashboard: () => void;
  flaggedCount: number;
  onHangup: () => void;
}) {
  return (
    <footer className="flex items-center justify-center gap-3 border-t border-border bg-background px-4 py-3">
      <ControlButton onClick={onToggleMic} active={!micOn} label={micOn ? "Mute microphone" : "Unmute microphone"}>
        {micOn ? <MicIcon className="h-5 w-5" /> : <MicOffIcon className="h-5 w-5" />}
      </ControlButton>

      <ControlButton onClick={onToggleCamera} active={!cameraOn} label={cameraOn ? "Turn off camera" : "Turn on camera"}>
        {cameraOn ? <VideoIcon className="h-5 w-5" /> : <VideoOffIcon className="h-5 w-5" />}
      </ControlButton>

      {isTeacher && (
        <div className="relative">
          <ControlButton onClick={onToggleDashboard} active={dashboardOpen} label="Toggle class dashboard">
            <DashboardIcon className="h-5 w-5" />
          </ControlButton>
          {flaggedCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white"
            >
              {flaggedCount}
            </span>
          )}
        </div>
      )}

      <ControlButton onClick={onHangup} danger label="Leave call">
        <PhoneOffIcon className="h-5 w-5" />
      </ControlButton>
    </footer>
  );
}
