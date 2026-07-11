# Neza Bazi Punjab Championship 2026

Official website for the Neza Bazi Punjab Championship 2026 — the 1st open
tent-pegging championship, held **August 21, 2026 in Gurdaspur, Punjab** with
international participation.

Built with Next.js (App Router), TypeScript and Tailwind CSS v4.

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build
```

## Project roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Public website & design | ✅ Done |
| 2 | Supabase setup + player registration/login | Planned |
| 3 | Player profiles + event registration | Planned |
| 4 | Admin dashboard + score entry | Planned |
| 5 | Rankings/stats + audit log & security review | Planned |

## Project structure

```
src/
  app/                 App Router routes (one folder per page)
    layout.tsx         Root layout: fonts, <Navbar>, <Footer>, metadata
    page.tsx           Home page (hero with all key facts, schedule,
                       categories, highlights)
    globals.css        Tailwind v4 theme (@theme) + shared animation tokens
    about/ rules/      Content pages (About incl. contact, Rulebook)
    register/          Registration info page ("opens soon")
    login/ players/ rankings/    Unlinked "coming soon" pages (later phases)
    sitemap.ts icon.svg
  components/           Reusable UI (Navbar, Footer, Button, DissolvePhoto,
                        Reveal, icons, section building blocks, …)
  lib/site.ts          Single source of truth for event details, nav links
public/                Static assets: images/, flags/, brand/, documents/
```

The nav is deliberately just three tabs — Home, About, Rulebook — plus the
Login link and the Register Now button (`/register` has no tab of its own;
it's reached via the button, page CTAs and the footer). Contact channels
(email, phone, Instagram, YouTube) live in the footer and on the About page.
Per the organisers, no clubs, sponsors or organising bodies are named
anywhere on the site.

Each component starts with a one-line comment describing what it does; shared
event details (date, venue, contact, domain) live in
[src/lib/site.ts](src/lib/site.ts) — the domain is currently a placeholder.

## Notes

- Contextual photos live in [public/images](public/images/README.md) and use
  the `DissolvePhoto` component, which masks their edges so they melt into the
  parchment background, echoing the poster.
- `/login`, `/players` and `/rankings` are unlinked placeholder pages that
  unlock in later phases; `/register` describes the registration flow until
  online registration opens (Phase 2). A gallery returns after the
  championship (August 21, 2026) once match-day photography exists.
- The logo mark comes from [public/brand](public/brand/README.md); the
  favicon is a derived single-tone version at [src/app/icon.svg](src/app/icon.svg).
- `/rules` (the Rulebook tab) embeds a PDF from `public/documents/rules.pdf`
  when present (see [public/documents/README.md](public/documents/README.md))
  and a YouTube rules video once `rulesVideoUrl` is set in
  [src/lib/site.ts](src/lib/site.ts); until then each shows a "coming soon"
  placeholder. The YouTube channel link (`youtube`) is a placeholder too.
