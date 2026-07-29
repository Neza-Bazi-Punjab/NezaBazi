# Brand Assets

The NBP artwork is a single vector path — the hexagon monogram with the rider,
above the `NEZA BAZI PUNJAB` wordmark — in bronze `#b55931`, on a transparent
background.

- `logo.svg` — the full lockup, `viewBox="237 240 612 711"`. Cropped from the
  supplied 1080×1080 square down to the drawn artwork, so it carries no dead
  margin.
- `logo-mark.svg` — the hexagon mark alone, `viewBox="299 240 502 528"`. The
  **same path**: the wordmark simply falls outside the viewport and is clipped,
  so there is one source of truth for the artwork. Used across the site by
  `LogoMark` in [src/components/Logo.tsx](../../src/components/Logo.tsx).
- `logo.png` — raster fallback of the previous artwork, kept for anywhere an
  SVG cannot be used.

The navbar and footer pair `logo-mark.svg` with the wordmark set in live text
rather than using `logo.svg`, because the drawn wordmark is unreadable at the
40px the navbar allows.

`src/app/icon.svg` (the favicon) is derived from `logo-mark.svg`: the same path
recoloured to cream on a bronze rounded tile and scaled to fit a 64px square.
If the mark changes, regenerate both.
