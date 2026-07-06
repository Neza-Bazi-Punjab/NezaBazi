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

## Notes

- Event photography uses styled placeholder slots — see
  [public/images/README.md](public/images/README.md) for the file names to
  drop in.
- Site-wide details (event date, venue, contact email, domain) live in
  [src/lib/site.ts](src/lib/site.ts). The domain is currently a placeholder.
- `/register`, `/login`, `/players` and `/rankings` are placeholder pages that
  unlock in later phases.
