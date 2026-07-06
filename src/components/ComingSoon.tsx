import ButtonLink from "./Button";
import { LogoMark } from "./Logo";

/* Shared placeholder page body for routes that unlock in later phases */
export default function ComingSoon({
  title,
  description,
  phaseNote,
}: {
  title: string;
  description: string;
  phaseNote: string;
}) {
  return (
    <section className="dust-glow flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <LogoMark className="h-16 w-16 text-bronze/70" />
      <h1 className="mt-6 font-display text-4xl font-bold uppercase tracking-wide text-bronze-dark sm:text-5xl">
        {title}
      </h1>
      <p className="mt-2 font-display text-sm font-semibold uppercase tracking-[0.35em] text-bronze">
        Coming soon
      </p>
      <p className="mt-6 max-w-xl text-brown/80">{description}</p>
      <p className="mt-3 max-w-xl text-sm text-brown/60">{phaseNote}</p>
      <ButtonLink href="/" className="mt-10" arrow={false}>
        Back to home
      </ButtonLink>
    </section>
  );
}
