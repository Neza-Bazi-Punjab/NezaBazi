import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import { DocumentIcon, DownloadIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Rules",
  description:
    "Official rules of competition for the Neza Bazi Punjab Championship 2026 — download the full PDF.",
};

const PDF_PATH = "/documents/rules.pdf";

function rulesPdfExists() {
  return existsSync(join(process.cwd(), "public", "documents", "rules.pdf"));
}

export default function RulesPage() {
  const hasPdf = rulesPdfExists();

  return (
    <>
      <PageHeader
        title="Rules of Competition"
        intro="The championship follows internationally recognised tent-pegging rules. Download the official rules document below."
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-bronze/20 pb-6">
            <div className="flex items-center gap-4">
              <DocumentIcon className="h-9 w-9 text-bronze" />
              <div>
                <p className="font-display text-lg font-bold uppercase tracking-wide text-ink">
                  Official Rules
                </p>
                <p className="text-sm text-brown/60">
                  Neza Bazi Punjab Championship 2026
                </p>
              </div>
            </div>
            {hasPdf && (
              <a
                href={PDF_PATH}
                download
                className="inline-flex items-center gap-2.5 rounded-lg bg-bronze px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze-dark"
              >
                <DownloadIcon className="h-4 w-4" />
                Download PDF
              </a>
            )}
          </div>

          <div className="mt-10">
            {hasPdf ? (
              <object
                data={PDF_PATH}
                type="application/pdf"
                className="h-[80vh] w-full rounded-2xl border border-bronze/25"
              >
                <p className="p-6 text-center text-brown/70">
                  Your browser can&apos;t preview PDFs inline.{" "}
                  <a
                    href={PDF_PATH}
                    className="text-bronze underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open the rules PDF directly
                  </a>
                  .
                </p>
              </object>
            ) : (
              <div className="dust-glow flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-bronze/35 px-6 py-24 text-center">
                <DocumentIcon className="h-12 w-12 text-bronze/50" />
                <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-brown/60">
                  Rules document coming soon
                </p>
                <p className="text-xs text-brown/45">
                  Add file: public/documents/rules.pdf
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
