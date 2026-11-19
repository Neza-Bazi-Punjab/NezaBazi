import { site } from "@/lib/site";
import s from "./shared.module.css";

/* The YouTube and Instagram marks used by the 2026 redesign's pages. */
const YT =
  "M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.8 15V9l5.8 3-5.8 3Z";
const IG =
  "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4ZM17.3 5.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4ZM12 2.2c2.7 0 3 0 4 .1 2.7.1 4 1.4 4.1 4.1.1 1.1.1 1.4.1 4s0 3-.1 4c-.1 2.7-1.4 4-4.1 4.1-1 .1-1.3.1-4 .1s-3 0-4-.1c-2.7-.1-4-1.4-4.1-4.1-.1-1-.1-1.4-.1-4s0-3 .1-4C4 3.6 5.3 2.3 8 2.2c1-.1 1.3-.1 4-.1Z";

export function InstagramMark({ className = s.igicon }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d={IG} />
    </svg>
  );
}

/* The two round icon links (YouTube channel, Instagram). */
export function SocialIcons({ className = "" }: { className?: string }) {
  return (
    <span className={className}>
      <a
        className={s.icon}
        title="YouTube"
        aria-label="YouTube"
        href={site.youtube}
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={YT} />
        </svg>
      </a>
      <a
        className={s.icon}
        title="Instagram"
        aria-label="Instagram"
        href={site.instagram}
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={IG} />
        </svg>
      </a>
    </span>
  );
}
