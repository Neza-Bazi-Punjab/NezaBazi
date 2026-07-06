import BrushDivider from "./BrushDivider";

/* Consistent interior-page header band */
export default function PageHeader({
  title,
  intro,
}: {
  title: string;
  intro?: string;
}) {
  return (
    <section className="dust-glow">
      <div className="mx-auto max-w-6xl px-6 pb-10 pt-14 sm:pt-16">
        <h1 className="font-display text-4xl font-bold uppercase tracking-wide text-brown sm:text-5xl">
          {title}
        </h1>
        <svg
          viewBox="0 0 120 8"
          className="mt-3 h-2 w-28 text-bronze"
          aria-hidden
        >
          <path
            d="M2 5.5C20 2.5 45 1.5 70 3c18 1 33 1.5 48 .5-12 2.5-30 3.5-52 3S12 6.5 2 5.5Z"
            fill="currentColor"
          />
        </svg>
        {intro && <p className="mt-6 max-w-2xl leading-7 text-brown/85">{intro}</p>}
      </div>
      <BrushDivider className="text-bronze/60" />
    </section>
  );
}
