/* Displays a rider's check-in confirmation code. */
export default function ConfirmationCode({
  code,
  riderName,
  compact = false,
}: {
  code: string;
  riderName?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border-2 border-dashed border-bronze bg-sand text-center ${
        compact ? "px-4 py-3" : "px-6 py-5"
      }`}
    >
      {riderName && (
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-brown/70">
          {riderName}
        </p>
      )}
      <p
        className={`font-mono font-bold tracking-[0.2em] text-bronze-deep ${
          riderName ? "mt-1.5" : ""
        } ${compact ? "text-lg" : "text-3xl sm:text-4xl"}`}
      >
        {code}
      </p>
    </div>
  );
}
