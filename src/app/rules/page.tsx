import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import { DocumentIcon, DownloadIcon, PlayIcon } from "@/components/icons";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Rulebook",
  description:
    "The official rulebook of the Neza Bazi Punjab Championship 2026: download the full rulebook PDF in English and Punjabi, the ground, barshi and peg dimension sheets, and watch the rules explained on video.",
};

const PDF_PATH = "/documents/rules.pdf";

/* Dimension diagrams, published as their own PDFs alongside the rulebook
   rather than folded into it. Each is listed only when its file is present,
   the same way the rulebook itself is. */
const diagrams = [
  {
    title: "Ground Dimensions",
    file: "ground-dimensions.pdf",
    description: "Track length, peg and crossing lines, and arena width",
  },
  {
    title: "Barshi Dimensions",
    file: "barshi-dimensions.pdf",
    description: "Lance length, weight and tip specification",
  },
  {
    title: "Peg Dimensions",
    file: "peg-dimensions.pdf",
    description: "Peg size, shape and how it is set in the ground",
  },
];

function documentExists(file: string) {
  return existsSync(join(process.cwd(), "public", "documents", file));
}

function rulesPdfExists() {
  return documentExists("rules.pdf");
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
  const availableDiagrams = diagrams.filter((diagram) =>
    documentExists(diagram.file)
  );

  return (
    <>
      <PageHeader
        title="Rulebook"
        intro={`The official rulebook of the ${site.title} — ${site.cupName}. Download the rulebook PDF in English and Punjabi, or watch the rules explained on video.`}
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-5xl px-6 py-16">
          {/* Official rulebook download */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-bronze/20 pb-6">
            <div className="flex items-center gap-4">
              <DocumentIcon className="h-9 w-9 text-bronze" />
              <div>
                <h2 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
                  Official Rule Book
                </h2>
                <p className="text-sm text-brown/60">
                  {`${site.cupName} — Single & Section (Teams) Tent Pegging, in English and Punjabi`}
                </p>
              </div>
            </div>
            {hasPdf ? (
              <a
                href={PDF_PATH}
                download
                className="inline-flex items-center gap-2.5 rounded-lg bg-bronze px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze-dark"
              >
                <DownloadIcon className="h-4 w-4" />
                Download PDF
              </a>
            ) : (
              <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-brown/60">
                Coming soon
              </p>
            )}
          </div>

          {/* Inline preview of the rulebook (browsers without an inline PDF
              viewer — most mobile ones — get a link instead) */}
          {hasPdf && (
            <div className="mt-8">
              <object
                data={PDF_PATH}
                type="application/pdf"
                className="h-[80vh] w-full rounded-2xl border border-bronze/25"
              >
                <div className="dust-glow flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                  <DocumentIcon className="h-12 w-12 text-bronze/50" />
                  <p className="text-sm text-brown/70">
                    {`Your browser can’t preview PDFs inline. `}
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
                </div>
              </object>
            </div>
          )}

          {/* Dimension diagrams, one row per PDF. Deliberately not embedded
              inline: three more 80vh viewers would bury the video below a
              wall of scrolling, and these are reference sheets people open
              or print rather than read on the page. */}
          {availableDiagrams.length > 0 && (
            <>
              <div className="mt-14 flex items-center gap-4 border-b border-bronze/20 pb-6">
                <DocumentIcon className="h-9 w-9 text-bronze" />
                <div>
                  <h2 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
                    Dimensions
                  </h2>
                  <p className="text-sm text-brown/60">
                    Official measurements for the ground, the barshi and the peg
                  </p>
                </div>
              </div>

              <ul className="mt-8 space-y-4">
                {availableDiagrams.map((diagram) => {
                  const href = `/documents/${diagram.file}`;

                  return (
                    <li
                      key={diagram.file}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-bronze/25 bg-sand px-5 py-4"
                    >
                      <div className="flex items-center gap-4">
                        <DocumentIcon className="h-7 w-7 shrink-0 text-bronze" />
                        <div>
                          <h3 className="font-display text-base font-bold uppercase tracking-wide text-ink">
                            {diagram.title}
                          </h3>
                          <p className="text-sm text-brown/60">
                            {diagram.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg border border-bronze/40 px-5 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.15em] text-brown transition-colors hover:border-bronze hover:text-bronze"
                        >
                          View
                        </a>
                        <a
                          href={href}
                          download
                          className="inline-flex items-center gap-2 rounded-lg bg-bronze px-5 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze-dark"
                        >
                          <DownloadIcon className="h-3.5 w-3.5" />
                          Download
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {/* Rules video */}
          <div className="mt-14 flex items-center gap-4 border-b border-bronze/20 pb-6">
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
        </div>
      </section>
    </>
  );
}
