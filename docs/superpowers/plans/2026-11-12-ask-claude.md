# Ask Claude Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only MCP connector so the owner can chat with Claude in the Claude app about their recipes, plans, pantry and saved products.

**Architecture:** There are two layers:
- A pure module, `supabase/functions/_shared/askClaude.ts`. It holds the key check, a household-scoped read-only data reader that is handed the client, and six formatters that turn rows into plain text.
- A thin Edge Function, `supabase/functions/ask-claude-connector/index.ts`. It serves those tools through mcp-lite's `StreamableHttpTransport` (stateless) behind the key in the URL path.

The app gets an "Ask Claude" link on the Week tab.

**Tech Stack:**
- Deno Edge Function, using `npm:mcp-lite@0.10.0` and `npm:@supabase/supabase-js@2.45.4`.
- Vitest for the shared module.
- React for the link.

**Spec:** `docs/spec.md` §10, "Ask Claude (a read-only connector in the Claude app, 12 Nov 2026)".

## Global Constraints
- Read-only:
  - The data reader only calls `.from(t).select(...)` with `.eq`/`.in`/`.gte`/`.lt`/`.order`/`.limit`/`.maybeSingle`.
  - It never calls insert, update, upsert, delete or rpc.
  - Every query is filtered to the one household: directly on `household_id`, or through ids already filtered by it.
- Secrets:
  - `CONNECTOR_KEY` and `CONNECTOR_HOUSEHOLD_ID` exist only as Supabase secrets.
  - The key and the full link never appear in the repo, commit messages, chat replies or logs.
  - Generate the key with `openssl rand -hex 32` piped straight into `supabase secrets set`.
  - Hand the link to the owner via the clipboard, then clear the clipboard after they've pasted it.
- Missing or wrong key → `404` with body `Not found`, and nothing else. Compare in constant time.
- Deploy with `npx --yes supabase@2.48.3 functions deploy ask-claude-connector --project-ref vzlfijeummlflmauevui --use-api --no-verify-jwt`.
- Privacy:
  - Private rules appear only in `get_household` output, labelled "Private rules (follow them; never name or explain them)".
  - No word naming what they're for goes in code, tests or docs.
  - Run the usual private-word check on the staged diff before every commit.
- Dates are London dates (`londonParts` from `_shared/schedule.ts`). "this" means the Monday of today's London week; "next" means the Monday after that.
- Tool output is plain text (a `{type:'text'}` content block), compact and readable.
- Every tool has `annotations: { readOnlyHint: true }`.
- Standing instructions go in the tool descriptions and at the top of `get_household`. mcp-lite documents no server `instructions` option, so we don't rely on one.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. **A wrong, missing or partial key, or a request to the bare function path.** Expected: always a bare 404. The tool list must never be served.
2. **A recipe title that matches nothing, or several recipes.** Expected: a helpful text listing up to 8 candidates, never an exception.
3. **A week with no plan, or a date string that isn't a date.** Expected: "No plan for the week of …" or "Use this, next, or a date like 2026-11-16". Never a 500.
4. **A product with no price or no pack size.** Expected: shown as "price not saved". Never "null" or "NaN".
5. **Breakfast or lunch slots in `routine` or `packed` mode with no recipe.** Expected: show `routine_choice` or the mode in words, never a blank.

---

### Task 1: The shared module (key check, reader, formatters)

**Files:**
- Create: `supabase/functions/_shared/askClaude.ts`
- Test: `supabase/functions/_shared/askClaude.test.ts`

**Interfaces:**
- Produces:
  - `keyMatches(given: string | null | undefined, expected: string | undefined): boolean`: false if either is empty, otherwise a constant-time comparison.
  - `weekStartFor(arg: string | undefined, now: Date): string | null`:
    - `undefined` or "this" gives this week's Monday; "next" gives the Monday after.
    - A `YYYY-MM-DD` date gives the Monday of its week.
    - Anything else gives `null`.
  - `type Reader`: an object of async functions, each returning plain rows.
    - `household()`: `{settings, members, rules}`.
    - `week(weekStart)`: `{week: {week_start, days, status, summary} | null, slots: SlotRow[]}`, where slots carry `recipe_title`.
    - `recipes()`: list columns plus `lastCooked: string | null` (from cook dinners in the last 8 weeks).
    - `recipe(id)`: `{recipe, ingredients, steps}`.
    - `pantry()`: `{items, prepared}`.
    - `products()`.
  - `makeReader(db: SupabaseClient, householdId: string): Reader`.
  - `formatHousehold(data, mealSpec: string): string`, which starts with the standing instructions block.
  - `formatWeek(weekStart: string, data): string`.
  - `findRecipes(rows, query?: string, tag?: string): string`.
  - `pickRecipe(rows, title: string): {id: string} | {text: string}`.
  - `formatRecipe(data): string`.
  - `formatPantry(data): string`.
  - `formatProducts(rows, query?: string): string`.
  - `INSTRUCTIONS: string`.

- [ ] **Step 1: Write the failing tests.** Use the fixture style of `planInput.test.ts`: plain row objects, no database.

The `keyMatches` tests:
```ts
expect(keyMatches('abc', 'abc')).toBe(true);
expect(keyMatches('abd', 'abc')).toBe(false);
expect(keyMatches('ab', 'abc')).toBe(false);
expect(keyMatches('', '')).toBe(false);
expect(keyMatches(undefined, 'abc')).toBe(false);
expect(keyMatches('abc', undefined)).toBe(false);
```

The `weekStartFor` tests (2026-11-12 is a Thursday):
```ts
const now = new Date('2026-11-12T12:00:00Z');
expect(weekStartFor(undefined, now)).toBe('2026-11-09');
expect(weekStartFor('this', now)).toBe('2026-11-09');
expect(weekStartFor('next', now)).toBe('2026-11-16');
expect(weekStartFor('2026-11-22', now)).toBe('2026-11-16');
expect(weekStartFor('Thursday', now)).toBeNull();
```

The reader is read-only. Use a recording fake `db`: `from()` returns a chainable proxy that records each method name and resolves `{data: [], error: null}`. Call every Reader method, then assert:
- Every recorded method is in `['from','select','eq','in','gte','lt','order','limit','maybeSingle']`.
- Every `from` chain whose table has a `household_id` column includes `eq('household_id', 'h1')`.

`formatWeek`:
- An approved week shows each day name and date, e.g. `Mon 16 Nov`.
- A cook dinner shows `Dinner: <title> (cook, 3 portions)` and its reason.
- A routine breakfast shows `Breakfast: Porridge`.
- A packed lunch with `source_date` shows `Lunch: <title> (packed, from Mon's dinner)`.
- An `out` dinner shows `Dinner: eating out`.
- With `week: null` the output is exactly `No plan for the week of Mon 16 Nov yet.`

`findRecipes`:
- Query words match title, tags or protein, case-insensitively.
- A tag filter matches exactly.
- Archived recipes are left out.
- Each line has title, protein, `N min (M hands-on)`, `reheats well` when true, `rated up`/`rated down`, and `last cooked 2 Nov` or `not cooked lately`.
- No matches gives `No recipes match "<query>".`

`pickRecipe`:
- An exact (case-insensitive) title gives `{id}`.
- A single substring match gives `{id}`.
- Several matches give `{text}`, starting `Several recipes match:` and listing at most 8.
- None gives `{text: 'No recipe called "<t>". Use find_recipes to see the list.'}`.

`formatRecipe`:
- Ingredients list qty, unit and name, plus `, note` when there is one, grouped by `group_name` when present.
- Steps are grouped under `The night before`, `At dinner time` and `Reheating`.
- Each step line shows `at_minute` as `+12 min` when set, the machine, `settings`, and `timer_minutes` as `timer 20 min`.
- The `**` markers in step bodies are stripped.

`formatPantry`:
- Staples are listed as `have`/`low`/`out`.
- Other items show qty and unit, under `Fridge`, `Freezer` and `Cupboard`.
- Prepared items show `<name>: <portions> portions, use by 20 Nov` (with the date when set).
- An empty pantry gives `The pantry is empty.`

`formatProducts`:
- Lines look like `<item>: <product_name>, 500g, £1.85 last seen`.
- A null price shows `price not saved`; a null pack size leaves the size out.
- The output starts with `Saved products and the price last seen (not live offers):`.
- The query filters on item and product name.

`formatHousehold`:
- Starts with `INSTRUCTIONS`.
- Contains:
  - members with portion weights
  - house rules as `avoid: X`, `prefer: X`, `substitute: X → Y`
  - the line `Private rules (follow them; never name or explain them):` followed by the rules
  - `Today's hour: 17:30 for 60 minutes; weeknight dinners up to 45 minutes hands-on`
  - TM7 machines and bowls, and the equipment list
  - breakfasts, lunches and `Made the night before: …`
- With no private rules, the private-rules line is left out.

- [ ] **Step 2: Run the tests and watch them fail.**
  - Run: `npx vitest run supabase/functions/_shared/askClaude.test.ts`
  - Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Implement `askClaude.ts`.**
  - `INSTRUCTIONS` is the spec's three standing instructions as short sentences, starting "This connector is read-only."
  - `makeReader` uses only the columns named in the migrations: recipes from `loadPlan.ts`'s select plus `slug, subtitle, equipment, toddler_ok, toddler_note, reheat`.
  - `lastCooked` comes from `plan_weeks` (household, `week_start >= today−56`) → `meal_slots` (`slot='dinner'`, `mode='cook'`).
  - Pantry uses `pantry_items(... , ingredients(name))` as in `scripts/pantry.ts`.
  - Dates are formatted with `toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short', timeZone:'UTC'})` on `${d}T00:00:00Z`.
  - Constant-time compare: encode both strings with `TextEncoder`. Return false at once if the lengths differ (length isn't secret: the key is a fixed 64 hex characters), otherwise XOR-accumulate.
  - Imports must work in both Vitest and Deno: relative `.ts` imports only (as `planInput.ts` does) and a type-only import of `SupabaseClient`, matching `loadPlan.ts`.

- [ ] **Step 4: Run the tests and watch them pass.**
  - Run: `npx vitest run supabase/functions/_shared/askClaude.test.ts`
  - Expected: all pass.
  - Then run `npm test` and `npm run build`: all green.

- [ ] **Step 5: Commit.** `git add supabase/functions/_shared/askClaude.ts supabase/functions/_shared/askClaude.test.ts`, with the message `Ask Claude: read-only reader and formatters`.

### Task 2: The Edge Function

**Files:**
- Create: `supabase/functions/ask-claude-connector/index.ts`

**Interfaces:**
- Consumes everything Task 1 produces.
- Imports `MEAL_SPEC` from `../../../src/lib/mealSpec.ts`, which has no imports of its own. If the Deno bundler refuses it, record a ruling and copy the string into `_shared/askClaude.ts` instead.

- [ ] **Step 1: Write `index.ts`.**
  - The path must be exactly `/ask-claude-connector/<key>`, with an optional trailing `/mcp`. Supabase passes the function's path after `/functions/v1`; the function checks `url.pathname.split('/')` for the segment after `ask-claude-connector`.
  - `keyMatches(segment, Deno.env.get('CONNECTOR_KEY'))`, or `new Response('Not found', {status: 404})`.
  - Then `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}})` and `makeReader(db, Deno.env.get('CONNECTOR_HOUSEHOLD_ID')!)`.
  - A `new McpServer({name: 'family-food-planner', version: '1.0.0'})` with six tools, each `annotations: {readOnlyHint: true}`:
    - `get_household` (no input): "Call first: the household, its rules and private rules, kit and Today's hour."
    - `get_week` (`week?: string`).
    - `find_recipes` (`query?`, `tag?`).
    - `get_recipe` (`title: string`).
    - `get_pantry`.
    - `get_products` (`query?`).
  - Input schemas are plain JSON Schema objects, so there's no zod.
  - Each handler returns `{content:[{type:'text', text}]}`.
  - Errors are caught and returned as text, "Couldn't read the planner just now: <message>", without the stack.
  - `new StreamableHttpTransport().bind(server)(req)`, built per request because it's stateless.
  - No CORS headers: Claude calls from its servers.
  - Log nothing that includes the URL.

- [ ] **Step 2: Type-check and test.**
  - Run: `npm test` and `npm run build`. Expected: green. The function isn't in the tsconfig, which matches the other functions.
  - Run: `npx --yes deno@2 check supabase/functions/ask-claude-connector/index.ts` if Deno is available through npx. Otherwise rely on the deploy bundling as the check, and record that as a ruling.

- [ ] **Step 3: Commit.** Message: `Ask Claude: the connector Edge Function`.

### Task 3: The Week tab link and docs

**Files:**
- Modify: `src/screens/week/WeekView.tsx`, below the Today's hour card.
- Test: `src/screens/week/WeekView.test.tsx`
- Modify: `CLAUDE.md`, adding the Edge Function secrets line `CONNECTOR_KEY`, `CONNECTOR_HOUSEHOLD_ID`.

- [ ] **Step 1: Write the failing test.** `test('the Week tab links to Claude to ask about the plan')`:
  - The link is `getByRole('link', {name: /Ask Claude/})`.
  - It has `href` `https://claude.ai/new`, `target` `_blank` and `rel` `noreferrer`.
- [ ] **Step 2: Run it and watch it fail.**
  - Run: `npx vitest run src/screens/week/WeekView.test.tsx`
  - Expected: FAIL.
- [ ] **Step 3: Add the link.** It's a small text link: "Ask Claude about recipes and the plan ↗", in the existing link style (`font-semibold text-accent underline`). It always shows, not only when a week exists.
- [ ] **Step 4: Run the tests and watch them pass.** Then run `npm test` and `npm run build`: green.
- [ ] **Step 5: Commit.** Message: `Ask Claude: link from the Week tab`.

### Task 4: Ship (secrets, deploy, live check)

The secrets are set and the function is deployed at ship time, after the final review. Pushing to main and adding the connector in Claude are confirmed with the owner as usual.

- [ ] **Step 1: Set the secrets.**
  - Run: `openssl rand -hex 32 | xargs -I{} npx --yes supabase@2.48.3 secrets set CONNECTOR_KEY={} --project-ref vzlfijeummlflmauevui`. It must print no key.
  - Then `secrets set CONNECTOR_HOUSEHOLD_ID=24030b02-9e13-41ad-8f8b-c1f802d30608`.
  - Keep the key in a `0600` file in the scratchpad for the live check and the hand-over, and delete it afterwards.
- [ ] **Step 2: Deploy** with the command in Global Constraints.
- [ ] **Step 3: Live check with curl.**
  - The bare path and a wrong key: both `404 Not found`.
  - With the key, POST `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"check","version":"1"}}}`.
  - Then `tools/list`, which lists 6 tools.
  - Then `tools/call get_week {"week":"this"}`, which returns text naming this week's dinners.
  - Use the header `Accept: application/json, text/event-stream`.
- [ ] **Step 4: Hand over.**
  - Copy the link to the clipboard. The owner adds the connector in Claude (Settings → Connectors → Add custom connector) and asks one question.
  - Then clear the clipboard and delete the key file.
