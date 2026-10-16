# Phase 4: Complete Shopping, Spar List and Sainsbury's Basket, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- The shopping list includes weekly breakfast and lunch basics (eggs, oats, milk, Greek yoghurt, fruit, sourdough…), which you can edit in Settings.
- The Shop tab has a Spar list for short-notice gaps.
- Each delivery has a "Ready for Sainsbury's" button.
- When you ask, Claude fills the Sainsbury's basket in your Chrome by following a written playbook. It records the product it chose for each item, so future weeks reuse it, and it never checks out.

**Architecture:**
- New tables: `weekly_basics`, `quick_shop_items`, `products` and `basket_runs`, all behind household RLS.
- `buildShoppingList` gains basics.
- A `scripts/basket.ts` CLI (run with `tsx`, so it can reuse `src/lib/shopping.ts`) gives Claude the list for a requested run, records product matches and closes the run.
- The playbook lives at `docs/playbooks/sainsburys-basket.md`, and `CLAUDE.md` points to it.

**Tech Stack:** As in Phases 1–3, plus the `tsx` dev dependency.

**Spec:** `docs/spec.md`: §3 (breakfast pool, home lunch, sourdough), §10 Sainsbury's, "Spar quick shop", §8 timeline.

## Global Constraints

- **Basics defaults** (editable). Weekly amounts:
  - Eggs 18 (Sunday)
  - Porridge oats about 650g (Sunday, approximate)
  - Whole milk 3L (split)
  - Greek yoghurt 1kg (split)
  - Bananas 7 (split)
  - Berries 500g (split)
  - Sourdough loaf 2 (split, so one each delivery)
  - Cucumber 1 (Tuesday)
  - Cherry tomatoes 250g (split)
- **"Split"** puts half in each delivery, with counts rounded up on Sunday. With 1 shop a week everything goes on Sunday.
- **Merging:** a basic with the same name and unit as a recipe item is merged with it (eggs from a recipe and eggs for breakfast become one line).
- **Never checkout.** The playbook may only search, add to the basket and record matches. Checkout, slot booking and payment are always yours. Each basket run needs your go-ahead in chat.
- **Choosing a pack:** take the lowest price per unit, offers included. Prefer the shortest ingredient list (the from-scratch rule) and real sourdough. Buy enough packs to cover the quantity; a pinned product always wins.
- **Secrets:** the basket CLI reads `.env` (the service key) and runs on your Mac only.

## Review Focus

1. **A basic and a recipe ingredient with the same name.** They merge into one line, with no double-buying. *(Task 2)*
2. **Pack maths across units:** 650g needed with a 1kg pack gives 1 pack; 1.2kg needed with 500g packs gives 3; 3L of milk with 2.272L (4-pint) bottles gives 2. *(Task 4)*
3. **A run requested twice.** It stays one run per delivery per week, and its status is shown. *(Tasks 1, 5)*
4. **An empty Spar item, or a very long one.** It's rejected or trimmed. *(Task 3)*
5. **Basics when there's only 1 shop a week.** All of them go on Sunday. *(Task 2)*

---

### Task 1: Schema
**Files:**
- Create `supabase/migrations/0005_shopping.sql`
- Extend `scripts/migration.test.mjs` and `scripts/check-rls.mjs`
- Update `src/lib/types.ts`

**Produces:**
- **`weekly_basics`:**
  - columns: `id, household_id, position int, name, qty numeric null, unit text, approx bool, delivery sun|tue|split`
  - unique on `(household_id, name, unit)`
- **`quick_shop_items`:** `id, household_id, name text check 1–80 chars, note text null, done bool, created_at`
- **`products`:**
  - columns: `id, household_id, item_key, product_name, product_url, pack_size numeric, pack_unit text, price numeric null, pinned bool, updated_at`
  - unique on `(household_id, item_key)`
- **`basket_runs`:**
  - columns: `id, plan_week_id, delivery sun|tue, status requested|done|failed, requested_at, finished_at null, summary text null`
  - unique on `(plan_week_id, delivery)`
- RLS on every table

- [ ] **Failing tests:**
  - a stranger can't see or change any of the four tables
  - a basket run is unique per week and delivery
  - an empty Spar name is rejected
- [ ] **Implement.** Commit with message `feat: shopping schema (basics, Spar, products, basket runs)`.

### Task 2: Weekly basics on the list
**Files:**
- Modify `src/lib/shopping.ts` and its test
- Create `src/screens/settings/Basics.tsx` and its test
- Add the route and a Settings entry
- Extend `repo` with `listBasics`, `saveBasic`, `deleteBasic`
- Extend `scripts/seed.mjs` and the seed schema with an optional `basics` list; add the defaults to the private seed

**Produces:** `buildShoppingList(slots, recipes, staples, shops, basics = [])`

- [ ] **Failing tests:**
  - **List:**
    - a "split" basic of 7 bananas gives 4 on Sunday and 3 on Tuesday
    - a "split" basic of 3L milk gives 1.5L each
    - a "tue" basic goes on Tuesday
    - with 1 shop, everything is on Sunday
    - "eggs" from a basic and from a recipe merge into one line with both reasons ("for Breakfasts & lunches, Mon …")
  - **Screen:**
    - shows the basics
    - edits a quantity and saves it
    - adds a basic
    - removes one, after confirming
- [ ] **Implement.** Commit with message `feat: weekly basics on the shopping list`.

### Task 3: Spar list
**Files:**
- Create `src/screens/shop/SparList.tsx` and its test
- Render it on the Shop tab above the deliveries
- Extend `repo` with `listQuick`, `addQuick`, `setQuickDone`, `clearQuickDone`

- [ ] **Failing tests:**
  - adding "Coriander" shows it in the list
  - an empty name can't be added
  - ticking marks it done
  - "Clear done" removes the done items
  - a name over 80 characters is trimmed
- [ ] **Implement.** Commit with message `feat: Spar list`.

### Task 4: Sainsbury's matching and the basket CLI
**Files:**
- Create `src/lib/packs.ts` and its test
- Create `scripts/basket.ts`
- Create `docs/playbooks/sainsburys-basket.md`
- Create `CLAUDE.md` (project notes, plus a pointer to the playbooks)

**Produces:**
- `toBase(qty, unit): {amount, base: 'g'|'ml'|'each'}`
- `packsNeeded(needQty, needUnit, packSize, packUnit): number|null`, which returns null when the units can't be compared
- **CLI commands:**
  - `basket list --household <id> --delivery sun|tue`: prints the JSON items for the latest requested run, with any saved product and its packs-needed
  - `basket record --household <id> --key <item_key> --name ... --url ... --size 500 --unit g --price 1.75 [--pin]`
  - `basket finish --run <id> --status done|failed --summary "..."`

- [ ] **Failing tests** for `packsNeeded`:
  - 650g with a 1kg pack gives 1
  - 1.2kg with 500g packs gives 3
  - 3L with 2.272L bottles gives 2
  - 7 bananas in a pack of 5 gives 2
  - 200g with a pack of 1 "each" gives null
  - 0 or null gives 1
- [ ] **Implement.** The playbook steps are:
  - confirm with you first
  - list the items
  - for each item: reuse the saved product, or search and pick using the rules above, then add the number of packs
  - record each choice
  - list anything unavailable, with the alternative chosen
  - finish the run with a summary
  - **never check out**
- [ ] Commit with message `feat: Sainsbury's basket playbook and CLI`.

### Task 5: Ready for Sainsbury's on the Shop tab
**Files:**
- Modify `ShopList.tsx` and its test
- Extend `repo` with `getRuns(weekId)`, `requestRun(weekId, delivery)` (upsert, setting status back to requested) and `listProducts(householdId)`

- [ ] **Failing tests:**
  - each delivery section has a "Ready for Sainsbury's" button, which calls `requestRun`
  - after that it reads "Waiting for Claude to fill the basket"
  - a finished run shows "Basket filled" with its summary
  - an item with a saved product shows the product name and pack
- [ ] **Implement.** Commit with message `feat: Ready for Sainsbury's`.

---
**Owner actions:**
1. Run `0005_shopping.sql`.
2. Re-run the household seed for the basics.
3. **First basket run:** open the Sainsbury's site and sign in in Chrome, then give me the go-ahead.
