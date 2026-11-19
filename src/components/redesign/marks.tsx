/* Thin line marks for the redesign's controls (the home photo strip, the
   gallery viewer and the replay poster), in place of text arrows and solid
   icons. They draw in currentColor and size to 1em unless styled. */

const line = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  vectorEffect: "non-scaling-stroke",
} as const;

export function ChevronMark({ dir, className }: { dir: "left" | "right"; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" className={className}>
      <path {...line} d={dir === "left" ? "M14.5 5.5 8 12l6.5 6.5" : "M9.5 5.5 16 12l-6.5 6.5"} />
    </svg>
  );
}

export function CloseMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" className={className}>
      <path {...line} d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

export function PlayMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" className={className}>
      <path {...line} d="M8.5 5.5v13l10-6.5z" />
    </svg>
  );
}
