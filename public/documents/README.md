# Rules Document

Drop the official rules PDF here as `rules.pdf`:

```
public/documents/rules.pdf
```

The [/rules](../../src/app/rules/page.tsx) page checks for this file at build
time — once it exists, the page automatically switches from the "coming
soon" placeholder to an embedded viewer with a download link. Rebuild
(`npm run build`) or restart the dev server after adding the file.

## Dimension diagrams

Three separate reference sheets sit alongside the rulebook, listed in the
Dimensions section of the same page with View and Download buttons:

```
public/documents/ground-dimensions.pdf
public/documents/barshi-dimensions.pdf
public/documents/peg-dimensions.pdf
```

Each is listed only when its file is present, so a missing one drops out
rather than producing a dead link. Filenames are lowercase and hyphenated on
purpose: spaces become `%20` in URLs and get mangled by some clients.

To add another diagram, drop the PDF here and add an entry to the `diagrams`
array in [the rules page](../../src/app/rules/page.tsx).

Each diagram is paired with a compressed image under
`public/images/diagrams/<slug>.jpg`, which is what the Rulebook page shows in
the card grid and the full-size modal. The PDF is the download. A diagram
appears only when **both** files exist, so a half-added diagram drops out
rather than rendering a broken card.
