# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An installable PWA at `https://gcochrane86.github.io/family-food-planner/`. You and your partner can sign in, share one household, and edit every preference that later phases plan from: members, portions, office days, kitchen, house rules, shopping settings and staples.

**Architecture:** A static React app, built by GitHub Actions and served by GitHub Pages. The app talks directly to Supabase, and row-level security on `household_id` keeps each household's data private. Personal seed data lives in a git-ignored JSON file and is loaded by a local script using the service key. There is no server code in this phase; Edge Functions arrive with the assistant and images.

**Tech Stack:** Vite 5, React 18, TypeScript 5, Tailwind CSS 3.4, React Router 6 (`HashRouter`), `@supabase/supabase-js` 2, `vite-plugin-pwa`, Vitest + Testing Library.

**Spec:** `docs/spec.md` (§2 Architecture, §3 Household profile, §4 Data model, §6 Screens, §11 Phase 1)

## Global Constraints

- No secrets in the repo. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` reach the bundle; `SUPABASE_SERVICE_ROLE_KEY` lives only in the local `.env`.
- The repo is public: personal data (names, birthdate, preferences, staples) must not be committed. It goes in `seed/private/` (git-ignored).
- Every table has `household_id` and row-level security; a signed-in user sees only households they belong to.
- Vite `base: '/family-food-planner/'`. Routing uses `HashRouter`, because GitHub Pages has no SPA fallback.
- **Sign-in is by email one-time code** (`signInWithOtp` then `verifyOtp` with `type: 'email'`), not by magic link. On iOS, a home-screen PWA has separate storage from Safari, so a link opened from Mail would sign in Safari instead of the app.
- Colour tokens, fonts and slot colours come from `mockup/family-food-planner.html` (`:root` block), including the dark-mode versions.
- Layout: phone ~375px and iPad ~820px; 16px side gutter with `max(16px, env(safe-area-inset-*))`; no horizontal scrolling; inputs at least 16px font size (stops iOS zooming).
- Seed values (spec §3):
  - **Members:** You (adult, 1.25), Partner (adult, 1.25), Toddler (child, 0.5)
  - **Office:** you on Monday, always; Wednesday sometimes (stored as `office=false`)
  - **Settings:** `weekday_dinner_max_min` 30, `default_plan_days` 7, `shops_per_week` 2, delivery slots Sunday and Tuesday 19:00–20:00, `delivery_pass` false
  - **Equipment:** tm7, apo, hy24, meater, hob, frying pans, saucepans
  - **Staples:** the 25 pantry items from spec §3, all `have`
  - **House rules:** the rules from spec §3

## Review Focus

1. **The partner signs in and has no household yet.** Expect the "Join with a code" option, not a blank screen. *(Test in Task 4.)*
2. **The sign-in code is mistyped or has expired.** Expect a clear message and the chance to request a new code, without losing the email typed. *(Task 4.)*
3. **A portion weight is empty, 0, negative, or written with a comma (`1,25`).** Expect a comma to be accepted as a decimal point, and values outside 0.1–3 rejected with a message. *(Task 5.)*
4. **Supabase can't be reached (offline or wrong URL).** Expect an error banner with "Try again", never an endless spinner. *(Task 3.)*
5. **The app is opened from the home screen with no session.** Expect it to land on sign-in and, after signing in, return to the screen you asked for. *(Task 4.)*

---

### Task 1: App shell, design tokens, PWA

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/tokens.css`, `src/components/BottomNav.tsx`, `src/screens/Placeholder.tsx`, `public/icon.svg`, `public/icon-192.png`, `public/icon-512.png`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces:
  - routes `#/week`, `#/recipes`, `#/pantry`, `#/shop` (placeholders reading "Arrives in Phase 3") and `#/settings`
  - `<Placeholder title phase />`
  - Tailwind colour names mapped to CSS variables: `bg`, `surface`, `surface-2`, `ink`, `muted`, `line`, `accent`, `yolk`, `teal`, `evening`, `warn`, each with a `-soft` variant where the mockup has one

- [ ] **Step 1: Write a failing test.** `renders bottom nav with Week, Recipes, Pantry, Shop and a Settings link`: render `<App />` and assert the four nav buttons by accessible name, plus a link named "Settings".
- [ ] **Step 2: Run** `npx vitest run src/App.test.tsx`. Expected: FAIL (App not found).
- [ ] **Step 3: Scaffold and implement.**
  - `npm create vite@5` (react-ts), then add Tailwind 3.4, React Router 6, vite-plugin-pwa, Vitest, jsdom and Testing Library.
  - Copy the token block from the mockup into `tokens.css`.
  - Load fonts: Bricolage Grotesque, Figtree and JetBrains Mono from Google Fonts, each with a fallback stack.
  - PWA manifest: `name` "Family Food Planner", `short_name` "Food", `display` "standalone", `start_url` "./", `theme_color` the accent colour.
  - In `index.html`: `viewport-fit=cover` and `apple-mobile-web-app-capable`.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS. `npm run build` succeeds, and `dist/index.html` references `/family-food-planner/assets/`.
- [ ] **Step 5: Commit** with message `feat: app shell, tokens and PWA manifest`.

### Task 2: GitHub Pages deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`, `.env.example`, `README.md`

**Interfaces:**
- Consumes: `npm test`, `npm run build` from Task 1
- Produces: on push to `main`, the workflow runs tests, then builds with repo **variables** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then deploys `dist/` using `actions/upload-pages-artifact@v3` and `actions/deploy-pages@v4`

- [ ] **Step 1: Write the workflow.** It has `permissions: pages: write, id-token: write, contents: read` and a `concurrency: pages` group. Use Node 20 and `npm ci`.
- [ ] **Step 2: Write the README setup checklist** of things only the owner can do:
  1. GitHub: Settings → Pages → Source: GitHub Actions
  2. GitHub: add the two repo variables
  3. Supabase: create the project in the London region
  4. Supabase: Auth → URL config → Site URL = Pages URL
  5. Supabase: email template "Magic Link" body includes `{{ .Token }}`
  6. Supabase: run the migration
  7. Locally: run the seed script
- [ ] **Step 3: Verify.** `npx --yes @action-validator/cli .github/workflows/deploy.yml` (or `actionlint` if installed) reports no errors.
- [ ] **Step 4: Commit** with message `ci: deploy to GitHub Pages`.

### Task 3: Database schema and client

**Files:**
- Create: `supabase/migrations/0001_foundation.sql`, `src/lib/supabase.ts`, `src/lib/types.ts`, `src/components/ErrorBanner.tsx`, `scripts/check-rls.mjs`
- Test: `src/components/ErrorBanner.test.tsx`

**Interfaces:**
- Produces:
  - **Tables** (spec §4 names):
    - `households(id uuid pk, name text, invite_code text unique default substr(md5(random()::text),1,6))`
    - `household_users(household_id, user_id uuid references auth.users, primary key both)`
    - `members(id, household_id, name, kind check in ('adult','child'), birthdate date null, portion_weight numeric(3,2) check between 0.1 and 3)`
    - `member_week_pattern(member_id, weekday smallint 0–6 with Monday as 0, office bool, primary key both)`
    - `settings(household_id pk, data jsonb)`
    - `house_rules(id, household_id, kind check in ('substitute','prefer','avoid'), match text, replacement text null, note text)`
    - `equipment(id, household_id, code text, name text, capabilities jsonb default '{}')`
    - `ingredients(id, household_id, name, category text null, default_unit check in ('g','ml','each'), is_staple bool default false)`
    - `pantry_items(id, household_id, ingredient_id, staple_status check in ('have','low','out') null, qty numeric null, unit text null, location check in ('fridge','freezer','cupboard') default 'cupboard')`
  - **RLS:** on every table, `using/with check (household_id in (select household_id from household_users where user_id = auth.uid()))`. `member_week_pattern` checks through `members`.
  - **RPCs** (`security definer`):
    - `create_household(p_name text) returns uuid`: inserts the household and the caller's membership
    - `join_household(p_code text) returns uuid`: raises `'invalid_code'` if no match
  - **Client:** `supabase` from `src/lib/supabase.ts`. It throws `MissingConfigError` if the env vars are absent and is created with `{ auth: { persistSession: true, flowType: 'pkce' } }`.
  - **Types:** `Member`, `WeekPattern`, `Settings`, `HouseRule`, `Equipment`, `Staple` in `types.ts`
  - **Banner:** `<ErrorBanner message onRetry />`

- [ ] **Step 1: Write a failing test.** `ErrorBanner shows message and calls onRetry`: click "Try again" and assert `onRetry` was called once.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement** the migration SQL, the client, the types and the banner.
- [ ] **Step 4: Run the tests.** Expected: PASS. Run `node scripts/check-rls.mjs` (reads `.env`). With no session, `select * from members` must return 0 rows, and it prints `RLS OK`. This only runs after the owner applies the migration, so note it as a pending verification if Supabase isn't set up yet.
- [ ] **Step 5: Commit** with message `feat: foundation schema with RLS and Supabase client`.

### Task 4: Sign in, household onboarding, auth guard

**Files:**
- Create: `src/auth/AuthProvider.tsx`, `src/auth/SignIn.tsx`, `src/auth/Onboarding.tsx`, `src/auth/RequireHousehold.tsx`
- Modify: `src/App.tsx` (wrap routes)
- Test: `src/auth/SignIn.test.tsx`, `src/auth/RequireHousehold.test.tsx`

**Interfaces:**
- Consumes: `supabase`, `create_household`, `join_household`, `ErrorBanner`
- Produces: `useAuth(): { session, householdId: string | null, loading, refreshHousehold(): Promise<void> }`. `RequireHousehold` renders sign-in, onboarding or children, and keeps the requested route so it can return there after sign-in.

- [ ] **Step 1: Write failing tests** (Supabase mocked with `vi.mock('../lib/supabase')`):
  - `sends a code then verifies it`: type an email, then "Send code" calls `signInWithOtp({ email, options: { shouldCreateUser: true } })`. Type `123456`, then "Sign in" calls `verifyOtp({ email, token: '123456', type: 'email' })`.
  - `wrong code shows message and keeps email`: `verifyOtp` rejects. The page shows "That code didn't work. Check it or send a new one." and the email field still holds its value.
  - `signed in without household shows create and join`: the session exists and `householdId` is null. Expect a "Create our household" button and an "I have a code" input.
  - `join with bad code shows message`: the RPC error `invalid_code` shows "No household has that code."
  - `returns to requested route after sign in`: start at `#/settings` with no session, sign in, and expect the Settings heading.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** `householdId` comes from `select household_id from household_users limit 1`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit** with message `feat: email-code sign in and household onboarding`.

### Task 5: Household logic and data access

**Files:**
- Create: `src/lib/household.ts`, `src/lib/repo.ts`
- Test: `src/lib/household.test.ts`

**Interfaces:**
- Produces:
  - `parseWeight(input: string): { ok: true, value: number } | { ok: false, error: string }`. Accepts `1.25` and `1,25`. The error text is "Enter a number between 0.1 and 3".
  - `householdPortions(members: Member[]): number`: the sum of weights, rounded to 2 decimal places
  - `nextStaple(s: 'have'|'low'|'out'): 'have'|'low'|'out'`: cycles have → low → out → have
  - `DEFAULT_SETTINGS: Settings`: the values from Global Constraints
  - `validateSettings(s: unknown): Settings`: fills missing keys from the defaults and clamps `weekday_dinner_max_min` to 10–120
  - `repo`: an object with `listMembers`, `saveMember`, `deleteMember`, `getWeekPattern`, `setOffice(memberId, weekday, office)`, `getSettings`, `saveSettings`, `listRules`, `saveRule`, `deleteRule`, `listEquipment`, `saveEquipment`, `deleteEquipment`, `listStaples`, `setStaple(pantryItemId, status)`, `addStaple(name)`. Each is async, takes `householdId` first where relevant, and throws `Error` with Supabase's message.

- [ ] **Step 1: Write failing tests:**
  - `parseWeight`: `'1,25'` gives 1.25; `''`, `'0'`, `'-1'`, `'3.5'` and `'abc'` give an error
  - `householdPortions`: the seed members give 3
  - `nextStaple`: a full cycle
  - `validateSettings({})` deep-equals `DEFAULT_SETTINGS`; `{weekday_dinner_max_min: 5}` is clamped to 10
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** `household.ts`, then `repo.ts` as thin wrappers around `supabase.from(...)`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit** with message `feat: household logic and data access`.

### Task 6: Preferences screens

**Files:**
- Create: `src/screens/settings/SettingsHome.tsx`, `Household.tsx`, `WeekPattern.tsx`, `Kitchen.tsx`, `HouseRules.tsx`, `Shopping.tsx`, `Staples.tsx`, `src/screens/settings/useAsync.ts`
- Test: `src/screens/settings/Household.test.tsx`, `Staples.test.tsx`, `WeekPattern.test.tsx`

**Interfaces:**
- Consumes: `repo`, `parseWeight`, `householdPortions`, `nextStaple`, `validateSettings`, `useAuth`, `ErrorBanner`
- Produces: routes `#/settings` (index list), plus `#/settings/household`, `/week`, `/kitchen`, `/rules`, `/shopping` and `/staples`. The household screen shows "Household dinner = 3.0 portions", recalculated live. It also shows the invite code with a Copy button.

- [ ] **Step 1: Write failing tests** (`repo` mocked):
  - `Household`: change the toddler weight to `0,75` and blur. `saveMember` is called with 0.75, and the total reads 3.25. Typing `0` shows "Enter a number between 0.1 and 3" and doesn't save.
  - `WeekPattern`: toggle "Wed" for You and expect `setOffice(youId, 2, true)`.
  - `Staples`: tap "Paprika · Have" and expect `setStaple(id, 'low')` with the label changing to "Low"; if `repo` rejects, the label reverts and an ErrorBanner shows.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the screens, matching the mockup's styling (cards, pills, the segmented have/low/out control). Saves are optimistic and roll back on error.
- [ ] **Step 4: Run** `npx vitest run`. Expected: all PASS.
- [ ] **Step 5: Commit** with message `feat: preferences screens`.

### Task 7: Private seed data and seed script

**Files:**
- Create: `seed/household.example.json` (generic placeholder values; committed), `seed/private/household.json` (real values from spec §3; **git-ignored**, never committed), `scripts/seed.mjs`, `scripts/seedSchema.mjs`
- Test: `scripts/seedSchema.test.mjs`

**Interfaces:**
- Consumes: the tables from Task 3; `.env` keys `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; CLI argument `--household <uuid>`
- Produces: `validateSeed(json): string[]`, which returns a list of problems (empty means valid). `seed.mjs` upserts members, week pattern, settings, equipment, house rules and staples for the given household. It is idempotent: it matches on name or code.

- [ ] **Step 1: Write failing tests.** `validateSeed(example)` returns `[]`. A member with weight 5 reports `members[0].portion_weight out of range`. A missing `settings` key reports `settings missing`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement**, then write `seed/private/household.json` with the spec §3 values.
- [ ] **Step 4: Verify.**
  - Tests PASS.
  - `git check-ignore seed/private/household.json` prints the path.
  - `git status` doesn't list it.
- [ ] **Step 5: Commit** with message `feat: seed script with private household data` (the example file and scripts only).

---

**Pending owner actions (not code):** the README checklist from Task 2. The first `git push` needs you to sign in as `gcochrane86` in the terminal.
