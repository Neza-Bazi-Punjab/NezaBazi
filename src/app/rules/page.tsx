import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import { DocumentIcon, DownloadIcon, PlayIcon } from "@/components/icons";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Rulebook",
  description:
    "The official rulebook of the Neza Bazi Punjab Championship 2026: watch the rules explained on video and download the full PDF.",
};

const PDF_PATH = "/documents/rules.pdf";

function rulesPdfExists() {
  return existsSync(join(process.cwd(), "public", "documents", "rules.pdf"));
}

/* Accepts any YouTube URL shape (watch?v=, youtu.be, shorts, embed) and
   returns the embeddable player URL. */
function youtubeEmbedUrl(url: string) {
  const id = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([\w-]{11})/);
  return id ? `https://www.youtube.com/embed/${id[1]}` : url;
}

export default function RulesPage() {
  const hasPdf = rulesPdfExists();
  const videoUrl = site.rulesVideoUrl;

  return (
    <>
      <PageHeader
        title="Rulebook"
        intro="The championship follows internationally recognised tent-pegging rules. Watch the rules explained on video, or download the official rulebook below."
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-5xl px-6 py-16">
          {/* Rules video */}
          <div className="flex items-center gap-4 border-b border-bronze/20 pb-6">
            <PlayIcon className="h-9 w-9 text-bronze" />
            <div>
              <h2 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
                Rules Explained on Video
              </h2>
              <p className="text-sm text-brown/60">
                A short walkthrough of how every run is judged and scored
              </p>
            </div>
          </div>

          <div className="mt-8">
            {videoUrl ? (
              <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-bronze/25">
                <iframe
                  src={youtubeEmbedUrl(videoUrl)}
                  title="Neza Bazi rules explained"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 h-full w-full"
                />
              </div>
            ) : (
              <div className="dust-glow flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-bronze/35 px-6 py-16 text-center">
                <PlayIcon className="h-12 w-12 text-bronze/50" />
                <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-brown/60">
                  Video coming soon
                </p>
                <p className="text-xs text-brown/45">
                  Set rulesVideoUrl in src/lib/site.ts
                </p>
              </div>
            )}
          </div>

          {/* Rules PDF */}
          <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-b border-bronze/20 pb-6">
            <div className="flex items-center gap-4">
              <DocumentIcon className="h-9 w-9 text-bronze" />
              <div>
                <h2 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
                  Official Rulebook
                </h2>
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
                    Open the rulebook PDF directly
                  </a>
                  .
                </p>
              </object>
            ) : (
              <div className="dust-glow flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-bronze/35 px-6 py-16 text-center">
                <DocumentIcon className="h-12 w-12 text-bronze/50" />
                <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-brown/60">
                  Rulebook document coming soon
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
