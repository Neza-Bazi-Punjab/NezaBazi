import t from "./stats.module.css";

/* Four headline counts for the whole season (not the filtered table). */
export default function SummaryTiles({
  tiles,
  label,
}: {
  tiles: { label: string; value: string; note?: string }[];
  label: string;
}) {
  return (
    <ul aria-label={label} className={t.tiles}>
      {tiles.map((tile) => (
        <li key={tile.label} className={t.tile}>
          <span className={t.l}>{tile.label}</span>
          <span className={t.v}>{tile.value}</span>
          {tile.note && <span className={t.n}>{tile.note}</span>}
        </li>
      ))}
    </ul>
  );
}
