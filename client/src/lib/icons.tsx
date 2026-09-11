// Lightweight monoline icon set for meeting controls and status indicators.
import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps, children: ReactNode) {
  const { className, ...rest } = props;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
      {...rest}
    >
      {children}
    </svg>
  );
}

export function MicIcon(props: IconProps) {
  return base(
    props,
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </>
  );
}

export function MicOffIcon(props: IconProps) {
  return base(
    props,
    <>
      <path d="M9 9v2a3 3 0 0 0 4.24 2.73" />
      <path d="M15 6.34V6a3 3 0 0 0-5.94-.6" />
      <path d="M5 11a7 7 0 0 0 10.34 6.15" />
      <path d="M19 11a7 7 0 0 1-.62 2.88" />
      <path d="M12 18v3" />
      <path d="M3 3l18 18" />
    </>
  );
}

export function VideoIcon(props: IconProps) {
  return base(
    props,
    <>
      <rect x="3" y="6" width="12" height="12" rx="2.5" />
      <path d="M15 10.5l6-3.5v10l-6-3.5" />
    </>
  );
}

export function VideoOffIcon(props: IconProps) {
  return base(
    props,
    <>
      <path d="M15 10.5l6-3.5v10l-6-3.5" />
      <path d="M3 6.5V16a2.5 2.5 0 0 0 2.5 2.5H14" />
      <path d="M15 8V8.5" />
      <path d="M3 3l18 18" />
    </>
  );
}

export function PhoneOffIcon(props: IconProps) {
  return base(
    props,
    <>
      <path d="M4 4l16 16" />
      <path d="M10.5 8.5c-1 .6-1.9 1.4-2.5 2.5-1 1.8 3.7 6.5 5.5 5.5a7 7 0 0 0 2.5-2.5" />
      <path d="M16 8a10 10 0 0 1 3.5 2.6c.4.5.4 1.2 0 1.7l-1.2 1.2" />
      <path d="M8 5.6C6.9 6 6 6.6 5.3 7.3c-.4.5-.4 1.2 0 1.7l1.2 1.2" />
    </>
  );
}

export function DashboardIcon(props: IconProps) {
  return base(
    props,
    <>
      <path d="M3 12h6V4H3z" />
      <path d="M13 20h8V10h-8z" />
      <path d="M13 6h8V4h-8z" />
      <path d="M3 20h6v-4H3z" />
    </>
  );
}

export function FlagIcon(props: IconProps) {
  return base(
    props,
    <>
      <path d="M5 3v18" />
      <path d="M5 4h11l-2.5 3.5L16 11H5" />
    </>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return base(props, <path d="M15 5l-7 7 7 7" />);
}

export function CloseIcon(props: IconProps) {
  return base(props, <path d="M5 5l14 14M19 5L5 19" />);
}

export function SignalOffIcon(props: IconProps) {
  return base(
    props,
    <>
      <path d="M4 20l16-16" />
      <path d="M4 14v6h6" />
      <path d="M10 14v6" />
      <path d="M14 10v10" />
      <path d="M20 4v16" />
    </>
  );
}
