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
4. Under **Authentication → Email Templates**, edit **both** the **Magic Link** and **Confirm signup** templates so the body shows the code. Brand-new users get the Confirm signup email, existing users get Magic Link. The app signs in with a code rather than a link, because a link opened from Mail on iPhone would sign in Safari instead of the home-screen app. Example body for both:
   ```html
   <h2>Your Family Food Planner code</h2>
   <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
   ```
5. Under **Authentication → Providers → Email**, check that the **Email OTP length** is **6**, which is what the app expects.
6. **Email sending limit:** Supabase's built-in email service only sends a few sign-in emails per hour. That's enough for two people signing in once, but a couple of "Send a new code" taps can hit it. If that happens, wait a few minutes. To remove the limit, set up custom SMTP under **Project Settings → Authentication → SMTP Settings**; the free tiers of Resend or Postmark work.
7. Under **SQL Editor**, paste and run `supabase/migrations/0001_foundation.sql`.

### First sign-in and seed data
1. Open the app, sign in with your email and the code, and tap **Create our household**.
2. Copy the household ID shown under **Settings → Household**.
3. Locally, run:
   ```bash
   npm install
   npm run seed -- --household <household-id>
   ```
4. Your partner signs in on their own phone and joins with the **invite code** from Settings → Household.
5. **Once you've both signed in, close sign-ups:** **Authentication → Sign In / Providers → turn off "Allow new users to sign up"**. Nobody else can then create an account to try invite codes. Turn it back on if you ever need to add someone.

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # unit and component tests
npm run build    # production build into dist/
npm run check-rls  # checks signed-out users can't read household data
```
