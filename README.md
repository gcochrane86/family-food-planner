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
2. Under **Project Settings → API Keys** (or the **Connect** button), copy the Project URL and the `anon` / publishable key into the GitHub variables above and into a local `.env` (see `.env.example`). Copy the `service_role` / secret key into `.env` only.
3. Under **SQL Editor → New query**, paste the whole of `supabase/migrations/0001_foundation.sql` and click **Run**.
4. **Create the two accounts:** under **Authentication → Users → Add user → Create new user**, enter an email and password and tick **Auto Confirm User**. Do this once for each of you. Signing in uses email and password, so no emails are sent and no email setup is needed.
5. **Close sign-ups:** under **Authentication → Sign In / Providers**, turn off **Allow new users to sign up**. Only the accounts you created can sign in. To add someone later, create them in step 4.
6. Under **Authentication → URL Configuration**, set **Site URL** to `https://gcochrane86.github.io/family-food-planner/`.

> **Optional: sign in by emailed code instead.** Set `SIGN_IN_METHOD = 'code'` in `src/auth/SignIn.tsx`. Supabase only lets you edit email templates once custom SMTP is set up (**Project Settings → Authentication → SMTP Settings**, e.g. Gmail with an app password). Then put `{{ .Token }}` in the **Magic Link** and **Confirm signup** templates and set the Email OTP length to 6.

### First sign-in and seed data
1. Open the app on your phone, sign in with your email and password, and tap **Create our household**. Add it to your home screen from Safari's Share menu.
2. Copy the household ID shown under **Settings → Household**.
3. Locally, run:
   ```bash
   npm install
   npm run seed -- --household <household-id>
   ```
4. Your partner signs in on their own phone with the account you created for them, taps **I have a code**, and enters the **invite code** from Settings → Household.

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # unit and component tests
npm run build    # production build into dist/
npm run check-rls  # checks signed-out users can't read household data
```
