import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import Image from "next/image";
import PageHeader from "@/components/PageHeader";
import { DocumentIcon, DownloadIcon, PlayIcon } from "@/components/icons";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Rulebook",
  description:
    "The official rulebook of the Neza Bazi Punjab Championship 2026: download the full rulebook PDF in English and Punjabi, the ground, barshi and peg dimension sheets, and watch the rules explained on video.",
};

const PDF_PATH = "/documents/rules.pdf";

/* Dimension diagrams. Each one is two files: a compressed image for reading
   on the page (thumbnail plus a full-size modal) and the print-quality PDF
   for download, which is the format the diagrams were specified as. A diagram
   is listed only when both files are present, the same way the rulebook is. */
const SPEC_GRID_ID = "dimension-diagrams";

const diagrams = [
  {
    title: "Ground Dimensions",
    tagline: "Track length, peg and crossing lines, arena width",
    slug: "ground-dimensions",
    alt: "Ground specifications diagram: track length, start, peg and crossing lines, and arena width",
    width: 1066,
    height: 1600,
  },
  {
    title: "Barshi Dimensions",
    tagline: "Lance length, straightness, tip, grips and material",
    slug: "barshi-dimensions",
    alt: "Barshi specifications diagram: permitted lance length, metal point, grips and material",
    width: 1200,
    height: 1600,
  },
  {
    title: "Peg Dimensions",
    tagline: "Fatti and Aarhi peg sizes and ground placement",
    slug: "peg-dimensions",
    alt: "Peg specifications diagram: Fatti and Aarhi peg measurements and how each is set in the ground",
    width: 1066,
    height: 1600,
  },
];

function publicFileExists(...segments: string[]) {
  return existsSync(join(process.cwd(), "public", ...segments));
}

function rulesPdfExists() {
  return publicFileExists("documents", "rules.pdf");
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
  const availableDiagrams = diagrams
    .filter(
      (diagram) =>
        publicFileExists("images", "diagrams", `${diagram.slug}.jpg`) &&
        publicFileExists("documents", `${diagram.slug}.pdf`)
    )
    .map((diagram) => ({
      ...diagram,
      image: `/images/diagrams/${diagram.slug}.jpg`,
      pdf: `/documents/${diagram.slug}.pdf`,
      modalId: `${diagram.slug}-full`,
    }));

  return (
    <>
      <PageHeader
        title="Rulebook"
        intro={`The official rulebook of the ${site.title} — ${site.cupName}. Download the rulebook PDF in English and Punjabi, or watch the rules explained on video.`}
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-5xl px-6 py-16">
          {/* The rulebook, framed to match the dimension panel below.
              The pages themselves are drawn by the browser's own PDF viewer,
              which no stylesheet can reach — so the grey chrome is removed
              instead: #toolbar=0&navpanes=0 hides the viewer's bar and
              sidebar in Chromium and Firefox, leaving just the page on our
              own background. Safari ignores those parameters and keeps its
              toolbar; the download and open-in-tab actions live in our header
              strip either way, so nothing depends on the viewer's controls. */}
          <div className="overflow-hidden rounded-2xl border border-bronze/25 bg-ink text-cream">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-bronze/35 px-5 py-5 sm:px-6">
              <div className="flex items-center gap-4">
                <DocumentIcon className="h-9 w-9 shrink-0 text-bronze" />
                <div>
                  <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-bronze">
                    Official
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-bold uppercase leading-none text-cream sm:text-3xl">
                    Rule Book
                  </h2>
                  <p className="mt-2 text-sm leading-5 text-cream/70">
                    {`${site.cupName} — Single & Section (Teams) Tent Pegging, in English and Punjabi`}
                  </p>
                </div>
              </div>

              {hasPdf ? (
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={PDF_PATH}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-cream/35 px-4 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream transition-colors hover:border-bronze hover:text-bronze"
                  >
                    Open in New Tab
                  </a>
                  <a
                    href={PDF_PATH}
                    download
                    className="inline-flex items-center gap-2 rounded-lg bg-bronze px-5 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-bronze-dark"
                  >
                    <DownloadIcon className="h-3.5 w-3.5" />
                    Download
                  </a>
                </div>
              ) : (
                <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-cream/60">
                  Coming soon
                </p>
              )}
            </div>

            {hasPdf && (
              <div className="bg-sand p-3 sm:p-5">
                <object
                  data={`${PDF_PATH}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                  type="application/pdf"
                  className="h-[78vh] w-full rounded-xl border border-bronze/25 bg-cream"
                >
                  {/* Most mobile browsers cannot render a PDF inline at all. */}
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
          </div>

          {/* Dimension diagrams. Read on the page as compressed images, with a
              full-size modal built on the CSS :target pseudo-class so the
              enlarge behaviour needs no JavaScript and no dependency. Each
              card also links the print-quality PDF, which is the format the
              diagrams were specified as. */}
          {availableDiagrams.length > 0 && (
            <div
              id={SPEC_GRID_ID}
              className="mt-14 overflow-hidden rounded-2xl border border-bronze/25 bg-ink text-cream"
            >
              <div className="border-b border-bronze/35 px-5 py-7 sm:px-8 sm:py-8">
                <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-bronze">
                  Official Measurements
                </p>
                <h2 className="mt-2 font-display text-4xl font-bold uppercase leading-none text-cream sm:text-5xl">
                  Ground &amp; Equipment
                  <span className="block italic text-bronze">Dimensions</span>
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-cream/75">
                  Reference diagrams for the competition ground, the barshi and
                  the peg. Tap any diagram to inspect it full size, or download
                  the print-quality sheet.
                </p>
              </div>

              <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
                {availableDiagrams.map((diagram) => (
                  <article
                    key={diagram.slug}
                    className="group flex flex-col rounded-2xl border border-bronze/35 bg-cream p-4 text-ink shadow-lg shadow-black/10 transition-[border-color,transform,box-shadow] duration-[var(--dur-base)] ease-[var(--ease-soft)] hover:border-bronze motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-2xl"
                  >
                    <div className="border-b border-bronze/20 pb-3">
                      <p className="font-display text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-bronze">
                        Tap to Inspect
                      </p>
                      <h3 className="mt-1 font-display text-xl font-bold uppercase leading-tight text-ink">
                        {diagram.title}
                      </h3>
                      <p className="mt-1 text-sm leading-5 text-brown/70">
                        {diagram.tagline}
                      </p>
                    </div>

                    <a
                      href={`#${diagram.modalId}`}
                      className="mt-4 block overflow-hidden rounded-2xl border border-bronze/25 bg-sand transition-transform duration-[var(--dur-base)] ease-[var(--ease-soft)] motion-safe:group-hover:scale-[1.02]"
                    >
                      <Image
                        src={diagram.image}
                        alt={diagram.alt}
                        width={diagram.width}
                        height={diagram.height}
                        sizes="(max-width: 640px) calc(100vw - 4rem), (max-width: 1024px) calc(50vw - 3rem), 288px"
                        className="h-72 w-full object-contain p-2 sm:h-80 lg:h-72"
                      />
                    </a>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <a
                        href={`#${diagram.modalId}`}
                        className="inline-flex rounded-lg bg-bronze px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-bronze-dark"
                      >
                        View Full Size
                      </a>
                      <a
                        href={diagram.pdf}
                        download
                        className="inline-flex items-center gap-2 rounded-lg border border-bronze/40 px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-brown transition-colors hover:border-bronze hover:text-bronze"
                      >
                        <DownloadIcon className="h-3.5 w-3.5" />
                        PDF
                      </a>
                    </div>
                  </article>
                ))}
              </div>

              {availableDiagrams.map((diagram) => (
                <div
                  key={`${diagram.slug}-modal`}
                  id={diagram.modalId}
                  className="fixed inset-0 z-50 hidden items-center justify-center px-4 py-6 target:flex"
                >
                  <a
                    href={`#${SPEC_GRID_ID}`}
                    className="absolute inset-0 bg-ink/75"
                    aria-label={`Close ${diagram.title}`}
                  />
                  <div className="relative z-10 flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-bronze/25 bg-cream shadow-2xl">
                    <div className="flex items-center justify-between gap-4 border-b border-bronze/20 bg-sand px-4 py-3">
                      <h3 className="font-display text-sm font-bold uppercase tracking-[0.15em] text-bronze-dark">
                        {diagram.title}
                      </h3>
                      <div className="flex items-center gap-2">
                        <a
                          href={diagram.pdf}
                          download
                          className="inline-flex items-center gap-2 rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40"
                        >
                          <DownloadIcon className="h-3.5 w-3.5" />
                          PDF
                        </a>
                        <a
                          href={`#${SPEC_GRID_ID}`}
                          className="rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40"
                        >
                          Close
                        </a>
                      </div>
                    </div>
                    <div className="overflow-auto p-3 sm:p-5">
                      <Image
                        src={diagram.image}
                        alt={diagram.alt}
                        width={diagram.width}
                        height={diagram.height}
                        sizes="(max-width: 1024px) calc(100vw - 2rem), 1024px"
                        className="mx-auto h-auto max-h-[82vh] w-auto max-w-full"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
