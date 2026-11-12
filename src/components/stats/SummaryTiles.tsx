/* Four headline counts for the whole season (not the filtered table). */
export default function SummaryTiles({
  tiles,
  label,
}: {
  tiles: { label: string; value: string; note?: string }[];
  label: string;
}) {
  return (
    <ul aria-label={label} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <li
          key={tile.label}
          className="flex min-w-0 flex-col rounded-xl border border-bronze/20 bg-sand px-4 py-4 sm:px-5"
        >
          <span className="order-2 mt-1 font-display text-xs font-semibold uppercase tracking-[0.14em] text-brown/75">
            {tile.label}
          </span>
          <span className="order-1 font-display text-3xl font-bold tabular-nums text-bronze-dark sm:text-4xl">
            {tile.value}
          </span>
          {tile.note && <span className="order-3 mt-1 text-xs text-brown/65">{tile.note}</span>}
        </li>
      ))}
    </ul>
  );
}
