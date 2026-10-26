import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";

/* The Login required / Access denied / could-not-check screens for the staff
   panels, in the same style as /admin. The panels hide the site chrome, so
   each state carries its own way out. */
export default function StaffGate({
  kind,
  title,
  audience,
  redirectTo,
}: {
  kind: "login" | "denied" | "error";
  /* Page title, e.g. "Judges' Panel". */
  title: string;
  /* Who the page is for, e.g. "judges and administrators". */
  audience: string;
  /* Where to come back to after logging in, e.g. "/judge". */
  redirectTo: string;
}) {
  const linkClass =
    "block w-full rounded-lg bg-bronze-deep px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze";

  const content =
    kind === "login"
      ? {
          intro: `This page requires a login for ${audience}.`,
          heading: "Login Required",
          body: `You must be logged in as one of the ${audience} to view this page.`,
          href: `/login?redirect=${redirectTo}`,
          action: "Log In",
        }
      : kind === "denied"
        ? {
            intro: `This page is for ${audience} only.`,
            heading: "Access Denied",
            body: `Access denied — this page is for ${audience} only. Ask an administrator to give your account the right role.`,
            href: "/",
            action: "Back to Home",
          }
        : {
            intro: "Your access could not be checked.",
            heading: "Try Again",
            body: "We could not check your access just now. Check the connection and reload the page.",
            href: redirectTo,
            action: "Reload",
          };

  return (
    <>
      <PageHeader title={title} intro={content.intro} />

      <section className="bg-cream">
        <div className="mx-auto max-w-xl px-6 py-16">
          <SectionHeading>{content.heading}</SectionHeading>

          <div className="mt-10 space-y-6">
            <p className="leading-7 text-brown/85">{content.body}</p>

            <Link href={content.href} className={linkClass}>
              {content.action}
            </Link>

            {kind !== "denied" && (
              <Link
                href="/"
                className="block text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-brown/70 hover:text-bronze"
              >
                Back to Home
              </Link>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
