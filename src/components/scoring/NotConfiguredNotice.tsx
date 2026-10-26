import { site } from "@/lib/site";

/* The calm state for every live surface before scoring is set up (the
   scoring tables do not exist yet, or no round has been created). */
export default function NotConfiguredNotice({
  tone = "light",
  title = `Live scoring begins on ${site.eventDate}`,
  children,
  className = "",
}: {
  tone?: "light" | "dark";
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const dark = tone === "dark";

  return (
    <section
      className={`rounded-2xl border px-6 py-10 text-center ${
        dark ? "border-cream/15 bg-white/5 text-cream" : "border-bronze/20 bg-cream text-ink"
      } ${className}`}
    >
      <h2
        className={`font-display text-2xl font-bold uppercase tracking-wide sm:text-3xl ${
          dark ? "text-cream" : "text-bronze-dark"
        }`}
      >
        {title}
      </h2>
      <div className={`mx-auto mt-4 max-w-md leading-7 ${dark ? "text-cream/75" : "text-brown/85"}`}>
        {children ?? (
          <p>
            Start lists, results and standings appear here as each round is ridden in{" "}
            {site.venue}.
          </p>
        )}
      </div>
    </section>
  );
}
