# Rules Document

Drop the official rules PDF here as `rules.pdf`:

```
public/documents/rules.pdf
```

The [/rules](../../src/app/rules/page.tsx) page checks for this file at build
time — once it exists, the page automatically switches from the "coming
soon" placeholder to an embedded viewer with a download link. Rebuild
(`npm run build`) or restart the dev server after adding the file.
