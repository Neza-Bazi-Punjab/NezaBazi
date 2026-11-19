import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import Reveal from "@/components/Reveal";
import PageTop from "@/components/redesign/PageTop";
import s from "@/components/redesign/shared.module.css";
import r from "./rules.module.css";

export const metadata: Metadata = {
  title: "Rules",
  description:
    "The official rulebook of the Neza Bazi Punjab Championship, in English and Punjabi: open it here or download the PDF.",
};

const PDF_PATH = "/documents/rules.pdf";

/* The Rulebook page (the agreed draft, handoff/mock-home/rulebook.html): only
   the rulebook, on a dark brown card with Open and Download, and the PDF
   below it. The dimension diagrams and the rules video are left out for now;
   their files stay in public/documents and public/images/diagrams. */
export default function RulesPage() {
  const hasPdf = existsSync(join(process.cwd(), "public", "documents", "rules.pdf"));

  return (
    <div className={`${s.page} ${r.rules}`}>
      <PageTop
        title="Rulebook"
        lead="The official rules of the Neza Bazi Punjab Championship, in English and Punjabi."
      />

      <div className={r.body}>
        <div className={s.wrap}>
          <Reveal className={r.book}>
            <div className={r.bookhead}>
              <div>
                <p className={s.kicker}>Official</p>
                <h2>The Rule Book</h2>
                <p className={r.sub}>Single and Section (Teams) Tent Pegging, in English and Punjabi</p>
              </div>
              {hasPdf ? (
                <div className={r.acts}>
                  <a className={r.cream} href={PDF_PATH} target="_blank" rel="noopener noreferrer">
                    Open
                  </a>
                  <a className={r.cream} href={PDF_PATH} download>
                    Download
                  </a>
                </div>
              ) : (
                <p className={r.soon}>Coming soon</p>
              )}
            </div>

            {/* The pages are drawn by the browser's own PDF viewer, which no
                stylesheet can reach, so its chrome is turned off instead:
                #toolbar=0&navpanes=0 hides the bar and sidebar in Chromium and
                Firefox. Safari keeps its toolbar; Open and Download above work
                either way. */}
            {hasPdf && (
              <div className={r.viewer}>
                <object data={`${PDF_PATH}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`} type="application/pdf">
                  {/* Most phone browsers cannot show a PDF inline at all. */}
                  <p className={r.fallback}>
                    {"Your browser can't show the PDF here. "}
                    <a href={PDF_PATH} target="_blank" rel="noopener noreferrer">
                      Open the rulebook PDF
                    </a>
                    .
                  </p>
                </object>
              </div>
            )}
          </Reveal>
        </div>
      </div>
    </div>
  );
}
