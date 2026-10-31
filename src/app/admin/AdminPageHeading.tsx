/* The slim heading every admin page uses: the page title and one line under
   it, instead of the site's tall page banner, so the page's own content starts
   high. Like the content under it, it starts a fixed gap from the admin menu
   and is not centred, so collapsing the menu widens the page instead of
   moving it. */
export default function AdminPageHeading({ title, intro }: { title: string; intro: string }) {
  return (
    <section className="bg-cream">
      <div className="px-6 pb-2 pt-6 sm:pt-8">
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-brown sm:text-4xl">
          {title}
        </h1>
        <p className="mt-1 text-brown/80">{intro}</p>
      </div>
    </section>
  );
}
