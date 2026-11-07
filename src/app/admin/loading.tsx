/* What an admin menu click shows at once, while the next page loads: a
   placeholder in the page's own place inside the admin layout (the menu stays
   as it is), the same height as the slim page heading, then three muted bars
   in a card. It shows no words or numbers, so nothing on it can be mistaken
   for real data. Having it also lets Next prefetch this state for every link
   in the admin menu, so the click responds before the server does. */
export default function AdminLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading">
      <section className="bg-cream">
        <div className="px-6 pb-2 pt-6 sm:pt-8">
          {/* The heading's two lines: the title (text-3xl, sm:text-4xl) and the intro. */}
          <div aria-hidden="true" className="flex h-9 items-center sm:h-10">
            <div className="h-7 w-48 motion-safe:animate-pulse rounded bg-bronze/15 sm:h-8 sm:w-64" />
          </div>
          <div aria-hidden="true" className="mt-1 flex h-6 items-center">
            <div className="h-4 w-full max-w-md motion-safe:animate-pulse rounded bg-bronze/10" />
          </div>
        </div>
      </section>

      <section className="bg-cream">
        <div className="px-6 pb-12 pt-4 sm:pb-16 sm:pt-6">
          <div aria-hidden="true" className="space-y-4 rounded-lg border border-bronze/20 bg-sand p-5">
            <div className="h-4 w-3/4 motion-safe:animate-pulse rounded bg-bronze/15" />
            <div className="h-4 w-full motion-safe:animate-pulse rounded bg-bronze/10" />
            <div className="h-4 w-2/3 motion-safe:animate-pulse rounded bg-bronze/10" />
          </div>
        </div>
      </section>
    </div>
  );
}
