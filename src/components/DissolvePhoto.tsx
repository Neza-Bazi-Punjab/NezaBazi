import Image from "next/image";

/* Event photo that dissolves into the section background at its edges,
   echoing the poster's soft-masked imagery. Size/aspect come from className.
   Match the aspect to the file's own ratio when the subject reaches the frame
   edge: object-cover crops whatever the box does not fit, and on these photos
   the lance is the first thing to go.
   `fade="wide"` feathers over a longer run for photos shown large, where the
   default 15% is short enough to read as an edge. */
export default function DissolvePhoto({
  src,
  alt,
  className = "",
  sizes = "(max-width: 1024px) 100vw, 50vw",
  fade = "default",
  imageClassName = "",
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  fade?: "default" | "wide";
  /* Object-position overrides for photos deliberately cropped away from
     centre — e.g. anchoring to the bottom to cut empty sky. */
  imageClassName?: string;
}) {
  return (
    <div
      className={`${
        fade === "wide" ? "photo-dissolve-wide" : "photo-dissolve"
      } relative overflow-hidden ${className}`}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        className={`object-cover ${imageClassName}`}
      />
    </div>
  );
}
