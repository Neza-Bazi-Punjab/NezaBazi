/* Circular brush-ring badge around a highlight icon, as on the poster */
export default function IconBadge({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`relative inline-flex h-24 w-24 items-center justify-center text-bronze ${className}`}
    >
      <svg viewBox="0 0 96 96" className="absolute inset-0" aria-hidden>
        <circle
          cx="48"
          cy="48"
          r="42"
          fill="none"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeDasharray="200 22 30 14"
          opacity="0.85"
        />
        <circle
          cx="48"
          cy="48"
          r="38"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeDasharray="60 30 90 40"
          opacity="0.4"
        />
      </svg>
      {children}
    </span>
  );
}
