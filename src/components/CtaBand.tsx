import ButtonLink from "./Button";
import DissolvePhoto from "./DissolvePhoto";
import Reveal from "./Reveal";

/* Closing "Register Now" call-to-action band with a dissolving rider photo */
export default function CtaBand() {
  return (
    <section className="dust-glow bg-gradient-to-br from-parchment via-sand to-bronze/25">
      <Reveal className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 sm:py-20 lg:grid-cols-2">
        <DissolvePhoto
          src="/images/fullgallop.webp"
          alt="A rider in orange charges through golden dust at full gallop"
          className="order-last mx-auto aspect-[2/3] w-full max-w-md lg:order-first"
          sizes="(max-width: 1024px) 100vw, 28rem"
        />
        <div className="text-center lg:text-left">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.35em] text-ink">
            Be a part of Punjab&apos;s proud tradition
          </p>
          <p className="text-shadow-warm mt-3 font-display text-5xl font-bold uppercase italic tracking-tight text-bronze sm:text-6xl">
            Register Now
          </p>
          <p className="mt-3 font-display text-lg font-medium uppercase tracking-[0.25em] text-ink">
            And compete for glory!
          </p>
          <ButtonLink href="/register" className="mt-8">
            Register Now
          </ButtonLink>
        </div>
      </Reveal>
    </section>
  );
}
