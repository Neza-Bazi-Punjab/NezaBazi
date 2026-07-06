/* Wide brush-stroke swoosh used between sections, like the poster's dividers.
   `flip` mirrors it vertically so strokes can face either section. */
export default function BrushDivider({
  className = "text-bronze",
  flip = false,
}: {
  className?: string;
  flip?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 1440 56"
      preserveAspectRatio="none"
      className={`block h-8 w-full sm:h-12 ${flip ? "-scale-y-100" : ""} ${className}`}
      aria-hidden
    >
      <path
        d="M0 34C120 20 320 8 560 12c260 4 420 22 640 24 100 1 180-3 240-10v14c-90 12-260 16-430 13-250-5-430-24-640-22C230 32 90 40 0 50V34Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M60 42c180-14 420-20 660-14 220 6 420 14 660 4-160 16-400 20-660 14-230-5-460-8-660-4Z"
        fill="currentColor"
        opacity="0.35"
      />
    </svg>
  );
}
