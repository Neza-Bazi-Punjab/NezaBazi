import { HorseIcon } from "./icons";

/* Styled slot for event photography. Swap for next/image once real photos
   are added under public/images/ — see public/images/README.md. */
export default function ImagePlaceholder({
  name,
  label,
  className = "",
}: {
  /** Target filename under public/images/, e.g. "hero-rider.jpg" */
  name: string;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={label ?? "Event photo placeholder"}
      className={`dust-glow relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed border-bronze/35 bg-gradient-to-br from-parchment via-sand to-bronze/15 ${className}`}
    >
      <HorseIcon className="h-12 w-12 text-bronze/50" />
      {label && (
        <p className="px-6 text-center font-display text-sm font-semibold uppercase tracking-[0.2em] text-brown/60">
          {label}
        </p>
      )}
      <p className="px-6 text-center text-xs text-brown/45">
        Add photo: public/images/{name}
      </p>
    </div>
  );
}
