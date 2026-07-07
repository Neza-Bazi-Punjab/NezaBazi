import Image from "next/image";

/* Event photo that dissolves into the section background at its edges,
   echoing the poster's soft-masked imagery. Size/aspect come from className. */
export default function DissolvePhoto({
  src,
  alt,
  className = "",
  sizes = "(max-width: 1024px) 100vw, 50vw",
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
}) {
  return (
    <div className={`photo-dissolve relative overflow-hidden ${className}`}>
      <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" />
    </div>
  );
}
