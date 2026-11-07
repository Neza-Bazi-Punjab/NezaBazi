import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";

/* "Demo closed for the event": what /judge/demo and /commentary/demo show
   once an administrator has closed the shared practice demo, in the same
   style as StaffGate, so a forgotten practice page can never be mistaken for
   the real panel on event day. One way out: the real panel. */
export default function DemoClosed({
  title,
  livePanel,
  livePanelLabel,
}: {
  /* Page title, e.g. "Judges' Panel — Training". */
  title: string;
  /* The real panel, e.g. "/judge". */
  livePanel: string;
  /* Its button, e.g. "Open the judges' panel". */
  livePanelLabel: string;
}) {
  return (
    <>
      <PageHeader title={title} intro="Practice is closed for the event." />

      <section className="bg-cream">
        <div className="mx-auto max-w-xl px-6 py-16">
          <SectionHeading>Demo closed for the event</SectionHeading>

          <div className="mt-10 space-y-6">
            <p className="leading-7 text-brown/85">
              The practice demo is closed, so nothing here can be mistaken for the real results. Use
              the live panel instead.
            </p>

            <Link
              href={livePanel}
              className="block w-full rounded-lg bg-bronze-deep px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze"
            >
              {livePanelLabel}
            </Link>

            <p className="text-sm leading-6 text-brown/70">
              An administrator can reopen the demo on the scoring page.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
