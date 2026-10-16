# Family Food Planner

A household meal-planning PWA: React + Vite + TypeScript on GitHub Pages, with Supabase (Postgres + RLS, Auth,
Storage, Edge Functions) behind it. The product spec is `docs/spec.md`, and each phase's plan is in
`docs/superpowers/plans/`.

## Working here
- `npm test` runs everything (Vitest, including the Supabase migrations in in-memory Postgres). `npm run build`
  builds the app.
- Pushes to `main` deploy through `.github/workflows/deploy.yml`.
- **Secrets:** only `VITE_SUPABASE_URL` and the publishable key go in the bundle.
  - The secret key lives in `.env` on this Mac. Never put it in `.env.example` or commit it.
  - Edge Function secrets: `GOOGLE_AI_API_KEY`, `CRON_SECRET`.
- **Privacy:** the repo is public. Personal data and recipe content live in Supabase and in the git-ignored
  `seed/private/`.
- **Shared logic for app and Edge Functions** lives in `supabase/functions/_shared/` (planner, schedule, hero
  prompt): pure TS that the app imports too.
- **Database changes** go in a new numbered file in `supabase/migrations/`. The owner runs it in the Supabase SQL
  Editor.

## Playbooks (tasks done in the owner's Chrome)
- Fill the Sainsbury's basket: `docs/playbooks/sainsburys-basket.md`
- Add a recipe from a pasted link: `docs/playbooks/recipe-import.md`
- Sync approved menus to Cookidoo, and import Cookidoo recipes: `docs/playbooks/cookidoo.md`
- Always ask before acting on Sainsbury's, Cookidoo or email. Never check out, book slots or enter payment details.
