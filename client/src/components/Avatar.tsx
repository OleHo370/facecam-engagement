// Deterministic initials and colors keep camera-off tiles consistent across
// the meeting view and dashboard.
const PALETTE = ["#3b6ea5", "#3f7d5c", "#8a6a3f", "#2f8a7a", "#5c7a8a", "#8a5c5c"];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, size = 64 }: { name: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-medium text-white/90"
      style={{ width: size, height: size, background: colorFor(name), fontSize: size * 0.34 }}
    >
      {initialsFor(name)}
    </div>
  );
}
