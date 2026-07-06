/* Simplified mini flags of participating countries, as on the poster:
   club pennant, Canada, USA, UK, Italy, Australia, Spain. */

const flagDefs: { name: string; svg: React.ReactNode }[] = [
  {
    name: "Neza Bazi Punjab club pennant",
    svg: (
      <>
        <path d="M0 0h24l-9 8 9 8H0V0Z" fill="#1e2a52" />
        <path d="M0 2.5h20.5L13 8l7.5 5.5H0v-11Z" fill="#e8b23a" />
      </>
    ),
  },
  {
    name: "Canada",
    svg: (
      <>
        <rect width="24" height="16" fill="#fff" />
        <rect width="6" height="16" fill="#d52b1e" />
        <rect x="18" width="6" height="16" fill="#d52b1e" />
        <path
          d="M12 3.5l1 2 1.7-.6-.6 2.1 1.9.9-1.6 1.1.4 1.9-2-.7-.3 2.3h-1l-.3-2.3-2 .7.4-1.9L8 7.9l1.9-.9-.6-2.1 1.7.6 1-2Z"
          fill="#d52b1e"
        />
      </>
    ),
  },
  {
    name: "United States",
    svg: (
      <>
        <rect width="24" height="16" fill="#fff" />
        {[0, 2, 4, 6, 8, 10, 12, 14].map((y) => (
          <rect key={y} y={y} width="24" height="1.23" fill="#b22234" />
        ))}
        <rect width="10" height="8.6" fill="#3c3b6e" />
        {[1.5, 3.5, 5.5, 7.5].flatMap((x) =>
          [1.5, 4, 6.5].map((y) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="0.55" fill="#fff" />
          )),
        )}
      </>
    ),
  },
  {
    name: "United Kingdom",
    svg: (
      <>
        <rect width="24" height="16" fill="#012169" />
        <path d="M0 0l24 16M24 0 0 16" stroke="#fff" strokeWidth="3.2" />
        <path d="M0 0l24 16M24 0 0 16" stroke="#c8102e" strokeWidth="1.3" />
        <path d="M12 0v16M0 8h24" stroke="#fff" strokeWidth="5.4" />
        <path d="M12 0v16M0 8h24" stroke="#c8102e" strokeWidth="3.2" />
      </>
    ),
  },
  {
    name: "Italy",
    svg: (
      <>
        <rect width="8" height="16" fill="#009246" />
        <rect x="8" width="8" height="16" fill="#fff" />
        <rect x="16" width="8" height="16" fill="#ce2b37" />
      </>
    ),
  },
  {
    name: "Australia",
    svg: (
      <>
        <rect width="24" height="16" fill="#012169" />
        <path d="M0 0l10 7M10 0 0 7" stroke="#fff" strokeWidth="1.6" />
        <path d="M5 0v7M0 3.5h10" stroke="#fff" strokeWidth="2.4" />
        <path d="M5 0v7M0 3.5h10" stroke="#c8102e" strokeWidth="1.3" />
        <circle cx="5" cy="12" r="1.1" fill="#fff" />
        <circle cx="17" cy="3" r="0.8" fill="#fff" />
        <circle cx="20.5" cy="6" r="0.8" fill="#fff" />
        <circle cx="17" cy="9.5" r="0.8" fill="#fff" />
        <circle cx="14" cy="6.5" r="0.7" fill="#fff" />
      </>
    ),
  },
  {
    name: "Spain",
    svg: (
      <>
        <rect width="24" height="16" fill="#aa151b" />
        <rect y="4" width="24" height="8" fill="#f1bf00" />
      </>
    ),
  },
];

export default function FlagRow({ className = "" }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap items-center gap-3 ${className}`}>
      {flagDefs.map((flag) => (
        <li
          key={flag.name}
          className="overflow-hidden rounded-[3px] shadow-sm ring-1 ring-ink/15"
          title={flag.name}
        >
          <svg
            viewBox="0 0 24 16"
            className="block h-4 w-6 sm:h-5 sm:w-[30px]"
            role="img"
            aria-label={flag.name}
          >
            {flag.svg}
          </svg>
        </li>
      ))}
    </ul>
  );
}
