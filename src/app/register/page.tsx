import type { Metadata } from "next";
import Image from "next/image";
import BrushDivider from "@/components/BrushDivider";
import ButtonLink from "@/components/Button";
import Reveal from "@/components/Reveal";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Register",
  description: `Choose solo or team registration for the ${site.title}.`,
};

/* Hero only, centred. The page has one job — send a rider into one of the two
   forms — so everything that competed with that choice has been removed: the
   event fact panels (the Event page carries them) and the solo/team detail
   cards (the forms themselves explain their own format). */
export default function RegisterPage() {
  return (
    <section className="relative overflow-hidden bg-ink text-cream">
      <Image
        src="/images/lancesunset.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-[42%_58%] opacity-35"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-ink/35" />

      <Reveal className="relative mx-auto flex min-h-[68vh] max-w-4xl flex-col items-center justify-center px-6 py-20 text-center sm:py-24">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.35em] text-bronze">
          1st Open Tent-Pegging Championship
        </p>

        <h1 className="mt-4 font-display text-5xl font-bold uppercase leading-[0.9] text-cream sm:text-7xl lg:text-8xl">
          Register
          <span className="mt-2 block italic text-bronze">{site.cupName}</span>
        </h1>

        <p className="mt-6 max-w-2xl text-base leading-7 text-cream/85 sm:text-lg">
          {`Ride alone or bring a section of four. Every rider gets a confirmation code by email, brings it to check-in on ${site.checkInDate}, and only riders who check in are drawn into the brackets.`}
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <ButtonLink href="/register/solo" variant="light">
            Register Solo
          </ButtonLink>
          <ButtonLink href="/register-team" variant="light">
            Register a Team
          </ButtonLink>
        </div>
      </Reveal>

      <BrushDivider className="relative text-sand" />
    </section>
  );
}
