/* What a section page shows in the table's place while its rows are still
   being read: the table's card with a muted search bar and six muted rows,
   pulsing gently. It shows no words or numbers, so nothing on it can be
   mistaken for real data, and it is plain markup with no client code. The
   heading above it is already the real one. */
import type { AdminSection } from "./AdminDashboard";

const ROWS = 6;

export default function AdminTableSkeleton({ tab }: { tab: AdminSection }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      data-section={tab}
      className="space-y-4 rounded-lg border border-bronze/20 bg-sand p-5"
    >
      {/* The search box. */}
      <div aria-hidden="true" className="h-12 w-full motion-safe:animate-pulse rounded-lg bg-bronze/10" />

      {/* The rows. */}
      <div aria-hidden="true" className="divide-y divide-bronze/10 rounded-lg border border-bronze/15 bg-cream">
        {Array.from({ length: ROWS }, (_, row) => (
          <div key={row} className="flex items-center gap-4 px-4 py-3">
            <div className="h-4 w-1/4 motion-safe:animate-pulse rounded bg-bronze/15" />
            <div className="h-4 w-1/3 motion-safe:animate-pulse rounded bg-bronze/10" />
            <div className="hidden h-4 w-1/5 motion-safe:animate-pulse rounded bg-bronze/10 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
