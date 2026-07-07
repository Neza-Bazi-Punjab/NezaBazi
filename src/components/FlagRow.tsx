import Image from "next/image";

/* Flags of participating nations, as on the poster: the Nishan Sahib pennant
   followed by Canada, USA, UK, Italy, Australia and Spain. The national flags
   share an identical fixed-size box (object-cover) so the row stays uniform;
   the transparent triangular pennant renders taller with its natural width so
   its emblem reads at a comparable visual weight. */
type Flag = { name: string; src: string };

const pennant = {
  name: "Nishan Sahib",
  src: "/flags/nishan-sahib.webp",
  width: 1672,
  height: 941,
};

const flags: Flag[] = [
  { name: "Canada", src: "/flags/Canada.svg" },
  { name: "United States", src: "/flags/UnitedStates.webp" },
  { name: "United Kingdom", src: "/flags/UK.webp" },
  { name: "Italy", src: "/flags/Italy.webp" },
  { name: "Australia", src: "/flags/Australia.svg" },
  { name: "Spain", src: "/flags/Spain.webp" },
];

export default function FlagRow({ className = "" }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap items-center gap-3 ${className}`}>
      <li title={pennant.name}>
        <Image
          src={pennant.src}
          alt={pennant.name}
          width={pennant.width}
          height={pennant.height}
          unoptimized
          className="block h-6 w-auto sm:h-7"
        />
      </li>
      {flags.map((flag) => (
        <li
          key={flag.name}
          title={flag.name}
          className="relative h-4 w-6 overflow-hidden rounded-[3px] shadow-sm ring-1 ring-ink/15 sm:h-6 sm:w-[38px]"
        >
          <Image
            src={flag.src}
            alt={flag.name}
            fill
            sizes="30px"
            unoptimized
            className="object-cover"
          />
        </li>
      ))}
    </ul>
  );
}
