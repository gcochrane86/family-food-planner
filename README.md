# Family Food Planner

Weekly meal planning, pantry and shopping for our household. The full product spec is in [docs/spec.md](docs/spec.md), and there's a clickable mockup in [mockup/](mockup/family-food-planner.html).

- **App:** React + Vite PWA, hosted on GitHub Pages at https://gcochrane86.github.io/family-food-planner/
- **Data:** Supabase (Postgres + Auth), protected by row-level security
- **Personal data** (names, preferences, staples) never goes in this public repo. It lives in Supabase and in the git-ignored `seed/private/` folder.

## One-time setup (owner only)

### GitHub
1. **Settings → Pages → Build and deployment → Source:** choose **GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables:** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, using the values from step 2 below.

### Supabase (personal account)
1. Create a project called `family-food-planner` in the **London (eu-west-2)** region.
2. Under **Project Settings → API**, copy the Project URL and the `anon` key into the GitHub variables above and into a local `.env` (see `.env.example`). Copy the `service_role` key into `.env` only.
3. Under **Authentication → URL Configuration**, set **Site URL** to `https://gcochrane86.github.io/family-food-planner/`.
4. Under **Authentication → Email Templates → Magic Link**, make sure the body contains `{{ .Token }}`. The app signs in with a 6-digit code rather than a link, because a link opened from Mail on iPhone would sign in Safari instead of the home-screen app. Example body:
   ```html
   <h2>Your Family Food Planner code</h2>
   <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
   ```
5. Under **SQL Editor**, paste and run `supabase/migrations/0001_foundation.sql`.

### First sign-in and seed data
1. Open the app, sign in with your email and the code, and tap **Create our household**.
2. Copy the household ID shown under **Settings → Household**.
3. Locally, run:
   ```bash
   npm install
   npm run seed -- --household <household-id>
   ```
4. Your partner signs in on their own phone and joins with the **invite code** from Settings → Household.

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # unit and component tests
npm run build    # production build into dist/
npm run check-rls  # checks signed-out users can't read household data
```
