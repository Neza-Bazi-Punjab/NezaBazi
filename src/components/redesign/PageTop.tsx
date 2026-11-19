import Reveal from "@/components/Reveal";
import { HairlineBreak } from "./Breaks";
import s from "./shared.module.css";

/* The redesign's plain page header (as on Gallery): a centred title and one
   line on near-white, then the Hairlines break into the page colour below.
   `small` is the shorter band the sign-in, account and privacy pages share
   (the main pages keep the full-size one). */
export default function PageTop({
  title,
  lead,
  below = "#f2e4d2",
  small = false,
}: {
  title: string;
  lead: string;
  below?: string;
  small?: boolean;
}) {
  return (
    <>
      <header className={small ? `${s.top} ${s.topSmall}` : s.top}>
        <Reveal className={s.wrap}>
          <h1 className={s.h1}>{title}</h1>
          <p className={s.lead}>{lead}</p>
        </Reveal>
      </header>
      <HairlineBreak from="#fffdf9" to={below} />
    </>
  );
}
