/* Poster-style heading: bold display type with a short brush-stroke underline */
export default function SectionHeading({
  children,
  invert = false,
  className = "",
}: {
  children: React.ReactNode;
  invert?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <h2
        className={`font-display text-3xl font-bold uppercase tracking-wide sm:text-4xl ${
          invert ? "text-cream" : "text-bronze-dark"
        }`}
      >
        {children}
      </h2>
      <svg
        viewBox="0 0 120 8"
        className={`mt-2 h-2 w-28 ${invert ? "text-cream/70" : "text-bronze"}`}
        aria-hidden
      >
        <path
          d="M2 5.5C20 2.5 45 1.5 70 3c18 1 33 1.5 48 .5-12 2.5-30 3.5-52 3S12 6.5 2 5.5Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}
