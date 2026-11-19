import Reveal from "@/components/Reveal";
import { HairlineBreak } from "./Breaks";
import s from "./shared.module.css";

/* The redesign's plain page header (as on Gallery): a centred title and one
   line on near-white, then the Hairlines break into the page colour below. */
export default function PageTop({
  title,
  lead,
  below = "#f2e4d2",
}: {
  title: string;
  lead: string;
  below?: string;
}) {
  return (
    <>
      <header className={s.top}>
        <Reveal className={s.wrap}>
          <h1 className={s.h1}>{title}</h1>
          <p className={s.lead}>{lead}</p>
        </Reveal>
      </header>
      <HairlineBreak from="#fffdf9" to={below} />
    </>
  );
}
